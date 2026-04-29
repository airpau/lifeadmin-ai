/**
 * Shared sync runner used by both the Watchdog cron and the user-triggered
 * manual-sync endpoint. Given a linked dispute_email_thread row, pulls new
 * messages from the provider, inserts them into correspondence, updates the
 * dispute counters, and fans out notifications (in-app + Telegram).
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §6
 *
 * Intelligence layer (added 2026-04-20):
 *   Each newly-imported supplier reply is classified via Claude before we
 *   notify the user. The classification decides (a) whether the notification
 *   title leads with "Action needed" vs "FYI: holding reply", (b) the emoji
 *   and urgency colour, and (c) a one-sentence rationale we surface in-app.
 *   See src/lib/dispute-sync/reply-classifier.ts — flagged by
 *   WATCHDOG_CLASSIFIER_ENABLED and safe to fail (falls back to neutral copy).
 */

import { createClient } from '@supabase/supabase-js';
import { fetchNewMessages } from './fetchers';
import type { EmailConnection } from './types';
import {
  classifyReply,
  categoryLabel,
  categoryEmoji,
  CLASSIFIER_VERSION,
  type ReplyClassification,
} from './reply-classifier';

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
    .select('*, disputes(provider_name, provider_type, issue_type, issue_summary), email_connections(*)')
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

  const disputeRow = link.disputes as {
    provider_name?: string;
    provider_type?: string;
    issue_type?: string;
    issue_summary?: string;
  } | null;
  const providerName = disputeRow?.provider_name ?? 'supplier';
  const disputeTitle = disputeRow?.issue_summary ?? null;
  const disputeCategory = disputeRow?.issue_type ?? disputeRow?.provider_type ?? null;
  const linkUrl = `/dashboard/complaints?dispute=${link.dispute_id}`;

  // Pull the user's most recent letter to this supplier (if any) so the
  // classifier can reason about whether the reply answers what the user asked.
  let userLast5Letters = '';
  try {
    const { data: recentLetters } = await db
      .from('correspondence')
      .select('content, entry_date')
      .eq('dispute_id', link.dispute_id)
      .in('entry_type', ['ai_letter', 'user_note'])
      .order('entry_date', { ascending: false })
      .limit(1);
    const latest = recentLetters?.[0];
    if (latest?.content) {
      userLast5Letters = String(latest.content).slice(0, 1500);
    }
  } catch {
    // Non-fatal — classifier will just work without the letter context.
  }

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
    await db.rpc('record_dispute_reply', {
      p_dispute_id: link.dispute_id,
      p_received_at: m.receivedAt.toISOString(),
    });

    // --- Intelligence layer -----------------------------------------------
    // Classify the reply so the notification can tell the user whether they
    // need to act, and why. All failures degrade gracefully to neutral copy.
    let classification: ReplyClassification | null = null;
    try {
      classification = await classifyReply({
        disputeTitle,
        disputeProvider: providerName,
        disputeCategory,
        userLast5Letters,
        supplierSubject: m.subject,
        supplierFromName: m.fromName,
        supplierFromAddress: m.fromAddress,
        supplierBody: m.body,
        supplierReceivedAt: m.receivedAt,
      });

      await db
        .from('correspondence')
        .update({
          ai_category: classification.category,
          ai_respond_needed: classification.respondNeeded,
          ai_urgency: classification.urgency,
          ai_rationale: classification.rationale,
          ai_suggested_reply_context: classification.suggestedContext || null,
          ai_classified_at: new Date().toISOString(),
          ai_classifier_version: CLASSIFIER_VERSION,
        })
        .eq('id', inserted.id);
    } catch (err) {
      console.warn(
        '[watchdog] classification failed:',
        err instanceof Error ? err.message : err,
      );
    }

    if (options.sendNotifications !== false) {
      const notifCopy = buildNotificationCopy({
        providerName,
        snippet: m.snippet,
        classification,
      });

      // In-app notification
      await db.from('user_notifications').insert({
        user_id: link.user_id,
        type: classification?.respondNeeded ? 'dispute_reply_action' : 'dispute_reply',
        title: notifCopy.title,
        body: notifCopy.body,
        link_url: linkUrl,
        dispute_id: link.dispute_id,
        metadata: {
          subject: m.subject,
          from: m.fromAddress,
          messageId: m.messageId,
          ai_category: classification?.category ?? null,
          ai_urgency: classification?.urgency ?? null,
          ai_respond_needed: classification?.respondNeeded ?? null,
        },
      });

      // Telegram alert — fire-and-forget. Import lazily so the module graph stays light.
      sendTelegramSafely({
        userId: link.user_id,
        disputeId: link.dispute_id,
        correspondenceId: inserted.id,
        providerName,
        subject: m.subject,
        snippet: m.snippet,
        linkUrl,
        classification,
      }).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[watchdog] telegram send failed:', msg);
        try {
          await db.from('business_log').insert({
            category: 'telegram_error',
            title: 'Watchdog dispute-reply alert failed',
            content:
              `Could not send Telegram alert for dispute ${link.dispute_id} (correspondence ${inserted.id}). ` +
              `Provider: ${providerName}. Error: ${msg}`,
            created_by: 'watchdog-sync-runner',
          });
        } catch (logErr) {
          console.warn(
            '[watchdog] business_log insert failed:',
            logErr instanceof Error ? logErr.message : logErr,
          );
        }
      });
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
 * Craft the in-app notification title/body given the classification.
 * Designed to be readable at a glance in the bell dropdown.
 */
