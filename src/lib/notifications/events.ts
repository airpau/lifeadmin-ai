/**
 * Canonical list of notification event types.
 *
 * Every user-facing alert in the system should map to one of these
 * so the dispatcher can route it through the user's configured
 * channels (email / telegram / whatsapp / push).
 *
 * Add new event types here — no migration needed. The DB column
 * `notification_preferences.event_type` is plain text and will accept
 * any new value.
 *
 * Channel notes:
 * - email          — always available, all tiers
 * - telegram       — Pocket Agent channel; available on every tier
 * - whatsapp       — Pocket Agent channel; PRO ONLY (per-message Meta cost).
 *                    Mutually exclusive with telegram via the
 *                    `set_pocket_agent_channel` Postgres function.
 * - push           — mobile app push notifications (no transport yet,
 *                    UI-ready so users can pre-configure)
 */

export type NotificationEventType =
  | 'price_increase'         // Bill detected going up
  | 'dispute_reply'          // Provider replied to an active dispute
  | 'dispute_reminder'       // Dispute escalation milestones (14/28/56d)
  | 'renewal_reminder'       // Contract renewing in 30/14/7 days
  | 'contract_expiry'        // Contract ending soon
  | 'budget_alert'           // Approaching or over budget threshold
  | 'unused_subscription'    // No spend in 30+ days on tracked sub
  | 'savings_milestone'      // £500/£1000/£5000 saved
  | 'overcharge_detected'    // Duplicate charge detected
  | 'new_opportunity'        // Email scan found something to action
  | 'money_recovered'        // Refund hit account from a tracked dispute
  | 'unusual_charge'         // Bank charge >20% above merchant rolling avg
  | 'support_reply'          // Support ticket reply landed
  | 'weekly_digest'          // Weekly spending/savings summary
  | 'monthly_recap'          // Month-end financial recap
  | 'morning_summary'        // Daily 7:30am Pocket Agent briefing (Pro)
  | 'evening_summary'        // Daily 5pm Pocket Agent recap (Pro)
  | 'payday_summary'         // After payday income/bills breakdown (Pro)
  | 'deal_alert'             // Personalised switching deal
  | 'targeted_deal'          // Category-specific offer
  | 'onboarding';            // Onboarding email sequence

export type NotificationChannel = 'email' | 'telegram' | 'whatsapp' | 'push';

/**
 * How the user can configure this event's schedule.
 *
 * - `cron`         user picks an exact time of day / day of week
 * - `lead_time`    user picks the days-before window (renewals, contracts)
 * - `threshold`    user picks the threshold value (budget alerts)
 * - `system`       user can ONLY enable/disable; fires when detected
 * - `none`         not user-configurable at all (onboarding emails)
 */
export type ScheduleKind = 'cron' | 'lead_time' | 'threshold' | 'system' | 'none';

export interface EventMeta {
  event: NotificationEventType;
  label: string;
  description: string;
  defaultEmail: boolean;
  defaultTelegram: boolean;
  defaultWhatsapp: boolean;
  defaultPush: boolean;
  allowedChannels: NotificationChannel[];
  group: 'alerts' | 'reminders' | 'summaries' | 'marketing' | 'service';
  /**
   * Pro-only events: the dispatcher will skip these for Free/Essential
   * users regardless of their preferences. Used for daily summaries.
   */
  proOnly?: boolean;
  /**
   * Critical events bypass quiet hours and the per-user daily message cap.
   * Reserved for high-signal, time-sensitive alerts where the user expects
   * immediate notification (refunds, dispute replies, big overcharges).
   */
  critical?: boolean;
  /** How users can reschedule this event via the Pocket Agent. */
  scheduleKind: ScheduleKind;
  /** If true, even disable toggles are ignored (e.g. support_reply). */
  mandatory?: boolean;
  /** Default cron expression for `cron`-kind events (Europe/London). */
  defaultCron?: string;
  /** Default lead-time-days for `lead_time`-kind events. */
  defaultLeadTimeDays?: number[];
}

/**
 * What each event does + sensible defaults. `allowedChannels`
 * reflects real plumbing (e.g. onboarding is email-only because
 * the welcome flow only exists in email).
 *
 * `defaultWhatsapp` is conservative: most events default to OFF on
 * WhatsApp because every outbound template costs us Meta fees, and
 * the user is also receiving the same alert via email and Telegram
 * (if connected). Critical events default WhatsApp = true because
 * users on WhatsApp opted in expecting urgent stuff to come through.
 */
