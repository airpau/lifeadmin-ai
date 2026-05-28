/**
 * WhatsApp Template Registry — single source of truth for the Paybacker
 * WhatsApp template estate.
 *
 * ────────────────────────────────────────────────────────────────────────
 * REPLY-KEYWORD REWRITE (2026-05-28)
 * ────────────────────────────────────────────────────────────────────────
 * All "Tap to X" CTAs were replaced with reply-keyword CTAs (e.g. "Reply
 * DISPUTE / DISMISS"). This unlocks zero-click action via the WhatsApp
 * webhook router and stops Meta from flagging the templates for ambiguous
 * call-to-action language. Five brand-new templates were added at the
 * same time: paybacker_dispute_created, paybacker_payment_received,
 * paybacker_payment_outgoing, paybacker_dd_warning, paybacker_pocket_agent_reply.
 *
 * Three bodies as originally drafted opened with `{{1}}` (Meta-rejection
 * subcode 2388299) — these were prefixed with minimal static lead-ins
 * ("Price alert —", "Quick check —") to clear the rule. The pocket-agent
 * reply template was wrapped both sides ("Paybacker reply: {{1}} — reply
 * STOP to pause.") because raw `{{1}}` is rejected as too generic.
 *
 * ⚠️ TODO — VAR-NAME / VAR-COUNT CHANGES BREAK CALLERS
 * Several templates' `vars` arrays changed in name or arity. Update the
 * following call sites in a follow-up PR before merging this to main:
 *   - src/lib/whatsapp/morning-brief.ts        (paybacker_morning_summary: 4→3 vars)
 *   - src/lib/pocket-agent/dispatch.ts         (paybacker_dispute_agent_action: 3→5 vars, paybacker_alert_price_increase: 4→5)
 *   - src/app/api/cron/telegram-morning-summary/route.ts (verify summary fields)
 *   - src/lib/telegram/admin-tools.ts          (template-name references only)
 *
 * Until callers are migrated, `fillVars` will throw at runtime for any
 * stale call — that's by design; it's safer than silent var mismatch.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LESSON LEARNT (2026-04-29) — VARIABLES AT EITHER END
 * ────────────────────────────────────────────────────────────────────────
 * Meta rejects templates with variables at EITHER start OR end. Always
 * wrap variables with static text on BOTH sides. The 2026-04-27 fix only
 * caught the trailing-variable case. On 2026-04-29 Meta re-rejected
 * `paybacker_alert_price_increase` and `paybacker_alert_unusual_charge`
 * (subCode 2388299, "Variables can't be at the start or end of the
 * template.") because their bodies opened with `{{1}}`. Both are now
 * prefixed with short static lead-ins ("Heads up —" / "Spotted something —")
 * and remain at PENDING_RESUBMISSION for the next resubmit cycle.
 *
 * ────────────────────────────────────────────────────────────────────────
 * RESUBMISSION REQUIRED — see PR fix(whatsapp): trailing-variable fix
 * ────────────────────────────────────────────────────────────────────────
 *
 * Meta rejects any template whose body **ends with a `{{N}}` placeholder**
 * (or `{{N}}` followed only by punctuation). On 2026-04-27 four templates
 * were rejected for this reason and resubmitted in commit `e4097cbc` with
 * a trailing static CTA appended after the variable. The fix worked — those
 * four are now approved and live.
 *
 * The remaining 11 templates below were submitted with the same trailing-
 * variable shape and are silently failing to send (the 4 known-rejected
 * + this batch of 11 + the deferred AUTHENTICATION OTP = 16 total). The
 * `body` field on each entry now reflects the **fixed** body the founder
 * must use when resubmitting via the Twilio Content API.
 *
 * Templates needing resubmission (SIDs set to `PENDING_RESUBMISSION`):
 *   - paybacker_welcome
 *   - paybacker_alert_price_increase
 *   - paybacker_alert_renewal
 *   - paybacker_alert_unusual_charge
 *   - paybacker_alert_trial_ending
 *   - paybacker_money_recovered
 *   - paybacker_outcome_check
 *   - paybacker_morning_summary
 *   - paybacker_savings_goal_milestone
 *   - paybacker_budget_alert
 *   - paybacker_recovery_total_weekly
 *
 * Already-approved (do NOT resubmit — these are live):
 *   - paybacker_complaint_letter_ready, paybacker_dispute_reply,
 *     paybacker_reconnect_required, paybacker_better_deal_found
 *
 * Deferred (separate Meta-permission issue, not a trailing-variable issue):
 *   - paybacker_login_code (AUTHENTICATION category — see comment on entry)
 *
 * Founder workflow per pending template:
 *   1. In Twilio Console → Content Template Builder, **delete** the rejected
 *      version (or just create a new one — the rejected version becomes a
 *      dead SID).
 *   2. Create a new Content Template with the exact `body` string from this
 *      file (variables already in `{{1}}, {{2}}…` order matching `vars`).
 *   3. Submit it for WhatsApp approval (`category: UTILITY` for all here
 *      except `paybacker_better_deal_found`'s peer if you ever re-do it).
 *   4. When Meta approves (usually <24h for utility), copy the new
 *      `HX…` SID and replace `'PENDING_RESUBMISSION'` for that template.
 *   5. Commit the SID update with message `fix(whatsapp): SID for <name>`.
 *
 * Why this lives here and not in the DB:
 * - SIDs are baked into Meta's approval and never change once a template is
 *   approved. Storing them as a typed const lets call-sites get autocomplete +
 *   compile-time safety on template names.
 * - The DB-side `whatsapp_message_templates` table still tracks live
 *   approval status (pending → approved → rejected) per template via the
 *   updateTemplateStatus cron, so we don't fan messages out for a template
 *   that's been paused by Meta.
 *
 * Lookup pattern:
 *   import { TEMPLATES } from '@/lib/whatsapp/template-registry';
 *   const tpl = TEMPLATES.paybacker_alert_price_increase;
 *   await sendWhatsAppTemplate({ to, contentSid: tpl.sid, variables: tpl.fillVars({ merchant: 'Sky', ... }) });
 *
 * Adding a template:
 *   1. Run scripts/submit-whatsapp-template.ts to create + submit to Meta
 *   2. Add the entry below with the returned SID
 *   3. Add a row to whatsapp_message_templates (additive migration)
 *   4. **Never let the body start OR end on a `{{N}}` placeholder** — Meta
 *      rejects either case (subCode 2388299). Always wrap variables with
 *      static text on BOTH sides.
 */

