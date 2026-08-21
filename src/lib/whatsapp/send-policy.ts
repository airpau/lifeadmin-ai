/**
 * WhatsApp send policy — the cost/fatigue gate in front of every paid
 * template send (2026-08-16 rework).
 *
 * WHY: a busy Pro user could receive 8-20 individually-billed WhatsApp
 * template messages a day (£0.003-£0.06 each). Cost and fatigue. The
 * target end state is: morning brief (07:30) + ONE evening digest
 * (18:00) + rare genuinely urgent immediates.
 *
 * `sendWhatsAppTemplate` in ./index.ts is the single chokepoint every
 * path uses, so the policy lives behind one call — `decideSend()` — and
 * every caller inherits it for free.
 *
 * Gate order (first match wins):
 *   1. AUTHENTICATION (OTP) + transactional
 *      templates (welcome / opt-out / Pocket
 *      Agent reply / morning brief)             → always send, never counted.
 *   2. MARKETING category                      → blocked unless
 *      whatsapp_sessions.marketing_opt_in_at is set AND
 *      last_marketing_template_at is null / older than 24h. Marketing is
 *      NEVER folded into the utility digest (PECR: different lawful basis).
 *   3. Quiet hours 22:00-07:30 Europe/London   → enqueue (unless allowUrgent).
 *   4. Inside the 24h service window + caller
 *      supplied a plain-text equivalent         → FREE in-window text.
 *   5. >= MAX_PAID_TEMPLATES_PER_DAY paid
 *      template sends already today             → enqueue (unless allowUrgent).
 *   6. Otherwise                                → paid template send.
 *
 * Enqueued items land in `whatsapp_alert_queue` with a 'digest:' dedup
 * prefix and are delivered as ONE sectioned message by
 * /api/cron/whatsapp-evening-digest at 18:00 UTC.
 *
 * Every helper here is fail-open on infrastructure errors: a Postgres
 * hiccup must never silently swallow a user's alert. The one exception
 * is the marketing gate, which fails CLOSED — sending marketing without
 * a verified opt-in is a compliance breach, not an inconvenience.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from './template-registry';
import { isWithinSessionWindow } from './session-window';
import {
  enqueueDigestItem,
  renderTemplatePreview,
  type DigestSection,
} from './alert-queue';

/** Hard cap on PAID (out-of-window) template sends per user per calendar day. */
export const MAX_PAID_TEMPLATES_PER_DAY = 2;

/** Quiet hours in Europe/London wall-clock minutes-since-midnight. */
const QUIET_START_MIN = 22 * 60;      // 22:00
const QUIET_END_MIN = 7 * 60 + 30;    // 07:30

/** Minimum gap between two MARKETING template sends to the same user. */
const MARKETING_MIN_GAP_MS = 24 * 60 * 60 * 1000;

/**
 * Templates that are RESPONSES to something the user just did, not
 * proactive alerts. Deferring these to an evening digest would be
 * nonsense (a welcome message arriving 9 hours after opt-in, an opt-out
 * confirmation that never lands, a Pocket Agent reply the user is
 * actively waiting for). They bypass quiet hours and the daily cap —
 * exactly the same list alert-loop.ts excludes from alert measurement.
 *
 * `paybacker_pocket_agent_reply` is also the wrapper the 07:30 morning
 * brief and the 18:00 evening digest use, so the consolidated messages
 * can never be suppressed by the cap they exist to enforce.
 */
const TRANSACTIONAL_BYPASS = new Set<string>([
  'paybacker_welcome',
  'paybacker_opted_out',
  'paybacker_login_code',
  'paybacker_pocket_agent_reply',
  // The 07:30 consolidated brief — one of the two messages this whole
  // rework is designed to protect.
  'paybacker_morning_summary',
]);

export type SendDecisionAction = 'template' | 'text' | 'defer' | 'block';

export interface SendDecision {
  action: SendDecisionAction;
  /** Machine-readable reason, surfaced in the synthetic providerMessageId. */
  reason: string;
  /** Resolved user id (null when the phone could not be mapped to a user). */
  userId: string | null;
  /** Body to send when action === 'text'. */
  text?: string;
}

