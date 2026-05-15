/**
 * WhatsApp Template Registry — single source of truth for the 16 templates
 * submitted to Meta on 2026-04-27.
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

/**
 * Declarative quick-reply button on a template.
 *
 * `id` is the stable payload returned to us by the webhook when the user
 * taps the button (Meta puts it in `button_reply.id`; on the Twilio
 * `twilio/quick-reply` Content type each button has its own `id` field).
 * `title` is what shows on the button — capped at 20 chars by Meta, 25 by
 * Twilio; clipped to 20 for safety.
 *
 * Declaring buttons here doesn't *send* them — that's a property of the
 * approved template at the provider. This is the typed source of truth
 * the resubmission script and the inbound payload router agree on, so
 * when Meta re-approves a template with buttons we already know:
 *   1. which template carries which button labels and ids
 *   2. what the inbound webhook should map button taps to
 */
export interface TemplateButton {
  /** Stable id (max ~256 chars, but keep it short and routing-relevant). */
  id: string;
  /** Display title — clipped to 20 chars at send time. */
  title: string;
}

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
  /**
   * Optional quick-reply buttons attached to the template. When present:
   *   - The template at Meta MUST have matching buttons in the same order.
   *   - Inbound taps come back via the webhook as
   *     kind='interactive' + interactivePayload=<id> + text=<title>.
   *   - The agent reads the title as the user's message — so a "Won"
   *     button on the outcome_check template fires the same intent as
   *     the user typing "won" (and the 793a345c intelligence resolves
   *     the right dispute).
   * When absent the template is plain text-only.
   */
  buttons?: readonly TemplateButton[];
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
  /** Triggered by price-increase-detector.ts when a sub goes up */
  paybacker_alert_price_increase: {
    // Resubmission required — original body ended on `{{4}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'old_price', 'new_price', 'effective_date'] as const,
    description: 'Subscription price hike detected',
    proOnly: true,
    body: 'Heads up — {{1}} is going up from £{{2}} to £{{3}} on {{4}}. Tap to switch or cancel.',
    // Button taps land in the webhook with these titles in `text`:
    //   "Dismiss"            → agent calls dismiss_price_alert
    //   "Draft dispute"      → agent calls draft_dispute_letter for this merchant
    // Both intents already exist in tool-handlers.ts; the agent picks
    // them up naturally because the parser surfaces the title as text.
    buttons: [
      { id: 'price_dismiss', title: 'Dismiss' },
      { id: 'price_draft_dispute', title: 'Draft dispute' },
    ] as const,
  },
  /** Contract end ≤30 days, looks at contract_end_date on subscriptions */
  paybacker_alert_renewal: {
    // Resubmission required — original body ended on `{{3}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['service', 'days_left', 'monthly_cost'] as const,
    description: 'Contract renewal approaching',
    proOnly: true,
    body: 'Your {{1}} contract renews in {{2}} days at £{{3}}/month. Tap to review or cancel.',
    // "Cancel"             → generate_cancellation_email
    // "Keep it"            → no-op acknowledgement
    // "Find alternatives"  → agent surfaces deals + suggests switch
    buttons: [
      { id: 'renewal_cancel', title: 'Cancel' },
      { id: 'renewal_keep', title: 'Keep it' },
      { id: 'renewal_alternatives', title: 'Find alternatives' },
    ] as const,
  },
  /** Bank scanner spots a charge >20% above the merchant's rolling avg */
  paybacker_alert_unusual_charge: {
    // Resubmission required — original body ended on `{{4}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'current_amount', 'average_amount', 'percent_higher'] as const,
    description: 'Bill anomaly detected',
    proOnly: true,
    body: 'Spotted something — {{1}} just charged £{{2}} vs your usual £{{3}} — that is {{4}}% higher. Tap to dispute.',
  },
  /** Free trial → first auto-charge ≤3 days away */
  paybacker_alert_trial_ending: {
    // Resubmission required — original body ended on `{{3}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['service', 'days_left', 'auto_charge_amount'] as const,
    description: 'Free trial ending — auto-charge incoming',
    proOnly: true,
    body: 'Your {{1}} trial ends in {{2}} days — you will be charged £{{3}}. Tap to cancel before then.',
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
  /** Bank sync detects a refund hitting a Paybacker-tracked dispute */
  paybacker_money_recovered: {
    // Resubmission required — original body ended on `{{3}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount', 'merchant', 'lifetime_total'] as const,
    description: 'Refund hit account — money recovered',
    proOnly: true,
    body: '£{{1}} from {{2}} just landed in your account. Lifetime recovered: £{{3}}. Tap to see the breakdown.',
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
  /** T+7d nudge after dispute sent — did it work? */
  paybacker_outcome_check: {
    // Resubmission required — original body ended on `{{2}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'action_type'] as const,
    description: 'Outcome check after dispute / cancellation',
    proOnly: true,
    body: 'A week ago you sent a {{2}} to {{1}}. Did it work? Tap to log the outcome.',
    // Taps surface as text — and the 793a345c natural-language outcome
    // intelligence in tool-handlers.ts already understands "won", "lost"
    // and "still waiting" against the most recent dispute. So:
    //   "Won"           → resolved_won + writes recovered_amount_gbp
    //   "Lost"          → resolved_lost
    //   "Still waiting" → awaiting_response (and may re-arm the nudge)
    buttons: [
      { id: 'outcome_won', title: 'Won' },
      { id: 'outcome_lost', title: 'Lost' },
      { id: 'outcome_waiting', title: 'Still waiting' },
    ] as const,
  },
  /**
   * Pro-only daily 8am brief.
   *
   * ⚠️ DEPRECATED BODY — DO NOT SEND ⚠️
   *
   * The Meta-approved body for this SID is the original launch placeholder:
   *
   *   "Morning {{1}}. Overnight we scanned {{2}} items and found {{3}}
   *    opportunities. Top focus: {{4}}. Tap to open today's brief."
   *
   * It's useless (no real data, dead "tap to open" CTA that points nowhere)
   * and one of Paul's first founder complaints was that it shipped on launch
   * morning. Morning briefs are now sent as RICH FREE-TEXT via the deterministic
   * builder in `src/lib/notifications/brief-builder.ts` → `buildMorningBrief()`,
   * routed through `/api/cron/personal-schedules`. Free-text only delivers
   * inside the 24h customer-service window, but Pro users on WhatsApp are
   * active enough that this isn't a problem.
   *
   * Re-submit a new version to Meta before any code calls this SID again.
   * Until then, keep this entry registered so resolveAlertType() doesn't
   * silently route morning briefs here.
   */
  paybacker_morning_summary: {
    // Resubmission required — original body ended on `{{4}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['name', 'scanned_count', 'opportunities_count', 'top_focus'] as const,
    description: 'Daily morning summary — DEPRECATED body, use buildMorningBrief() free-text instead',
    proOnly: true,
    body: 'Morning {{1}}. Overnight we scanned {{2}} items and found {{3}} opportunities. Top focus: {{4}}. Tap to open today\'s brief.',
  },
  /** Savings goal milestone (25/50/75/100% bands) */
  paybacker_savings_goal_milestone: {
    // Resubmission required — original body ended on `{{4}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['goal_name', 'percent', 'amount_saved', 'target_amount'] as const,
    description: 'Savings goal milestone hit',
    proOnly: true,
    body: 'Goal "{{1}}" just hit {{2}}% — £{{3}} saved of £{{4}}. Tap to see your progress.',
  },
  /** Budget approaching/over limit per category */
  paybacker_budget_alert: {
    // Resubmission required — original body ended on `{{4}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['category', 'percent_used', 'amount_left', 'end_date'] as const,
    description: 'Budget threshold reached',
    proOnly: true,
    body: 'Your {{1}} budget is at {{2}}% — £{{3}} left until {{4}}. Tap to review what is driving it.',
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
  /** Sunday 9am weekly recovery digest */
  paybacker_recovery_total_weekly: {
    // Resubmission required — original body ended on `{{2}}`.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount_this_week', 'lifetime_amount'] as const,
    description: 'Weekly recovery digest (Sunday 9am)',
    proOnly: true,
    body: 'This week Paybacker recovered £{{1}} for you. Lifetime total: £{{2}}. Tap to see the wins.',
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
  /** Dispute Agent recommendation push — added 2026-05-01 with the
   *  autonomous Dispute Agent state machine. Body skeleton:
   *  "Update on your {{merchant}} dispute: {{action_summary}}. Tap to {{cta}}."
   *  Submit via /dashboard/admin/whatsapp Resubmit panel, then replace
   *  PENDING_RESUBMISSION with the live SID. */
  paybacker_dispute_agent_action: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'action_summary', 'cta'] as const,
    description: 'Dispute Agent action recommendation (state machine)',
    proOnly: true,
    body: 'Update on your {{1}} dispute: {{2}}. Tap to {{3}} — open Paybacker to review.',
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