export type TemplateCategory = 'UTILITY' | 'AUTHENTICATION' | 'MARKETING';

/** Sentinel SID used while a template is awaiting Meta resubmission/approval.
 *  Send paths must guard on this and skip dispatch (with a logged warning)
 *  rather than handing it to Twilio. */
export const PENDING_RESUBMISSION = 'PENDING_RESUBMISSION' as const;

export interface WhatsAppTemplate {
  /** Twilio Content SID — what we pass as `contentSid` when sending.
   *  May be `PENDING_RESUBMISSION` while awaiting Meta approval. */
  sid: string;
  /** Meta-side category (drives pricing per outbound message) */
  category: TemplateCategory;
  /** Variable names in order — index 1..N becomes Twilio's contentVariables */
  vars: readonly string[];
  /** Human-readable description for ops dashboards & logs */
  description: string;
  /** Pro-only? When true the cron/agent must skip non-Pro recipients */
  proOnly: boolean;
  /** Canonical body text submitted to Meta. Source-of-truth for resubmission.
   *  Must NOT end on a `{{N}}` placeholder (Meta rejects those). */
  body: string;
}

/**
 * Helper to convert a named-args object into Twilio's positional
 * contentVariables JSON. Twilio takes `{"1": "value", "2": "value"}` —
 * we let callers pass `{ merchant: "Sky", days_left: 14 }` and translate.
 */
export function fillVars<T extends WhatsAppTemplate>(
  template: T,
  args: Record<T['vars'][number], string | number>,
): Record<string, string> {
  const out: Record<string, string> = {};
  template.vars.forEach((name, idx) => {
    const v = (args as Record<string, string | number>)[name];
    if (v === undefined) {
      throw new Error(
        `[template-registry] Missing variable "${name}" for template (sid ${template.sid})`,
      );
    }
    out[String(idx + 1)] = String(v);
  });
  return out;
}

