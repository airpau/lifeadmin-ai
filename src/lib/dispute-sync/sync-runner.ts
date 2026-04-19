/**
 * Shared sync runner used by both the Watchdog cron and the user-triggered
 * manual-sync endpoint. Given a linked dispute_email_thread row, pulls new
 * messages from the provider, inserts them into correspondence, updates the
 * dispute counters, and fans out notifications (in-app + Telegram).
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §6
 */

import { createClient } from '@supabase/supabase-js';
import { fetchNewMessages } from './fetchers';
import type { EmailConnection } from './types';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface SyncResult {
  linkId: string;
  disputeId: string;
  imported: number;
  error?: string;
}

/**
 * Run a sync for a single linked thread. Returns a summary the caller can
 * pass back to the UI or aggregate in the cron's response.
 *
 * Designed to be idempotent — the unique(dispute_id, supplier_message_id)
 * index on correspondence makes duplicate imports a no-op.
 */
export async function syncLinkedThread(
  linkId: string,
  options: { sendNotifications?: boolean } = { sendNotifications: true },
): Promise<SyncResult> {
  const db = admin();

  const { data: link, error: linkErr } = await db
    .from('dispute_watchdog_links')
    .select('*, disputes(provider_name), email_connections(*)')
    .eq('id', linkId)
    .maybeSingle();

  if (linkErr || !link) {
    return { linkId, disputeId: '', imported: 0, error: 'Link not found' };
  }
  if (!link.sync_enabled) {
    return { linkId, disputeId: link.dispute_id, imported: 0, error: 'Sync disabled' };
  }

  const conn = link.email_connections as EmailConnection | null;
  if (!conn) {
    return { linkId, disputeId: link.dispute_id, imported: 0, error: 'Email connection missing' };
  }
  if (conn.status !== 'active') {
    return {
      linkId,
      disputeId: link.dispute_id,
      imported: 0,
      error: `Connection status is ${conn.status}`,
    };
  }

  const since = link.last_synced_at ? new Date(link.last_synced_at) : null;
  let messages: Awaited<ReturnType<typeof fetchNewMessages>>;
  try {
    messages = await fetchNewMessages(conn, link.thread_id, since);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fetch failed';
    console.error(`[watchdog] fetch failed for link ${linkId}:`, message);
    // Still bump last_synced_at a little so we don't loop fast on persistent errors
    return { linkId, disputeId: link.dispute_id, imported: 0, error: message };
  }

  const providerName = (link.disputes as { provider_name?: string } | null)?.provider_name ?? 'supplier';
  const linkUrl = `/dashboard/complaints?dispute=${link.dispute_id}`;

  let imported = 0;
  for (const m of messages) {
    // Insert; on dedupe conflict the row is silently skipped
    const { data: inserted, error } = await db
      .from('correspondence')
      .insert({
        dispute_id: link.dispute_id,
        user_id: link.user_id,
        entry_type: 'company_email',
        title: m.subject || null,
        content: m.body,
        summary: m.snippet,
        sender_address: m.fromAddress,
        sender_name: m.fromName || null,
        supplier_message_id: m.messageId,
        detected_from_email: true,
        email_thread_id: link.id,
        entry_date: m.receivedAt.toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // Unique-violation on dedupe index is expected and fine
      if (!String(error.message).toLowerCase().includes('duplicate')) {
        console.warn(`[watchdog] insert warning for ${m.messageId}:`, error.message);
      }
      continue;
    }
    if (!inserted) continue;

    imported++;

    // Bump dispute counters atomically
    const { error: rpcError } = await db.rpc('record_dispute_reply', {
      p_dispute_id: link.dispute_id,
      p_received_at: m.receivedAt.toISOString(),
    });
    if (rpcError) {
      console.warn(`[watchdog] record_dispute_reply failed for ${m.messageId}:`, rpcError.message);
    }

    if (options.sendNotifications !== false) {
      // In-app notification
      const { error: notifError } = await db.from('user_notifications').insert({
        user_id: link.user_id,
        type: 'dispute_reply',
        title: `New reply from ${providerName}`,
        body: m.snippet,
        link_url: linkUrl,
        dispute_id: link.dispute_id,
        metadata: {
          subject: m.subject,
          from: m.fromAddress,
          messageId: m.messageId,
        },
      });
      if (notifError) {
        console.warn(`[watchdog] notification insert failed for ${m.messageId}:`, notifError.message);
      }

      // Telegram alert — fire-and-forget. Import lazily so the module graph stays light.
      sendTelegramSafely({
        userId: link.user_id,
        disputeId: link.dispute_id,
        providerName,
        subject: m.subject,
        snippet: m.snippet,
        linkUrl,
      }).catch((err) =>
        console.warn('[watchdog] telegram send failed:', err instanceof Error ? err.message : err),
      );
    }
  }

  await db
    .from('dispute_watchdog_links')
    .update({
      last_synced_at: new Date().toISOString(),
      last_message_date:
        messages.length > 0
          ? messages[messages.length - 1].receivedAt.toISOString()
          : link.last_message_date,
    })
    .eq('id', link.id);

  return { linkId: link.id, disputeId: link.dispute_id, imported };
}

/**
 * Fire a Telegram alert if the user has Watchdog alerts enabled.
 * Kept isolated so its failure can't break the sync.
 */
async function sendTelegramSafely(args: {
  userId: string;
  providerName: string;
  subject: string;
  snippet: string;
  linkUrl: string;
  disputeId: string;
}): Promise<void> {
  const db = admin();

  // Check alert preferences + active Telegram session
  const { data: prefs } = await db
    .from('telegram_alert_preferences')
    .select('dispute_replies')
    .eq('user_id', args.userId)
    .maybeSingle();

  // Default ON when preference row missing (per approved plan §7)
  if (prefs && prefs.dispute_replies === false) return;

  const { data: session } = await db
    .from('telegram_sessions')
    .select('telegram_chat_id, is_active')
    .eq('user_id', args.userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!session?.telegram_chat_id) return;

  // Late import — only load the Telegram helper when we actually send.
  const { sendProactiveAlert } = await import('../telegram/user-bot');
  const preview = args.snippet.length > 200
    ? args.snippet.slice(0, 200) + '…'
    : args.snippet;

  await sendProactiveAlert({
    chatId: Number(session.telegram_chat_id),
    issue: {
      id: args.disputeId,
      title: `🔔 New reply from ${args.providerName}`,
      detail: `*Subject:* ${args.subject}\n\n_${preview}_\n\nTap below to open in Paybacker, or reply *draft* to generate your next letter.`,
      issue_type: 'dispute_reply',
    },
    showFollowUpButtons: false,
  });
}
