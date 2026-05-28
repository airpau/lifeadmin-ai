/**
 * WhatsApp Template Registry — single source of truth for the 16 templates
 * submitted to Meta on 2026-04-27.
 *
 * ────────────────────────────────────────────────────────────────────────
 * RESUBMISSION CYCLE (2026-05-28) — DEAD "TAP TO X" CTAs
 * ────────────────────────────────────────────────────────────────────────
 * Paul flagged the WhatsApp Pocket Agent as broken because every template
 * body ended with "Tap to X" copy that does NOT render as tappable in
 * WhatsApp. The static instruction looked like a button — wasn't one. He
 * shared a screenshot of three messages (one dispute-agent action + two
 * outcome-check nudges) all ending with dead "Tap to ..." CTAs.
 *
 * Every body below has been rewritten to one of three end-state shapes:
 *   (1) Reply-keyword prompt — "Reply DISPUTE to challenge it" — which
 *       the Pocket Agent user-bot already understands as a natural
 *       intent. Used for price-increase, renewal, unusual-charge,
 *       trial-ending, outcome-check, dispute-agent-action.
 *   (2) Plain auto-linked URL — "See the breakdown at
 *       paybacker.co.uk/dashboard/X." WhatsApp auto-linkifies plain
 *       URLs on every device. Used for money-recovered, savings-
 *       milestone, budget-alert, recovery-weekly, dispute-created.
 *   (3) Self-contained statement — no CTA at all. Used for welcome
 *       and opted-out where there is nothing for the user to do.
 *
 * All previously-`approved` templates whose bodies have CHANGED have
 * been reset to `PENDING_RESUBMISSION` and need the founder to resubmit
 * via /dashboard/admin/whatsapp Resubmit panel. Meta typically approves
 * UTILITY templates inside 24h.
 *
 * Templates needing resubmission after this update (2026-05-28):
 *   - paybacker_alert_price_increase  (reply-keyword body)
 *   - paybacker_alert_renewal         (reply-keyword body)
 *   - paybacker_alert_unusual_charge  (reply-keyword body)
 *   - paybacker_alert_trial_ending    (reply-keyword body)
 *   - paybacker_dispute_created       (plain URL body)
 *   - paybacker_money_recovered       (plain URL body)
 *   - paybacker_outcome_check         (reply-keyword body — also added
 *                                      PARTIAL + REJECTED buttons)
 *   - paybacker_savings_goal_milestone (plain URL body)
 *   - paybacker_budget_alert          (plain URL body)
 *   - paybacker_recovery_total_weekly (plain URL body)
 *   - paybacker_dispute_agent_action  (reply-keyword body — callers now
 *                                      pass a single-word reply keyword
 *                                      as `cta`, not an imperative phrase)
 *
 * Templates that don't need re-approval after this update:
 *   - paybacker_dispute_reply, paybacker_complaint_letter_ready,
 *     paybacker_reconnect_required, paybacker_better_deal_found —
 *     bodies were already URL-anchored, no dead CTA.
 *   - paybacker_welcome — self-contained.
 *   - paybacker_morning_summary — already paused pending separate
 *     resubmission (see the long comment on that entry).
 *   - paybacker_opted_out, paybacker_login_code — unchanged.
 *
 * Variable counts are UNCHANGED on every template — existing callers
 * keep working with the in-flight (still-approved) bodies until Meta
 * re-approves, then start serving the new bodies once the founder
 * pastes the new SIDs back into `whatsapp_template_sids`.
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
    // 2026-05-28 BODY UPDATE — dead "Tap to switch or cancel." CTA replaced
    // with reply-keyword instruction (DISPUTE / SWITCH). The Pocket Agent
    // user-bot already understands both keywords as natural intents.
    // Founder must resubmit via /dashboard/admin/whatsapp Resubmit panel.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'old_price', 'new_price', 'effective_date'] as const,
    description: 'Subscription price hike detected',
    proOnly: true,
    body: 'Heads up — {{1}} is going up from £{{2}} to £{{3}} on {{4}}. Reply DISPUTE to challenge it, or SWITCH to see cheaper alternatives.',
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
    // 2026-05-28 BODY UPDATE — dead "Tap to review or cancel." replaced with
    // reply keywords. Founder resubmits via /dashboard/admin/whatsapp.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['service', 'days_left', 'monthly_cost'] as const,
    description: 'Contract renewal approaching',
    proOnly: true,
    body: 'Your {{1}} contract renews in {{2}} days at £{{3}}/month. Reply CANCEL to draft a cancellation letter, or SWITCH to see cheaper alternatives.',
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
    // 2026-05-28 BODY UPDATE — dead "Tap to dispute." replaced with reply
    // keyword. Founder resubmits via /dashboard/admin/whatsapp.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'current_amount', 'average_amount', 'percent_higher'] as const,
    description: 'Bill anomaly detected',
    proOnly: true,
    body: 'Spotted something — {{1}} just charged £{{2}} vs your usual £{{3}} — that is {{4}}% higher. Reply DISPUTE to draft a complaint letter.',
  },
  /** Free trial → first auto-charge ≤3 days away */
  paybacker_alert_trial_ending: {
    // 2026-05-28 BODY UPDATE — dead "Tap to cancel" replaced with reply
    // keyword. Founder resubmits via /dashboard/admin/whatsapp.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['service', 'days_left', 'auto_charge_amount'] as const,
    description: 'Free trial ending — auto-charge incoming',
    proOnly: true,
    body: 'Your {{1}} trial ends in {{2}} days — you will be charged £{{3}}. Reply CANCEL to draft a cancellation email before then.',
  },
  /** A new dispute row was opened — fires immediately on creation,
   *  before the AI letter is ready. paybacker_complaint_letter_ready
   *  fires separately ~20-30s later when Sonnet finishes drafting. */
  paybacker_dispute_created: {
    // 2026-05-28 BODY UPDATE — dead "Tap to follow it" stripped; the URL
    // {{2}} is auto-linked by WhatsApp on every device, so users tap the
    // link itself rather than a static instruction.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'dispute_url'] as const,
    description: 'New dispute opened in the disputes centre',
    proOnly: true,
    body: 'New dispute opened against {{1}}: {{2}} — your AI letter will land in this chat once it is drafted.',
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
    // 2026-05-28 BODY UPDATE — dead "Tap to see the breakdown." replaced
    // with a plain URL WhatsApp auto-links on every device.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount', 'merchant', 'lifetime_total'] as const,
    description: 'Refund hit account — money recovered',
    proOnly: true,
    body: '£{{1}} from {{2}} just landed in your account. Lifetime recovered: £{{3}}. See the breakdown at paybacker.co.uk/dashboard/disputes.',
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
    // 2026-05-28 BODY UPDATE — replaced the dead "Tap to log the outcome."
    // copy with an explicit reply-keyword prompt. The Pocket Agent user-bot
    // already understands WON / PARTIAL / REJECTED / ONGOING (and "lost" /
    // "still waiting") as natural-language outcome intents — taps from the
    // quick-reply buttons below surface as title text and route to the same
    // handlers. Founder resubmits via /dashboard/admin/whatsapp.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'action_type'] as const,
    description: 'Outcome check after dispute / cancellation',
    proOnly: true,
    body: 'Your {{1}} {{2}} hit 7 days. Have they responded? Reply WON, PARTIAL, REJECTED, or ONGOING and I will update your case.',
    // Taps surface as text — and the natural-language outcome intelligence
    // in tool-handlers.ts understands every label below against the most
    // recent dispute. So:
    //   "Won"           → resolved_won + writes recovered_amount_gbp
    //   "Partial"       → resolved_partial
    //   "Rejected"      → resolved_lost
    //   "Ongoing"       → awaiting_response (and may re-arm the nudge)
    buttons: [
      { id: 'outcome_won', title: 'Won' },
      { id: 'outcome_partial', title: 'Partial' },
      { id: 'outcome_rejected', title: 'Rejected' },
      { id: 'outcome_ongoing', title: 'Ongoing' },
    ] as const,
  },
  /**
   * Pro-only daily 7:30am brief — outside the 24h customer-service window.
   *
   * 2026-05-26 resubmission required. The previously-approved body
   * (SID HX10a9b00c50fc0041ee6d31b31bcc7898, body began "Morning {{1}}.
   * Overnight we scanned {{2}} items and found {{3}} opportunities.
   * Top focus: {{4}}. Tap to open today's brief.") was misleading in two
   * ways:
   *   1. There is no overnight email-scanner cron — the scanner is
   *      user-triggered via the dashboard. So {{2}} / {{3}} routinely
   *      rendered as "0" / "0" for users who hadn't recently clicked
   *      Scan, producing copy like "Overnight we scanned 0 items and
   *      found 0 opportunities."
   *   2. "Tap to open today's brief." was dead text — WhatsApp does not
   *      turn a static template string into a tappable link. There was
   *      nothing for the user to tap.
   *
   * New self-contained body (below) carries the inline highlights in
   * {{2}} and a tip in {{3}}, and replaces the dead CTA with a plain
   * URL the user can manually tap in WhatsApp. The SID is reset to
   * PENDING_RESUBMISSION; the founder resubmits via
   * /dashboard/admin/whatsapp and Meta approves the new body before
   * the dispatch path is re-enabled in
   * src/lib/whatsapp/morning-brief.ts.
   *
   * Body shape (variable lengths capped by Meta — keep highlights <= ~600
   * chars, tip <= ~200 chars to stay under the 1024-char body limit
   * with the static framing):
   *
   *   "Morning {{1}}. {{2}} Tip of the day: {{3}} Open
   *    paybacker.co.uk/dashboard for the full brief."
   *
   * Why this shape:
   *   - Variable not at start (Meta rule 2388299) — static "Morning "
   *     leads in.
   *   - Variable not at end — static URL closes out.
   *   - {{2}} carries a multi-line summary so the body is self-contained
   *     (disputes / inbox findings / spend headline). Newlines inside
   *     a Twilio Content Template variable render as literal line breaks
   *     in WhatsApp.
   *   - URL is a plain authority host, so WhatsApp auto-links it on every
   *     device; the user taps the link itself, not a static "Tap to open"
   *     instruction.
   */
  paybacker_morning_summary: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['name', 'highlights', 'tip'] as const,
    description: 'Daily 7:30am morning summary (Pro only) — self-contained body',
    proOnly: true,
    body: 'Morning {{1}}. {{2}} Tip of the day: {{3}} Open paybacker.co.uk/dashboard for the full brief.',
  },
  /** Savings goal milestone (25/50/75/100% bands) */
  paybacker_savings_goal_milestone: {
    // 2026-05-28 BODY UPDATE — dead "Tap to see your progress." replaced
    // with a plain auto-linked URL.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['goal_name', 'percent', 'amount_saved', 'target_amount'] as const,
    description: 'Savings goal milestone hit',
    proOnly: true,
    body: 'Goal "{{1}}" just hit {{2}}% — £{{3}} saved of £{{4}}. See your progress at paybacker.co.uk/dashboard/money-hub.',
  },
  /** Budget approaching/over limit per category */
  paybacker_budget_alert: {
    // 2026-05-28 BODY UPDATE — dead "Tap to review what is driving it."
    // replaced with a plain auto-linked URL.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['category', 'percent_used', 'amount_left', 'end_date'] as const,
    description: 'Budget threshold reached',
    proOnly: true,
    body: 'Your {{1}} budget is at {{2}}% — £{{3}} left until {{4}}. See what is driving it at paybacker.co.uk/dashboard/money-hub.',
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
  /** Saturday 09:00 BST weekly recovery digest. Fired by
   *  /api/cron/telegram-weekly-summary (schedule "0 8 * * 6"). */
  paybacker_recovery_total_weekly: {
    // 2026-05-28 BODY UPDATE — dead "Tap to see the wins." replaced
    // with a plain auto-linked URL.
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['amount_this_week', 'lifetime_amount'] as const,
    description: 'Weekly recovery digest (Saturday 09:00 BST)',
    proOnly: true,
    body: 'This week Paybacker recovered £{{1}} for you. Lifetime total: £{{2}}. See the breakdown at paybacker.co.uk/dashboard/disputes.',
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
   *  autonomous Dispute Agent state machine.
   *
   *  2026-05-28 BODY UPDATE — Paul flagged the original "Tap to {{cta}} —
   *  open Paybacker to review." copy as broken: WhatsApp does not turn
   *  static text into a tappable link, so the CTA looked dead. Replaced
   *  with an explicit reply-keyword prompt the Pocket Agent user-bot can
   *  route on (SEND / CHASE / ESCALATE / OFFER / WON / LBA / CLAIM / REVIEW).
   *  Callers MUST now pass `cta` as one of those keywords (see
   *  `ctaFor()` in src/app/api/cron/dispute-agent/route.ts and the
   *  stall-sweep in src/app/api/cron/dispute-letter-followup/route.ts).
   *
   *  Submit via /dashboard/admin/whatsapp Resubmit panel, then replace
   *  PENDING_RESUBMISSION with the live SID. */
  paybacker_dispute_agent_action: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: ['merchant', 'action_summary', 'cta'] as const,
    description: 'Dispute Agent action recommendation (state machine)',
    proOnly: true,
    body: 'Update on your {{1}} dispute: {{2}} Reply {{3}} and I will action it, or open paybacker.co.uk/dashboard.',
  },
  /**
   * Opt-out confirmation — sent after the user replies STOP (or hits
   * Unsubscribe in the dashboard) so they get a single, branded
   * confirmation that they have been opted out.
   *
   * Today the webhook (`/api/whatsapp/webhook`) replies with free-form
   * text inside the 24h customer-service window — that works for the
   * keyword case but fails outside the window. This template covers
   * both paths uniformly and is the canonical send for any future
   * dashboard-driven opt-out flow.
   *
   * ⚠️ NEEDS META APPROVAL VIA TWILIO CONSOLE.
   * Paul submits the body verbatim via Twilio Content Template Builder
   * → submit for WhatsApp approval (UTILITY category) → replace
   * PENDING_RESUBMISSION with the live HX… SID once approved.
   *
   * Variables: none (zero-arg template). No risk of variable-at-start
   * or variable-at-end Meta rejections.
   *
   * `proOnly: false` — anyone who's connected WhatsApp can opt out of it.
   */
  paybacker_opted_out: {
    sid: PENDING_RESUBMISSION,
    category: 'UTILITY',
    vars: [] as const,
    description: 'WhatsApp opt-out confirmation',
    proOnly: false,
    body: "You've been unsubscribed from Paybacker alerts. Reply SUBSCRIBE to re-enable them at any time.",
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