export const EVENT_CATALOG: EventMeta[] = [
  {
    event: 'price_increase',
    label: 'Price hike detected',
    description: 'When a recurring bill (council tax, energy, insurance etc.) goes up by 5%+.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
    critical: true,
  },
  {
    event: 'dispute_reply',
    label: 'Dispute reply received',
    description: 'A provider has replied to one of your active complaint letters.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
    critical: true,
  },
  {
    event: 'dispute_reminder',
    label: 'Dispute escalation reminder',
    description: 'Milestone reminders to escalate a stuck dispute (14/28/56 days).',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'reminders',
    scheduleKind: 'lead_time',
    defaultLeadTimeDays: [14, 28, 56],
  },
  {
    event: 'renewal_reminder',
    label: 'Renewal reminders',
    description: 'Contract or subscription renewing in 30 / 14 / 7 days.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'reminders',
    scheduleKind: 'lead_time',
    defaultLeadTimeDays: [30, 14, 7],
  },
  {
    event: 'contract_expiry',
    label: 'Contract ending soon',
    description: 'A tracked contract is about to end — time to switch.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'reminders',
    scheduleKind: 'lead_time',
    defaultLeadTimeDays: [30, 14, 7],
  },
  {
    event: 'budget_alert',
    label: 'Budget alerts',
    description: "You've hit 80% or 100% of a budget category.",
    defaultEmail: false, defaultTelegram: true, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'threshold',
  },
  {
    event: 'unused_subscription',
    label: 'Unused subscription',
    description: "Subscriptions you haven't used in 30+ days.",
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'cron',
    defaultCron: '0 7 * * 1',
  },
  {
    event: 'savings_milestone',
    label: 'Savings milestones',
    description: 'Hit £100 / £500 / £1,000 / £5,000 saved through Paybacker.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
    critical: true,
  },
  {
    event: 'overcharge_detected',
    label: 'Overcharge detected',
    description: 'A duplicate or anomalous charge has landed on your account.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
    critical: true,
  },
  {
    event: 'new_opportunity',
    label: 'Email-scan opportunities',
    description: 'The inbox scanner has found a refund, dispute or saving worth actioning.',
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
  },
  {
    event: 'money_recovered',
    label: 'Money recovered',
    description: 'A refund or settlement has hit your account from one of your active disputes.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
    critical: true,
  },
  {
    event: 'unusual_charge',
    label: 'Unusual charge',
    description: 'A bank charge that is significantly higher than the merchant\'s usual amount.',
    defaultEmail: false, defaultTelegram: true, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'whatsapp', 'push'],
    group: 'alerts',
    scheduleKind: 'system',
  },
  {
    event: 'support_reply',
    label: 'Support replies',
    description: "We've replied to your support ticket.",
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: true,
    allowedChannels: ['email', 'push'],
    group: 'service',
    scheduleKind: 'system',
    mandatory: true,
  },
  {
    event: 'weekly_digest',
    label: 'Weekly digest',
    description: 'Weekly recap of spending, savings and what you actioned.',
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'whatsapp'],
    group: 'summaries',
    scheduleKind: 'cron',
    defaultCron: '0 9 * * 1',
  },
  {
    event: 'monthly_recap',
    label: 'Monthly recap',
    description: 'End-of-month financial summary.',
    defaultEmail: true, defaultTelegram: true, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'whatsapp'],
    group: 'summaries',
    scheduleKind: 'cron',
    defaultCron: '0 9 1 * *',
  },
  {
    event: 'morning_summary',
    label: 'Morning briefing (7:30am)',
    description: 'Daily morning Pocket Agent briefing — spending, renewals, disputes.',
    defaultEmail: false, defaultTelegram: true, defaultWhatsapp: true, defaultPush: false,
    allowedChannels: ['telegram', 'whatsapp', 'push'],
    group: 'summaries',
    scheduleKind: 'cron',
    defaultCron: '30 7 * * *',
    proOnly: true,
  },
  {
    event: 'evening_summary',
    label: 'Evening recap (5pm)',
    description: 'End-of-day spending recap.',
    defaultEmail: false, defaultTelegram: true, defaultWhatsapp: true, defaultPush: false,
    allowedChannels: ['telegram', 'whatsapp', 'push'],
    group: 'summaries',
    scheduleKind: 'cron',
    defaultCron: '0 17 * * *',
    proOnly: true,
  },
  {
    event: 'payday_summary',
    label: 'Payday summary',
    description: 'Income matched to upcoming bills the day after payday.',
    defaultEmail: false, defaultTelegram: true, defaultWhatsapp: true, defaultPush: false,
    allowedChannels: ['telegram', 'whatsapp', 'push'],
    group: 'summaries',
    scheduleKind: 'cron',
    defaultCron: '0 9 * * *',
    proOnly: true,
  },
  {
    event: 'deal_alert',
    label: 'Deal recommendations',
    description: 'Hand-picked switching deals that match your spend.',
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'whatsapp'],
    group: 'marketing',
    scheduleKind: 'cron',
    defaultCron: '0 9 * * 1',
  },
  {
    event: 'targeted_deal',
    label: 'Category offers',
    description: 'Offers in categories you already spend in.',
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'whatsapp'],
    group: 'marketing',
    scheduleKind: 'cron',
    defaultCron: '0 9 * * 3',
  },
  {
    event: 'onboarding',
    label: 'Onboarding emails',
    description: 'Welcome + tips in your first week.',
    defaultEmail: true, defaultTelegram: false, defaultWhatsapp: false, defaultPush: false,
    allowedChannels: ['email'],
    group: 'service',
    scheduleKind: 'none',
  },
];

export const EVENT_GROUPS: Record<EventMeta['group'], string> = {
  alerts: 'Real-time alerts',
  reminders: 'Reminders',
  summaries: 'Daily & weekly summaries',
  marketing: 'Offers & recommendations',
  service: 'Account & service',
};

export function getEventMeta(event: NotificationEventType): EventMeta | undefined {
  return EVENT_CATALOG.find((e) => e.event === event);
}
