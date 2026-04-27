# Paybacker Pocket Agent — Alerts Cadence

_Last updated: 2026-04-27_

This doc is the canonical reference for **what alerts fire when, why, and to which channel** across the Paybacker Pocket Agent (Telegram + WhatsApp + Email + Push).

If you're adding a new alert: add an entry to `EVENT_CATALOG` in `src/lib/notifications/events.ts`, then route it through `sendNotification()` so it respects user preferences and quiet hours.

---

## Design principles

1. **Default to under-messaging.** Most users will tolerate fewer high-quality alerts much better than many low-quality ones. Suppression > delivery on the margin.
2. **Cap at 4 messages per user per day** unless an alert is *critical* (refund landed, dispute reply received, large unusual charge). Critical alerts bypass the cap.
3. **Batch where possible.** If 3+ alerts queue inside a 30-minute window, fold them into the next scheduled summary (morning/evening) instead of firing 3 separate messages.
4. **Quiet hours apply to push + Pocket Agent (Telegram/WhatsApp).** Email still sends in quiet hours — it's polite (no buzz, lives in an inbox).
5. **One Pocket Agent channel per user.** Telegram OR WhatsApp, not both — enforced at the opt-in route. WhatsApp is Pro-only (per-message API cost). Email + Push are always available alongside.
6. **Every alert maps to a `notification_event_type`.** No bespoke direct-send code paths — everything goes through `sendNotification()` so user prefs and quiet hours always win.

---

## Daily rhythm — what the agent looks like over 24 hours

```
04:00  bank-sync (silent, no user notification)
07:00  contract-expiry detect, energy-tariff-monitor, content idea generation
07:30  ☀️  morning_summary  (Pocket Agent, Pro daily, Free/Essential opt-in)
08:00  renewal-reminders detect → may send renewal_reminder alert
08:00  price-increases detect → may send price_increase alert
       contract-expiry-alerts detect → may send contract_expiry alert
       founding-member-expiry sweep
09:00  trial-expiry sweep, dispute-reminders, verify-challenges
       process-downgrades (Stripe webhook reconciliation)
10:00  marketing-automation (drip emails)
14:00  email-monitor scans for dispute replies → may send dispute_reply alert
       email-scanner finds opportunities → may send new_opportunity alert
17:00  🌙  evening_summary  (Pocket Agent, Pro daily, Free/Essential opt-in)
20:00  evening summary fallback / digest of day's queued alerts
22:00  → quiet hours start (default)
07:00  ← quiet hours end (default)
```

Plus real-time, event-driven:

- Bank-sync (3am, 2pm, 7pm) — when sync finishes, may emit `price_increase`, `unusual_charge`, `money_recovered`
- Watchdog email-monitor (every 30 min) — may emit `dispute_reply`
- Stripe webhooks — billing events route to email only (`receipt`, `payment_failed`)
- New_opportunity — fires within 60s of email scanner finishing

---

## Alerts catalogue

Each row maps an event type → trigger → cadence → default channels. **Pro-tier-only events are marked ⭐.**

### Real-time (event-driven, not scheduled)

| Event | Trigger | Cadence cap | Default channels | Notes |
|---|---|---|---|---|
| `price_increase` | Sub goes up ≥5% vs prior amount | Once per (user, merchant) per 30d | email, pocket-agent, push | Critical if ≥£240/yr annualised — bypass quiet hours. |
| `dispute_reply` | Watchdog email-monitor detects merchant message in dispute thread | Once per dispute reply | email, pocket-agent, push | Always critical — bypass cap. |
| `money_recovered` ⭐ | Bank-sync detects refund matching open dispute | Once per refund | pocket-agent, push (no email — celebratory tone needs immediacy) | Bypass cap; this is the dopamine hit. |
| `unusual_charge` | Bank-sync sees ≥20% above merchant's 6-mo rolling avg | Once per (user, merchant, calendar month) | pocket-agent, push | Suppress in evening_summary if covered already. |
| `new_opportunity` | Email scanner finds something to action (forgotten sub, flight delay, refund opportunity) | Up to 3/day per user; rest queue for morning_summary | pocket-agent, email | If user is Free + has hit complaint quota, suppress until next month. |
| `overcharge_detected` | Duplicate charge identified by detector | Once per charge | email, pocket-agent, push | Critical. |

### Scheduled (cron-driven)

