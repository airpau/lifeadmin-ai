# KPI Weekly Review — The Friday 30-Minute Check

**Owner:** Paul, every Friday, 10:00-10:30 UK.
**Purpose:** the single recurring meeting that keeps the launch sprint honest. Without it, automation drifts and ineffective spend compounds.

The entire review is a single dashboard at `/admin/kpi-weekly` (to be built) that surfaces the numbers below automatically from Supabase + PostHog. Paul makes 3-5 decisions per review. Nothing else.

## The weekly dashboard — the 12 numbers that matter

Group 1 — **Acquisition** (how many people are reaching us)

1. **Unique visitors to paybacker.co.uk this week** (PostHog) — and +% vs last week
2. **Signups this week** (Supabase `auth.users` new rows) — and conversion rate from visitors
3. **Signups by source** (PostHog session attribution): Organic / Paid Google / Paid Meta / TikTok / Referral / Direct

Group 2 — **Activation** (are they doing the thing)

4. **% of signups who generated at least one letter** in their first 24 hours
5. **% of signups who connected a bank** in their first 7 days
6. **Letters generated this week** across all users

Group 3 — **Revenue**

7. **Paid conversions this week** (Stripe `checkout.session.completed` events)
8. **MRR delta this week** (Stripe)
9. **Churn / cancellations this week**

Group 4 — **Efficiency**

10. **Blended CAC** (total spend / paid conversions this week)
11. **Top 3 and bottom 3 ad creatives by CPA** (Meta + Google)
12. **Content drafts approved this week / generated this week** (content_drafts table)

## Sprint targets (60-day launch)

Set during Week 0; reviewed weekly; adjusted monthly.

| Metric | Week 2 | Week 4 | Week 8 |
|---|---|---|---|
| Weekly unique visitors | 500 | 2,000 | 5,000 |
| Weekly signups | 40 | 150 | 400 |
| Signup→letter activation | 55% | 60% | 65% |
| Weekly paid conversions | 2 | 15 | 45 |
| MRR | £20 | £100 | £400 |
| Blended CAC | £15 (acceptable while learning) | £12 | £8 |
| UGC videos produced | 2 | 8 | 20 |
| Press placements | 0 (expected) | 1 | 3 |

If you're trending 30%+ below these, it's not "a bit off" — something structural is wrong. Pause spend, find the reason, then resume.

## The 5 questions Paul answers every Friday

Written answers pasted into `business_log` table and `shared-context/handoff-notes.md`.

1. **What's the #1 thing that went RIGHT this week?** One sentence, specific number.
2. **What's the #1 thing that went WRONG this week?** One sentence, specific number. No excuses.
3. **What channel produced the cheapest paying customer?** Numbers. Then: can we do more of that?
4. **What channel wasted the most budget?** Numbers. Then: pause or iterate? Pick.
5. **What's the ONE bet for next week?** One specific thing to try. Not five. One.

## Automatic alerts (between reviews)

Set up in Supabase Row-Level triggers + Resend alerts to Paul's email.

| Alert | Condition | Action |
|---|---|---|
| Spend runaway | Daily ad spend > £50 | Email + SMS |
| CAC spike | Weekly blended CAC > £20 | Email |
| Conversion drop | Weekly signup→paid < 0.5% | Email |
| Cron failure | Any `/api/cron/*` returns non-2xx | Email |
| Unapproved draft backlog | `content_drafts.status='pending'` > 10 | Email |
| Pending UGC outreach | `ugc_creators.status='pending_send'` > 15 | Email |

## The dashboard build — data sources

All numbers read-only from existing tables + PostHog API. No new data pipelines needed.

```
/admin/kpi-weekly
├── Hero: The 12 numbers
├── Chart: Signups by source this week vs last week
├── Chart: Weekly paid conversions (rolling 8 weeks)
├── Table: Ad creative performance (CTR, CPA, spend, fatigue)
├── Table: Content drafts review backlog
├── 5 Questions form (inserts into business_log on save)
└── Export to markdown (for handoff-notes.md)
```

Implementation: single Next.js admin page with server-side data loaders. About 4 hours of build. Blocking for launch week if Paul wants to avoid doing the review manually in spreadsheets.

## What this review is NOT

- **Not a product roadmap review.** Roadmap is separate — owned via the `shared-context/task-queue.md` file.
- **Not a feature launch review.** Done via PR descriptions + code review on GitHub.
- **Not a financial review.** MRR and spend only. Full finance lives in Stripe + accounting.
- **Not a support / user sentiment review.** Sam/Riley handle tickets; separate weekly.

## Escalation rules

If any of these hold for 2 consecutive weeks, Paul stops the sprint and re-plans:

- CAC > £20 blended
- Weekly signup→paid conversion < 0.3%
- Letter generation failure rate > 5%
- Any single channel consuming > 70% of acquisition AND that channel is paid (platform dependency risk)

## Friday workflow

**10:00 — Open `/admin/kpi-weekly` dashboard**
**10:05 — Read the 12 numbers; scan charts**
**10:10 — Answer the 5 questions; save**
**10:15 — Scan ad creative table; pause the bottom 3, double the top 1**
**10:20 — Clear content-draft backlog (approve/reject)**
**10:25 — Clear UGC outreach backlog (send/edit/reject)**
**10:28 — Export markdown; paste into `handoff-notes.md`; commit**
**10:30 — Done**

## Monthly review

First Friday of each month, extended to 60 minutes. Adds:

- Review sprint targets — adjust if consistently under/over
- Check Yapily/Switchcraft/Stripe bill trends (cost side)
- Pick one experimental bet for the month (new channel, new offer, new creative concept)
- Review the `business_log` entries — are AI agents actually producing useful output, or just noise

## Quarterly review

Optional — Paul + an advisor. Product-market-fit check. If unsure whether to do it, you don't need to yet.
