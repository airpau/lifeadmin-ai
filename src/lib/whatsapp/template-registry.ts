/**
 * WhatsApp Template Registry — single source of truth for the 16 templates
 * submitted to Meta on 2026-04-27.
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
 */

export type TemplateCategory = 'UTILITY' | 'AUTHENTICATION' | 'MARKETING';

export interface WhatsAppTemplate {
  /** Twilio Content SID — what we pass as `contentSid` when sending */
  sid: string;
  /** Meta-side category (drives pricing per outbound message) */
  category: TemplateCategory;
  /** Variable names in order — index 1..N becomes Twilio's contentVariables */
  vars: readonly string[];
  /** Human-readable description for ops dashboards & logs */
  description: string;
  /** Pro-only? When true the cron/agent must skip non-Pro recipients */
  proOnly: boolean;
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
    sid: 'HXd0a7d989fbaa8d254d530119a276eace',
    category: 'UTILITY',
    vars: ['name'] as const,
    description: 'First-touch welcome after WhatsApp opt-in',
    proOnly: true,
  },
  /** Triggered by price-increase-detector.ts when a sub goes up */
  paybacker_alert_price_increase: {
    sid: 'HX0b581b6ef1076aebe6f6a1c9101d32e2',
    category: 'UTILITY',
    vars: ['merchant', 'old_price', 'new_price', 'effective_date'] as const,
    description: 'Subscription price hike detected',
    proOnly: true,
  },
  /** Contract end ≤30 days, looks at contract_end_date on subscriptions */
  paybacker_alert_renewal: {
    sid: 'HXd6fbd2bf402a63e920e4d375f20502e6',
    category: 'UTILITY',
    vars: ['service', 'days_left', 'monthly_cost'] as const,
    description: 'Contract renewal approaching',
    proOnly: true,
  },
  /** Bank scanner spots a charge >20% above the merchant's rolling avg */
  paybacker_alert_unusual_charge: {
    sid: 'HXacdc466915dbdb08a7c49a9ccd815137',
    category: 'UTILITY',
    vars: ['merchant', 'current_amount', 'average_amount', 'percent_higher'] as const,
    description: 'Bill anomaly detected',
    proOnly: true,
  },
  /** Free trial → first auto-charge ≤3 days away */
  paybacker_alert_trial_ending: {
    sid: 'HX2e7e125b3fbf60386f633eee8cf744fc',
    category: 'UTILITY',
    vars: ['service', 'days_left', 'auto_charge_amount'] as const,
    description: 'Free trial ending — auto-charge incoming',
    proOnly: true,
  },
  /** Complaint letter generated and ready to download */
  paybacker_complaint_letter_ready: {
    // Resubmitted 2026-04-27 with trailing static text — Meta rejected the
    // first version (HXcb08a...) for ending in `{{2}}`.
    sid: 'HXb161ad4a72531943fd57068fe81074f3',
    category: 'UTILITY',
    vars: ['merchant', 'letter_url'] as const,
    description: 'Complaint letter ready (action loop)',
    proOnly: true,
  },
  /** Bank sync detects a refund hitting a Paybacker-tracked dispute */
  paybacker_money_recovered: {
    sid: 'HX83686935274d67997fac8999e02a2763',
    category: 'UTILITY',
    vars: ['amount', 'merchant', 'lifetime_total'] as const,
    description: 'Refund hit account — money recovered',
    proOnly: true,
  },
  /** Watchdog email scanner finds a merchant reply to an open dispute */
  paybacker_dispute_reply: {
    // Resubmitted 2026-04-27 — first version ended with `{{3}}` URL.
    sid: 'HXff77c9745533c248df3b9e0ee5c7fa95',
    category: 'UTILITY',
    vars: ['merchant', 'summary', 'thread_url'] as const,
    description: 'Merchant replied to your dispute',
    proOnly: true,
  },
  /** T+7d nudge after dispute sent — did it work? */
  paybacker_outcome_check: {
    sid: 'HXb1608da640949c62e7f66b9ce4f1ff9c',
    category: 'UTILITY',
    vars: ['merchant', 'action_type'] as const,
    description: 'Outcome check after dispute / cancellation',
    proOnly: true,
  },
  /** Pro-only daily 8am brief */
  paybacker_morning_summary: {
    sid: 'HX4eae8f7c8806c540fac25e69c528faa5',
    category: 'UTILITY',
    vars: ['name', 'scanned_count', 'opportunities_count', 'top_focus'] as const,
    description: 'Daily 8am morning summary (Pro only)',
    proOnly: true,
  },
  /** Savings goal milestone (25/50/75/100% bands) */
  paybacker_savings_goal_milestone: {
    sid: 'HXf547f5b569adb3132963eaf2908387e0',
    category: 'UTILITY',
    vars: ['goal_name', 'percent', 'amount_saved', 'target_amount'] as const,
    description: 'Savings goal milestone hit',
    proOnly: true,
  },
  /** Budget approaching/over limit per category */
  paybacker_budget_alert: {
    sid: 'HX718530984745f0cbb79469b671999370',
    category: 'UTILITY',
    vars: ['category', 'percent_used', 'amount_left', 'end_date'] as const,
    description: 'Budget threshold reached',
    proOnly: true,
  },
  /** Bank/email connection token expired — needs user action */
  paybacker_reconnect_required: {
    // Resubmitted 2026-04-27 — first version ended with `{{2}}` URL.
    sid: 'HXaf764eed43ddd1147c48bf3fc855e0d8',
    category: 'UTILITY',
    vars: ['provider', 'reconnect_url'] as const,
    description: 'OAuth/banking token expired',
    proOnly: true,
  },
  /** Sunday 9am weekly recovery digest */
  paybacker_recovery_total_weekly: {
    sid: 'HX88de4d980c0f450e33a3792ffebf3528',
    category: 'UTILITY',
    vars: ['amount_this_week', 'lifetime_amount'] as const,
    description: 'Weekly recovery digest (Sunday 9am)',
    proOnly: true,
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
   */
  paybacker_login_code: {
    sid: 'HXc0ebfb1775a8a713221583a70c739334', // ⚠️ NOT APPROVED — see comment above
    category: 'AUTHENTICATION',
    vars: ['code'] as const,
    description: 'One-time login / step-up auth code (DEFERRED — see comment, retry v1.1)',
    // Auth codes are not Pro-gated when they eventually work — anyone
    // who's enabled WhatsApp 2FA gets them.
    proOnly: false,
  },
  /** Switchcraft-style cheaper-deal nudge (MARKETING — needs separate opt-in) */
  paybacker_better_deal_found: {
    // Resubmitted 2026-04-27 — first version ended with `{{3}}` URL.
    sid: 'HXef2f3aa52beec5a2591154096faf741b',
    category: 'MARKETING',
    vars: ['category', 'saving_per_year', 'switch_url'] as const,
    description: 'Cheaper provider found in user category',
    proOnly: true,
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type TemplateName = keyof typeof TEMPLATES;
