/**
 * Canonical list of notification event types.
 *
 * Every user-facing alert in the system should map to one of these
 * so the dispatcher can route it through the user's configured
 * channels (email / telegram / push).
 *
 * Add new event types here — no migration needed.
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
  | 'support_reply'          // Support ticket reply landed
  | 'weekly_digest'          // Weekly spending/savings summary
  | 'monthly_recap'          // Month-end financial recap
  | 'morning_summary'        // Daily 7:30am Telegram briefing
  | 'evening_summary'        // Daily 5pm Telegram recap
  | 'payday_summary'         // After payday income/bills breakdown
  | 'deal_alert'             // Personalised switching deal
  | 'targeted_deal'          // Category-specific offer
  | 'onboarding';            // Onboarding email sequence

export interface EventMeta {
  event: NotificationEventType;
  label: string;
  description: string;
  defaultEmail: boolean;
  defaultTelegram: boolean;
  defaultPush: boolean;
  allowedChannels: Array<'email' | 'telegram' | 'push'>;
  group: 'alerts' | 'reminders' | 'summaries' | 'marketing' | 'service';
}

/**
 * What each event does + sensible defaults. `allowedChannels`
 * reflects real plumbing (e.g. onboarding is email-only because
 * Telegram onboarding would need reinventing the welcome flow).
 */
export const EVENT_CATALOG: EventMeta[] = [
  {
    event: 'price_increase',
    label: 'Price hike detected',
    description: 'When a recurring bill (council tax, energy, insurance etc.) goes up by 5%+.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'dispute_reply',
    label: 'Dispute reply received',
    description: 'A provider has replied to one of your active complaint letters.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'dispute_reminder',
    label: 'Dispute escalation reminder',
    description: 'Milestone reminders to escalate a stuck dispute (14/28/56 days).',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'reminders',
  },
  {
    event: 'renewal_reminder',
    label: 'Renewal reminders',
    description: 'Contract or subscription renewing in 30 / 14 / 7 days.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'reminders',
  },
  {
    event: 'contract_expiry',
    label: 'Contract ending soon',
    description: 'A tracked contract is about to end — time to switch.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'reminders',
  },
  {
    event: 'budget_alert',
    label: 'Budget alerts',
    description: 'You\'ve hit 80% or 100% of a budget category.',
    defaultEmail: false, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'unused_subscription',
    label: 'Unused subscription',
    description: 'Subscriptions you haven\'t used in 30+ days.',
    defaultEmail: true, defaultTelegram: true, defaultPush: false,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'savings_milestone',
    label: 'Savings milestones',
    description: 'Hit £500 / £1,000 / £5,000 saved through Paybacker.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'overcharge_detected',
    label: 'Overcharge detected',
    description: 'A duplicate or anomalous charge has landed on your account.',
    defaultEmail: true, defaultTelegram: true, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'new_opportunity',
    label: 'Email-scan opportunities',
    description: 'The inbox scanner has found a refund, dispute or saving worth actioning.',
    defaultEmail: true, defaultTelegram: false, defaultPush: true,
    allowedChannels: ['email', 'telegram', 'push'],
    group: 'alerts',
  },
  {
    event: 'support_reply',
    label: 'Support replies',
    description: 'We\'ve replied to your support ticket.',
    defaultEmail: true, defaultTelegram: false, defaultPush: true,
    allowedChannels: ['email', 'push'],
    group: 'service',
  },
  {
    event: 'weekly_digest',
    label: 'Weekly digest',
    description: 'Weekly recap of spending, savings and what you actioned.',
    defaultEmail: true, defaultTelegram: false, defaultPush: false,
    allowedChannels: ['email', 'telegram'],
    group: 'summaries',
  },
  {
    event: 'monthly_recap',
    label: 'Monthly recap',
    description: 'End-of-month financial summary.',
    defaultEmail: true, defaultTelegram: true, defaultPush: false,
    allowedChannels: ['email', 'telegram'],
    group: 'summaries',
  },
  {
    event: 'morning_summary',
    label: 'Morning briefing (7:30am)',
    description: 'Daily morning Telegram briefing — spending, renewals, disputes.',
    defaultEmail: false, defaultTelegram: true, defaultPush: false,
    allowedChannels: ['telegram', 'push'],
    group: 'summaries',
  },
  {
    event: 'evening_summary',
    label: 'Evening recap (5pm)',
    description: 'End-of-day spending recap.',
    defaultEmail: false, defaultTelegram: true, defaultPush: false,
    allowedChannels: ['telegram', 'push'],
    group: 'summaries',
  },
  {
    event: 'payday_summary',
    label: 'Payday summary',
    description: 'Income matched to upcoming bills the day after payday.',
    defaultEmail: false, defaultTelegram: true, defaultPush: false,
    allowedChannels: ['telegram', 'push'],
    group: 'summaries',
  },
  {
    event: 'deal_alert',
    label: 'Deal recommendations',
    description: 'Hand-picked switching deals that match your spend.',
    defaultEmail: true, defaultTelegram: false, defaultPush: false,
    allowedChannels: ['email', 'telegram'],
    group: 'marketing',
  },
  {
    event: 'targeted_deal',
    label: 'Category offers',
    description: 'Offers in categories you already spend in.',
    defaultEmail: true, defaultTelegram: false, defaultPush: false,
    allowedChannels: ['email', 'telegram'],
    group: 'marketing',
  },
  {
    event: 'onboarding',
    label: 'Onboarding emails',
    description: 'Welcome + tips in your first week.',
    defaultEmail: true, defaultTelegram: false, defaultPush: false,
    allowedChannels: ['email'],
    group: 'service',
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