function buildNotificationCopy(args: {
  providerName: string;
  snippet: string;
  classification: ReplyClassification | null;
}): { title: string; body: string } {
  const { providerName, snippet, classification } = args;

  if (!classification || classification.category === 'other') {
    return {
      title: `New reply from ${providerName}`,
      body: snippet,
    };
  }

  const emoji = categoryEmoji(classification.category, classification.urgency);
  const label = categoryLabel(classification.category);
  const actionFlag = classification.respondNeeded ? ' · action needed' : '';

  return {
    title: `${emoji} ${providerName} — ${label}${actionFlag}`,
    body: classification.rationale || snippet,
  };
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
  correspondenceId: string;
  classification: ReplyClassification | null;
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
  const { sendProactiveAlert, escapeMarkdown } = await import('../telegram/user-bot');
  const rawPreview = args.snippet.length > 200
    ? args.snippet.slice(0, 200) + '…'
    : args.snippet;

  // Supplier subjects routinely carry ticket tags like "[ ref:!00D0Y0rFw3... ]"
  // which Telegram's legacy MarkdownV1 parser treats as an unbalanced link and
  // rejects with HTTP 400. Escape any special chars before embedding.
  const safeSubject = escapeMarkdown(args.subject);
  const safePreview = escapeMarkdown(rawPreview);
  const safeProvider = escapeMarkdown(args.providerName);

  const c = args.classification;
  const emoji = c ? categoryEmoji(c.category, c.urgency) : '🔔';
  const label = c ? categoryLabel(c.category) : 'New reply';
  const actionLine = c?.respondNeeded
    ? '\n\n⚠️ *Action needed* — tap *✍️ Draft response* below and I\'ll write your reply.'
    : c?.category === 'holding_reply'
      ? '\n\n_No action needed — they\'re still looking into it._'
      : c?.category === 'resolution'
        ? '\n\n_Looks resolved — tap ✅ Mark as replied if you\'re happy._'
        : '';

  const aiLine = c?.rationale
    ? `\n\n🧠 *Paybacker read:* ${escapeMarkdown(c.rationale)}`
    : '';

  await sendProactiveAlert({
    chatId: Number(session.telegram_chat_id),
    issue: {
      id: args.disputeId,
      correspondenceId: args.correspondenceId,
      title: `${emoji} ${safeProvider} — ${label}`,
      detail: `*Subject:* ${safeSubject}\n\n_${safePreview}_${aiLine}${actionLine}`,
      issue_type: c?.respondNeeded ? 'dispute_reply_action' : 'dispute_reply',
    },
    showFollowUpButtons: false,
  });
}