export interface SendPolicyInput {
  phone: string;
  templateName: string;
  parameters: string[];
  userId?: string | null;
  eventType?: string;
  /** Plain-text equivalent — enables the free in-window path. */
  textFallback?: string;
  /** Genuinely urgent: bypasses quiet hours and the daily cap. */
  allowUrgent?: boolean;
  /** Stable dedup key for the digest queue (prefixed 'digest:' on write). */
  dedupKey?: string;
  /** Digest section override; derived from eventType/template otherwise. */
  digestSection?: DigestSection;
  /** £ magnitude used to rank "top items" inside a digest section. */
  amount?: number;
  /** Provider/merchant name — bolded in the digest bullet when deferred. */
  provider?: string;
  /** Specific dashboard deep link for the digest item when deferred. */
  url?: string;
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function templateCategory(name: string): string | null {
  const tpl = (TEMPLATES as Record<string, { category?: string }>)[name];
  return tpl?.category ?? null;
}

/** Minutes since midnight, Europe/London. */
export function londonMinutes(d: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hh * 60 + mm;
  } catch {
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

/** True between 22:00 and 07:30 Europe/London (window crosses midnight). */
export function isQuietHours(d: Date = new Date()): boolean {
  const m = londonMinutes(d);
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

/** Start of today in Europe/London, as an ISO instant. */
function startOfLondonDayIso(now: Date = new Date()): string {
  return new Date(now.getTime() - londonMinutes(now) * 60_000).toISOString();
}

/** Map an outbound phone to its Paybacker user id. */
async function resolveUserId(
  sb: SupabaseClient,
  phone: string,
): Promise<string | null> {
  try {
    const bare = phone.replace(/^whatsapp:/, '');
    const { data } = await sb
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('whatsapp_phone', bare)
      .maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Count today's PAID (out-of-window) template sends for a user.
 *
 * Reads `whatsapp_message_log` for outbound rows with
 * message_type='template'. Several call sites log their own row AND the
 * facade logs one, so we count DISTINCT provider_message_id — rows
 * without an id are counted individually (conservative).
 *
 * Free in-window texts are message_type='text' and never counted.
 * Fails open (returns 0) so a lookup error can't mute a user.
 */
export async function countPaidTemplateSendsToday(
  sb: SupabaseClient,
  userId: string,
): Promise<number> {
  try {
    const { data, error } = await sb
      .from('whatsapp_message_log')
      .select('provider_message_id, template_name')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .eq('message_type', 'template')
      .gte('created_at', startOfLondonDayIso())
      .limit(200);
    if (error || !Array.isArray(data)) return 0;
    const seen = new Set<string>();
    let count = 0;
    for (const row of data as Array<{
      provider_message_id: string | null;
      template_name: string | null;
    }>) {
      // Exempt sends don't consume the cap they bypass.
      if (
        row.template_name &&
        (templateCategory(row.template_name) === 'AUTHENTICATION' ||
          TRANSACTIONAL_BYPASS.has(row.template_name))
      ) {
        continue;
      }
      const id = row.provider_message_id;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * MARKETING frequency + consent gate. Documented in migration
 * 20260429100000_whatsapp_marketing_optin_and_freq_cap.sql but never
 * implemented until now.
 *
 * Fails CLOSED — if we cannot prove consent we do not send.
 */
async function marketingAllowed(
  sb: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; reason: string }> {
  try {
    const { data, error } = await sb
      .from('whatsapp_sessions')
      .select('marketing_opt_in_at, last_marketing_template_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return { allowed: false, reason: 'marketing_no_session' };
    if (!data.marketing_opt_in_at) return { allowed: false, reason: 'marketing_no_opt_in' };
    const last = data.last_marketing_template_at
      ? new Date(data.last_marketing_template_at as string).getTime()
      : 0;
    if (last && Date.now() - last < MARKETING_MIN_GAP_MS) {
      return { allowed: false, reason: 'marketing_freq_cap' };
    }
    return { allowed: true, reason: 'marketing_ok' };
  } catch {
    return { allowed: false, reason: 'marketing_check_failed' };
  }
}

/** Stamp `last_marketing_template_at` after a marketing send. */
export async function recordMarketingSend(
  userId: string,
  client?: SupabaseClient | null,
): Promise<void> {
  const sb = client ?? admin();
  if (!sb) return;
  try {
    await sb
      .from('whatsapp_sessions')
      .update({ last_marketing_template_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (e) {
    console.warn('[whatsapp/send-policy] marketing stamp failed:', (e as Error)?.message ?? e);
  }
}

/**
 * The gate. Returns what the facade should actually do with this send.
 * Never throws.
 */
export async function decideSend(input: SendPolicyInput): Promise<SendDecision> {
  const category = templateCategory(input.templateName);

  // 1. OTP / auth codes and conversational responses are exempt from
  //    every gate — they answer something the user just did.
  if (category === 'AUTHENTICATION' || TRANSACTIONAL_BYPASS.has(input.templateName)) {
    return { action: 'template', reason: 'transactional_exempt', userId: input.userId ?? null };
  }

  const sb = admin();
  if (!sb) {
    // No admin client (local scripts / tests) — behave exactly as before.
    return { action: 'template', reason: 'no_admin_client', userId: input.userId ?? null };
  }

  const userId = input.userId ?? (await resolveUserId(sb, input.phone));
  if (!userId) {
    // Cannot attribute the send to a user — no cap, no queue. Fail open.
    return { action: 'template', reason: 'user_unresolved', userId: null };
  }

  // 2. Marketing consent + frequency cap. Fails closed; never digested.
  if (category === 'MARKETING') {
    const m = await marketingAllowed(sb, userId);
    return m.allowed
      ? { action: 'template', reason: m.reason, userId }
      : { action: 'block', reason: m.reason, userId };
  }

  const urgent = input.allowUrgent === true;

  // 3. Quiet hours.
  if (!urgent && isQuietHours()) {
    return (await enqueue(sb, userId, input, 'quiet_hours'))
      ? { action: 'defer', reason: 'quiet_hours', userId }
      : { action: 'template', reason: 'quiet_hours_enqueue_failed', userId };
  }

  // 4. Window-first: a free in-window text beats a paid template every time.
  if (input.textFallback && (await isWithinSessionWindow({ userId }, sb))) {
    return { action: 'text', reason: 'in_window_free_text', userId, text: input.textFallback };
  }

  // 5. Hard daily cap on paid templates.
  if (!urgent) {
    const usedToday = await countPaidTemplateSendsToday(sb, userId);
    if (usedToday >= MAX_PAID_TEMPLATES_PER_DAY) {
      return (await enqueue(sb, userId, input, 'daily_cap'))
        ? { action: 'defer', reason: 'daily_cap', userId }
        : { action: 'template', reason: 'daily_cap_enqueue_failed', userId };
    }
  }

  return { action: 'template', reason: urgent ? 'urgent' : 'under_cap', userId };
}

/**
 * Queue a deferred send for the evening digest and log the deferral.
 * Returns true when the item is safely in the queue (or already was) —
 * only then may the caller skip the send.
 */
async function enqueue(
  sb: SupabaseClient,
  userId: string,
  input: SendPolicyInput,
  reason: string,
): Promise<boolean> {
  const line =
    input.textFallback ??
    renderTemplatePreview(input.templateName, input.parameters) ??
    `${input.eventType ?? input.templateName}: ${input.parameters.join(' · ')}`;

  const dedupKey =
    input.dedupKey ??
    `${input.templateName}:${input.parameters.join('|')}:${new Date()
      .toISOString()
      .slice(0, 10)}`;

  const outcome = await enqueueDigestItem(sb, {
    userId,
    eventType: input.eventType ?? input.templateName,
    section: input.digestSection,
    line,
    amount: input.amount,
    provider: input.provider,
    url: input.url,
    templateName: input.templateName,
    parameters: input.parameters,
    dedupKey,
  });

  if (outcome === 'error') return false;

  console.log(
    `[whatsapp/send-policy] deferred ${input.templateName} for ${userId} (${reason}, ${outcome})`,
  );
  // Auditable trail per CLAUDE.md rule 6 — fire-and-forget.
  void sb
    .from('business_log')
    .insert({
      category: 'whatsapp_send_deferred',
      title: `WhatsApp send deferred to evening digest: ${input.templateName}`,
      content: JSON.stringify({
        user_id: userId,
        template_name: input.templateName,
        event_type: input.eventType ?? null,
        reason,
        queue_outcome: outcome,
      }),
    })
    .then(undefined, () => {
      /* logging must never break the send path */
    });

  return true;
}
