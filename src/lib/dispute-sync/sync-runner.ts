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
import { fetchNewMessages, fetchDomainMessages } from './fetchers';
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

// Subject patterns that strongly indicate the message is an auto-reply
// / acknowledgement of a complaint — these fire even when the subject
// doesn't mention the original thread.
const AUTO_REPLY_PATTERNS = [
  /\bauto[- ]?reply\b/i,
  /\bout of office\b/i,
  /\bwe(?:'ve| have) received\b/i,
  /\bthanks? for (?:contacting|getting in touch|your email)\b/i,
  /\byour (?:case|ticket|reference|complaint|message|enquiry)\b/i,
  /\backnowledg(?:e|ment|ement)\b/i,
  /\breceipt of\b/i,
  /\bconfirm(?:ation|ing) receipt\b/i,
];

/**
 * Decide whether a domain-matched message (not from the originally linked
 * thread) belongs on THIS dispute's timeline. Prevents a separate ACI
 * thread about an unrelated invoice from polluting the user's current
 * dispute context.
 *
 * Import only if at least one of:
 *   1. Subject contains a strong auto-reply / acknowledgement pattern
 *   2. Subject or body mentions the dispute's account_number / ref
 *   3. Received within 7 days of the dispute's most recent correspondence
 *      AND (subject echoes some keyword from the dispute's subject, OR
 *      the sender looks like an auto-reply mailbox: starts with
 *      autoresponse / noreply / no-reply / donotreply / reply / support)
 */
function isDomainMessageRelevant(
  msg: { subject: string; body: string; fromAddress: string; receivedAt: Date },
  dispute: {
    issue_summary?: string | null;
    account_number?: string | null;
    thread_subject?: string | null;
    latest_activity_at?: Date | null;
  },
): { relevant: boolean; reason: string } {
  const subject = (msg.subject || '').trim();
  const body = (msg.body || '').trim();
  const haystack = `${subject}\n${body}`;

  // 1. Auto-reply patterns — scan subject AND body so a blank-subject
  // acknowledgement whose body starts "Thanks for your email, we aim
  // to respond in 10 working days" still qualifies. Many bulk
  // auto-responders deliberately leave the subject empty.
  for (const re of AUTO_REPLY_PATTERNS) {
    if (re.test(subject) || re.test(body.slice(0, 400))) {
      return { relevant: true, reason: 'auto-reply pattern' };
    }
  }

  // 2. Account / reference number match (highest signal)
  if (dispute.account_number) {
    const acct = dispute.account_number.trim();
    if (acct.length >= 4 && haystack.toLowerCase().includes(acct.toLowerCase())) {
      return { relevant: true, reason: 'account number match' };
    }
  }

  // Dedicated auto-response mailboxes (`autoresponse@`, `noreply@`,
  // `no-reply@`, `donotreply@`) exist for exactly one reason — they
  // send acknowledgements. If one sends us a message within the dispute
  // window, it\'s almost certainly the ack for something we just did.
  // This is stricter than the broad "senderLooksAutomated" below and
  // doesn\'t require a subject keyword match.
  const localPart = msg.fromAddress.split('@')[0]?.toLowerCase() ?? '';
  const isDedicatedAutoResponder = /^(autoresponse|auto-?reply|noreply|no-reply|donotreply|do-not-reply|mailer-daemon)(?:$|[.+-])/.test(localPart);
  const latest = dispute.latest_activity_at ?? null;
  const withinWindow = latest
    ? Math.abs(msg.receivedAt.getTime() - latest.getTime()) <= 7 * 86400_000
    : false;
  if (isDedicatedAutoResponder && withinWindow) {
    return { relevant: true, reason: 'dedicated auto-responder mailbox within window' };
  }

  // 3. Broader "looks automated" — senders like support@, customer@,
  // complaints@ are also frequently auto-replying, but they're also
  // legitimate human-handled mailboxes so we require a subject keyword
  // match to avoid pulling unrelated mail.
  const senderLooksAutomated = /^(reply|support|customer|help|complaints?|info|hello|contact|feedback)(?:$|[.+-])/.test(localPart);
  if (withinWindow && senderLooksAutomated) {
    const originalSubj = (dispute.thread_subject || dispute.issue_summary || '').toLowerCase();
    if (originalSubj) {
      const tokens = originalSubj
        .split(/\W+/)
        .filter((t) => t.length >= 4 && !['this', 'that', 'with', 'your', 'from', 'have', 'been'].includes(t));
      for (const t of tokens) {
        if (subject.toLowerCase().includes(t) || body.toLowerCase().includes(t)) {
          return { relevant: true, reason: `within window; matches "${t}"` };
        }
      }
    }
  }

  return { relevant: false, reason: 'not clearly related to this dispute' };
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
  let messages: Awaited<ReturnType<typeof fetchNewMessages>> = [];
  // Domain-only links (created by the "I've sent it" cancellation flow)
  // have no thread_id because the message was sent via mailto, outside
  // our OAuth scope. Skip the thread fetch in that case — the domain
  // scan below is the only mechanism that'll find the provider's reply.
  if (link.thread_id) {
    try {
      messages = await fetchNewMessages(conn, link.thread_id, since);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed';
      console.error(`[watchdog] fetch failed for link ${linkId}:`, message);
      // Still bump last_synced_at a little so we don't loop fast on persistent errors
      return { linkId, disputeId: link.dispute_id, imported: 0, error: message };
    }
  }

  // Second pass — scan for auto-responses / acknowledgements that the
  // supplier sent from a different address on the same domain. Gmail /
  // Outlook surface these as brand-new threads, so the thread-scoped
  // sync above would never see them. Relevance filter below prevents
  // unrelated threads from the same domain polluting this dispute.
  let domainMessages: Awaited<ReturnType<typeof fetchDomainMessages>> = [];
  if (link.sender_domain) {
    try {
      // On initial link we import the full thread history already, so
      // a full-history domain scan would duplicate. Anchor on the link
      // creation time when no prior sync ran.
      const domainSince = since ?? new Date(new Date(link.created_at ?? Date.now()).getTime() - 7 * 86400_000);
      domainMessages = await fetchDomainMessages(conn, link.sender_domain, domainSince, link.thread_id);
    } catch (err) {
      console.warn(`[watchdog] domain scan failed for link ${linkId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Resolve dispute context for the relevance filter — account_number
  // is the strongest signal we have.
  let disputeForRelevance: { issue_summary?: string | null; account_number?: string | null; thread_subject?: string | null; latest_activity_at?: Date | null } = {
    thread_subject: link.subject ?? null,
  };
  try {
    const { data: d } = await db
      .from('disputes')
      .select('issue_summary, account_number, last_reply_received_at, updated_at')
      .eq('id', link.dispute_id)
      .maybeSingle();
    if (d) {
      disputeForRelevance = {
        issue_summary: d.issue_summary,
        account_number: d.account_number,
        thread_subject: link.subject ?? null,
        latest_activity_at: d.last_reply_received_at ? new Date(d.last_reply_received_at) : d.updated_at ? new Date(d.updated_at) : null,
      };
    }
  } catch {
    // Fall through with defaults.
  }

  // Filter + merge. Messages we can confidently attribute get appended
  // to the same import loop as thread messages so the classifier and
  // notification path run identically.
  const domainDecisions: Array<{ messageId: string; from: string; subject: string; relevant: boolean; reason: string }> = [];
  for (const m of domainMessages) {
    const verdict = isDomainMessageRelevant(
      { subject: m.subject, body: m.body, fromAddress: m.fromAddress, receivedAt: m.receivedAt },
      disputeForRelevance,
    );
    domainDecisions.push({
      messageId: m.messageId,
      from: m.fromAddress,
      subject: m.subject,
      relevant: verdict.relevant,
      reason: verdict.reason,
    });
    if (!verdict.relevant) {
      console.log(`[watchdog] skipped domain message ${m.messageId}: ${verdict.reason}`);
      continue;
    }
    messages.push(m);
  }
  messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  // Stash a small diagnostic so the sync-replies-now endpoint can echo
  // it back in debug mode — no persistence, just this-call visibility.
  (globalThis as any).__lastWatchdogDebug = {
    linkId,
    threadId: link.thread_id,
    senderDomain: link.sender_domain,
    since: since?.toISOString() ?? null,
    threadMessagesFetched: messages.length - messages.filter((m) => domainDecisions.some((d) => d.messageId === m.messageId && d.relevant)).length,
    domainDecisions,
  };

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

    // Only bump unread_reply_count for messages received AFTER the
    // Watchdog link was created. Backfill imports (initial thread
    // history + domain-scan pulling old messages from the same
    // sender) land in the timeline for context but should not
    // inflate the "new replies" badge — they\'re not new to the
    // user. Same gate the notification path uses below.
    const linkCreatedAtForCounter = link.created_at ? new Date(link.created_at).getTime() : 0;
    if (m.receivedAt.getTime() >= linkCreatedAtForCounter) {
      await db.rpc('record_dispute_reply', {
        p_dispute_id: link.dispute_id,
        p_received_at: m.receivedAt.toISOString(),
      });
    } else {
      // Still want last_reply_received_at to reflect actual chronology
      // even for backfill, just without bumping the unread counter.
      await db
        .from('disputes')
        .update({
          last_reply_received_at: m.receivedAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', link.dispute_id)
        .lt('last_reply_received_at', m.receivedAt.toISOString());
    }

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

    // Don\'t alert on historical / backfill imports. When the user
    // links a thread we pull past messages in for context, and the
    // domain-scan pass can also turn up messages that pre-date the
    // link. Notifying on those is noise (the user already knows
    // about the 3-week-old default notice they were trying to
    // dispute). Only alert on messages that arrived AFTER the
    // Watchdog link existed.
    const linkCreatedAt = link.created_at ? new Date(link.created_at).getTime() : 0;
    const isNewSinceLink = m.receivedAt.getTime() >= linkCreatedAt;

    if (options.sendNotifications !== false && isNewSinceLink) {
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

      // Telegram alert — MUST be awaited. In Vercel serverless the function
      // instance can terminate the moment the handler returns, which means a
      // fire-and-forget Telegram call gets killed mid-HTTPS and the user never
      // receives the alert (confirmed by empty telegram_message_log rows for
      // dispute replies that did produce in-app notifications). Import lazily
      // so the module graph stays light.
      try {
        await sendTelegramSafely({
          userId: link.user_id,
          disputeId: link.dispute_id,
          correspondenceId: inserted.id,
          providerName,
          subject: m.subject,
          snippet: m.snippet,
          linkUrl,
          classification,
        });
      } catch (err) {
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
        // Swallow — a failed Telegram alert must never abort the sync loop.
      }
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