export const TEMPLATES = {
  /** Sent once after a user opts in / completes their first link */
  paybacker_welcome: {
    // Resubmission required — original body ended on `{{1}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['name'] as const,
    description: 'First-touch welcome after WhatsApp opt-in',
    proOnly: true,
    body: "Welcome to Paybacker, {{1}}. We'll flag price hikes, renewals and refunds straight here. Reply HELP any time.",
  },
  /** Triggered by price-increase-detector.ts when a sub goes up.
   *  Rewritten 2026-05-28 to reply-keyword CTA. Prefixed with "Price alert —"
   *  to clear Meta's leading-{{1}} rule. */
  paybacker_alert_price_increase: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'subscription_name', 'old_price', 'new_price', 'pct_increase'] as const,
    description: 'Subscription price hike detected',
    proOnly: true,
    body: 'Price alert — {{1}} has increased your {{2}} from £{{3}} to £{{4}} — a {{5}}% rise. Reply DISPUTE to challenge it or DISMISS to ignore.',
  },
  /** Contract end ≤30 days, looks at contract_end_date on subscriptions.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_alert_renewal: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'renewal_date', 'amount'] as const,
    description: 'Contract renewal approaching',
    proOnly: true,
    body: 'Heads up — {{1}} renews on {{2}} for £{{3}}. Reply CANCEL if you want to stop it, or KEEP to leave it running.',
  },
  /** Bank scanner spots a charge >20% above the merchant's rolling avg.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_alert_unusual_charge: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount', 'merchant', 'date'] as const,
    description: 'Bill anomaly detected',
    proOnly: true,
    body: 'Unusual charge spotted: £{{1}} from {{2}} on {{3}}. Reply DISPUTE to challenge it or EXPLAIN if you know what it is.',
  },
  /** Free trial → first auto-charge ≤3 days away.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_alert_trial_ending: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'end_date', 'monthly_price'] as const,
    description: 'Free trial ending — auto-charge incoming',
    proOnly: true,
    body: "Your free trial with {{1}} ends on {{2}}. It'll convert to £{{3}}/month unless you cancel. Reply CANCEL to stop it or KEEP to continue.",
  },
  /** Complaint letter generated and ready to download */
  paybacker_complaint_letter_ready: {
    // Resubmitted 2026-04-27 with trailing static text — Meta rejected the
    // first version (HXcb08a...) for ending in `{{2}}`. APPROVED — do not change.
    sid: 'HXb161ad4a72531943fd57068fe81074f3',
    category: 'UTILITY',
    vars: ['merchant', 'letter_url'] as const,
    description: 'Complaint letter ready (action loop)',
    proOnly: true,
    body: 'Your complaint letter to {{1}} is ready: {{2}} — review, sign and send when you are happy.',
  },
  /** Bank sync detects a refund hitting a Paybacker-tracked dispute.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_money_recovered: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount_recovered', 'supplier', 'total_recovered'] as const,
    description: 'Refund hit account — money recovered',
    proOnly: true,
    body: 'Great news — £{{1}} recovered from {{2}}! Your total recovered with Paybacker is now £{{3}}. Reply SHARE to post about it or DISPUTES to see all your cases.',
  },
  /** Watchdog email scanner finds a merchant reply to an open dispute */
  paybacker_dispute_reply: {
    // Resubmitted 2026-04-27 — first version ended with `{{3}}` URL. APPROVED — do not change.
    sid: 'HXff77c9745533c248df3b9e0ee5c7fa95',
    category: 'UTILITY',
    vars: ['merchant', 'summary', 'thread_url'] as const,
    description: 'Merchant replied to your dispute',
    proOnly: true,
    body: '{{1}} replied to your dispute: "{{2}}". Open the thread here: {{3}} — we will draft a response.',
  },
  /** T+7d nudge after dispute sent — did it work?
   *  Rewritten 2026-05-28. Prefixed with "Quick check —" to clear Meta's
   *  leading-{{1}} rule. */
  paybacker_outcome_check: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['time_elapsed', 'supplier', 'amount'] as const,
    description: 'Outcome check after dispute / cancellation',
    proOnly: true,
    body: "Quick check — {{1}} ago you sent a dispute to {{2}} for £{{3}}. Did it work? Reply WON, LOST, or PENDING and we'll update your case.",
  },
  /** Pro-only daily 8am brief.
   *  Rewritten 2026-05-28. Note: highlights_text ({{2}}) should be a
   *  punctuation-terminated sentence so the join with "Tip of the day:"
   *  reads cleanly. */
  paybacker_morning_summary: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['first_name', 'highlights_text', 'tip_of_day'] as const,
    description: 'Daily 8am morning summary (Pro only)',
    proOnly: true,
    body: 'Morning {{1}}. {{2}} Tip of the day: {{3}} Open paybacker.co.uk/dashboard for the full brief.',
  },
  /** Savings goal milestone (25/50/75/100% bands).
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_savings_goal_milestone: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['goal_name', 'pct_funded', 'saved', 'target', 'encouragement_text'] as const,
    description: 'Savings goal milestone hit',
    proOnly: true,
    body: 'Savings goal update: {{1}} is {{2}}% funded — £{{3}} of £{{4}} saved. {{5}} Reply GOALS to see all your targets.',
  },
  /** Budget approaching/over limit per category.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_budget_alert: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['pct_used', 'category', 'spent', 'limit', 'days_remaining'] as const,
    description: 'Budget threshold reached',
    proOnly: true,
    body: "Budget alert: you've used {{1}}% of your {{2}} budget this month (£{{3}} of £{{4}}). {{5}} days left. Reply BUDGET for a full breakdown.",
  },
  /** Bank/email connection token expired — needs user action */
  paybacker_reconnect_required: {
    // Resubmitted 2026-04-27 — first version ended with `{{2}}` URL. APPROVED — do not change.
    sid: 'HXaf764eed43ddd1147c48bf3fc855e0d8',
    category: 'UTILITY',
    vars: ['provider', 'reconnect_url'] as const,
    description: 'OAuth/banking token expired',
    proOnly: true,
    body: 'Your {{1}} connection has expired. Reconnect here: {{2}} — alerts pause until you do.',
  },
  /** Sunday 9am weekly recovery digest.
   *  Rewritten 2026-05-28 to reply-keyword CTA. */
  paybacker_recovery_total_weekly: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['total_recovered', 'active_count'] as const,
    description: 'Weekly recovery digest (Sunday 9am)',
    proOnly: true,
    body: "Weekly win: you've recovered £{{1}} through Paybacker disputes. {{2}} active cases still in progress. Reply DISPUTES to review them.",
  },
  /**
   * OTP for sensitive actions (password reset, plan change, etc.)
   *
   * ⚠️ DEFERRED — DO NOT SEND ⚠️
   *
   * Status (2026-04-27): SID `HXc0ebfb1775a8a713221583a70c739334` was created
   * on Twilio, but Meta REJECTED the approval submission with: "This WhatsApp
   * Business account does not have permission to create message template."
   * Confirmed via the Meta UI direct creation path as well — brand-new WABAs
   * don't get AUTHENTICATION category permission until they have a track
   * record of approved utility/marketing templates + sent message volume.
   *
   * **For v1 launch we use SMS (via the same Twilio number +447883318406)
   * and Resend email for any OTP / step-up auth flows.** This template entry
   * is kept here as a placeholder for the v1.1 retry — DO NOT call
   * sendWhatsAppTemplate with it; guard at call sites or remove the entry
   * once we know the unblock path.
   *
   * **When to retry**: once the 15 pending utility/marketing templates are
   * approved AND we've sent real outbound volume for ~1-2 weeks, Meta auto-
   * grants AUTHENTICATION category. If still blocked, open a Meta Business
   * Support Home ticket on WABA id `1480242643594364`.
   *
   * Note: this rejection is unrelated to the trailing-variable issue — the
   * AUTHENTICATION body is fine, the WABA just lacks permission. No
   * resubmission of the body needed.
   */
  paybacker_login_code: {
    sid: 'HXc0ebfb1775a8a713221583a70c739334', // ⚠️ NOT APPROVED — see comment above
    category: 'AUTHENTICATION',
    vars: ['code'] as const,
    description: 'One-time login / step-up auth code (DEFERRED — see comment, retry v1.1)',
    // Auth codes are not Pro-gated when they eventually work — anyone
    // who's enabled WhatsApp 2FA gets them.
    proOnly: false,
    body: 'Your Paybacker login code is {{1}}. It expires in 5 minutes. Do not share it with anyone.',
  },
  /** Dispute Agent recommendation push.
   *  Added 2026-05-01 with the autonomous Dispute Agent state machine.
   *  Rewritten 2026-05-28 to reply-keyword CTA with expanded vars
   *  (dispute_type, supplier, amount, action_description, reply_keyword). */
  paybacker_dispute_agent_action: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['dispute_type', 'supplier', 'amount', 'action_description', 'reply_keyword'] as const,
    description: 'Dispute Agent action recommendation (state machine)',
    proOnly: true,
    body: 'Your {{1}} dispute with {{2}} for £{{3}} needs attention — {{4}}. Reply {{5}} to proceed or SKIP to leave it for now.',
  },
  /** Confirms a new dispute has been opened against a supplier.
   *  New 2026-05-28 — replaces the previous founder-only Telegram-only
   *  flow with a Pro user WhatsApp confirmation. */
  paybacker_dispute_created: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['supplier', 'amount', 'case_ref'] as const,
    description: 'Dispute opened — confirmation + case reference',
    proOnly: true,
    body: "Dispute opened against {{1}} for £{{2}}. Your case reference is {{3}}. We'll draft your first letter within 24 hours. Reply STATUS anytime for an update.",
  },
  /** Inbound bank transaction — money received.
   *  New 2026-05-28. Used by bank-sync transaction stream when a
   *  notable inbound credit hits a tracked account (configurable
   *  threshold). */
  paybacker_payment_received: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount', 'sender', 'date', 'balance'] as const,
    description: 'Inbound payment received',
    proOnly: true,
    body: "£{{1}} received from {{2}} on {{3}}. Your account balance is now £{{4}}. Reply SUMMARY for today's full picture.",
  },
  /** Outbound bank transaction — money sent.
   *  New 2026-05-28. Counterpart to paybacker_payment_received. */
  paybacker_payment_outgoing: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount', 'recipient', 'date', 'balance'] as const,
    description: 'Outbound payment sent',
    proOnly: true,
    body: "£{{1}} sent to {{2}} on {{3}}. Remaining balance: £{{4}}. Reply SUMMARY to see today's activity.",
  },
  /** Upcoming direct debit warning.
   *  New 2026-05-28. Fired 3 days before scheduled DD collection to give
   *  the user time to ensure sufficient balance. */
  paybacker_dd_warning: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'amount', 'date'] as const,
    description: 'Direct debit collection reminder',
    proOnly: true,
    body: 'Direct debit reminder: {{1}} will collect £{{2}} from your account on {{3}}. Make sure you have enough to cover it. Reply BUDGET to check your balance.',
  },
  /** Pocket Agent fallback reply (post-24h window).
   *  New 2026-05-28. Used when the AI agent needs to reply to a user
   *  query but the WhatsApp 24h customer-service window has expired —
   *  any reply must be wrapped in a template. Body is wrapped with
   *  "Paybacker reply:" prefix and "— reply STOP to pause" suffix to
   *  clear Meta's "variable at start AND end" rule (a single-var
   *  template needs both sides padded with static text). */
  paybacker_pocket_agent_reply: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['reply_text'] as const,
    description: 'Pocket Agent fallback reply (post-24h window)',
    proOnly: true,
    body: 'Paybacker reply: {{1}} — reply STOP to pause.',
  },
  /** Switchcraft-style cheaper-deal nudge (MARKETING — needs separate opt-in) */
  paybacker_better_deal_found: {
    // Resubmitted 2026-04-27 — first version ended with `{{3}}` URL. APPROVED — do not change.
    sid: 'HXef2f3aa52beec5a2591154096faf741b',
    category: 'MARKETING',
    vars: ['category', 'saving_per_year', 'switch_url'] as const,
    description: 'Cheaper provider found in user category',
    proOnly: true,
    body: 'We found a cheaper {{1}} deal — could save you about £{{2}}/year. See it here: {{3}} — switch in a couple of taps.',
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type TemplateName = keyof typeof TEMPLATES;