| Event | Schedule | Default channels | Notes |
|---|---|---|---|
| `morning_summary` ⭐ | 07:30 daily | pocket-agent (no email — keep email feed quiet) | Pro: daily, on by default. Free/Essential: off by default. |
| `evening_summary` ⭐ | 17:00 daily | pocket-agent | Pro only. Recap of day's actions, what fired, queued tomorrow. |
| `payday_summary` ⭐ | Day of detected payday +0:30am | pocket-agent | Detected from bank-sync income pattern. Pro only. |
| `weekly_digest` | Mon 09:00 (Sunday 21:00 also supported via `telegram-weekly-summary`) | email, pocket-agent | Cross-tier; Free still gets it (no per-message cost on Telegram or email). |
| `monthly_recap` | 1st of month, 09:00 | email, pocket-agent | Cross-tier. |
| `renewal_reminder` | 08:00 daily, evaluates 30/14/7-day windows | email, pocket-agent | Cross-tier — Essential and Pro only based on plan-limits.ts. |
| `contract_expiry` | 08:00 daily, evaluates 30-day window | email, pocket-agent | Cross-tier (Essential / Pro). |
| `dispute_reminder` | 09:00 daily, fires at 14d / 28d / 56d (FCA 8-week) | email, pocket-agent | Cross-tier — escalation milestones. |
| `budget_alert` | After bank-sync reaches threshold | pocket-agent, push (no email — too noisy) | Suppress if already alerted this calendar week for same category. |
| `unused_subscription` | Weekly Mon 07:00 | email, pocket-agent | Cross-tier. |
| `savings_milestone` | After bank-sync verifies recovery; thresholds £100, £500, £1k, £5k | pocket-agent, push, email | Critical celebratory — bypass cap. |
| `deal_alert` | Mon 09:00 | email | Marketing — opt-out by default, opt-in inside notification preferences. |
| `targeted_deal` | Wed 09:00 | email | Marketing. |
| `support_reply` | Real-time on Riley response | email, pocket-agent, push | Service tier — always on. |
| `onboarding` | Triggered by signup state-machine | email | Email-only by design. |

---

## Channel selection rules

For each user × event:

```
1. Resolve user preferences (notification_preferences table).
2. Resolve effective Pocket Agent channel:
     - if user has whatsapp_sessions.is_active=true → 'whatsapp'
     - else if user has telegram_sessions.is_active=true → 'telegram'
     - else 'none'
3. If event is permitted on the user's pocket-agent channel AND
   the channel is enabled in their prefs → send via that channel.
4. If quiet hours and channel is push/telegram/whatsapp → defer.
   Email always sends regardless of quiet hours.
5. If event is critical (price_increase >£240/yr, dispute_reply,
   money_recovered, overcharge_detected, savings_milestone) → bypass
   quiet hours and the daily cap.
6. Daily cap: count of non-critical messages sent today on the user's
   pocket-agent channel. If ≥4, queue for morning/evening summary.
```

The mutex (telegram XOR whatsapp) is enforced at the opt-in routes:

- POST /api/whatsapp/opt-in → if user has `telegram_sessions.is_active=true`, set them to `is_active=false, opted_out_at=NOW()` before activating WhatsApp.
- Telegram link-code redemption → mirror flow: deactivate WhatsApp first.

This means **users can switch any time** — no API token is wasted on a channel they're not actively using.

---

## Why one channel only?

Three reasons:

1. **API costs.** WhatsApp templates cost £0.003-£0.06 per outbound. Telegram is free for us. Sending the same alert through both would be money set on fire on the WhatsApp side with no extra user value.
2. **User ergonomics.** Two parallel agent channels feel chaotic — users don't know which to reply to, conversation history splits, support gets confusing.
3. **Trust + simplicity.** "I get my Paybacker pocket agent on WhatsApp" is a clearer brand promise than "I get it everywhere."

Email + Push run alongside whichever Pocket Agent channel is active — they're separate trust contexts (push for mobile-app users, email for record).

---

## Tier matrix

| Event group | Free | Essential | Pro |
|---|:-:|:-:|:-:|
| Real-time critical (price_increase, dispute_reply, money_recovered, overcharge) | ✓ | ✓ | ✓ |
| Renewal / contract / dispute reminders | — | ✓ | ✓ |
| Budget / unused-subscription alerts | — | ✓ | ✓ |
| Daily summaries (morning / evening / payday) | — | — | ✓ |
| Weekly digest, monthly recap | ✓ | ✓ | ✓ |
| Telegram Pocket Agent channel | ✓ | ✓ | ✓ |
| WhatsApp Pocket Agent channel | — | — | ✓ |
| Email channel | ✓ | ✓ | ✓ |
| Push channel (when mobile app ships) | ✓ | ✓ | ✓ |

---

## Adding a new alert

1. Add a new entry to `EVENT_CATALOG` in `src/lib/notifications/events.ts`.
2. In whatever code detects the trigger, call `sendNotification(supabase, { userId, event, email, telegram, whatsapp, push, bypassQuietHours })`.
3. Update this doc with the cadence + channel defaults.
4. If it's cron-driven, add a Vercel cron entry in `vercel.json`.

Do **not** call `sendTelegramText` / `sendWhatsAppText` directly from cron jobs — always go through `sendNotification()`. The dispatcher is what enforces user prefs, quiet hours, the mutex, and the daily cap.
