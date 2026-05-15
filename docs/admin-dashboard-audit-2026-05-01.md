# Admin Dashboard Audit — 2026-05-01

Audit done off `origin/master` HEAD `97b0ce54`.

## User-side sidebar (src/components/dashboard/DashboardShell.tsx)

NAV groups: Main / Save money / Account.

- Main: Overview, Money Hub, Subscriptions, **Disputes** (already present at line 72), Contract Vault
- Save money: Deals, Rewards, Pocket Agent, Paybacker Assistant
- Account: Export, Profile

**Finding:** Disputes link is already wired into the user-side sidebar pointing at `/dashboard/disputes`. Founder report was stale — no change needed for Phase 2. (The badge shows "New" for Pocket Agent only; Disputes is treated as a primary feature, available to all tiers; usage limits are enforced server-side.)

## Admin pages on disk (src/app/dashboard/admin/)

| Path | LoC | Linked from /admin? | Notes |
|---|---|---|---|
| `analytics/page.tsx` | 521 | yes (link) | PostHog/funnel analytics |
| `b2b/page.tsx` | 380 | yes (link) | B2B waitlist + API keys |
| `billing/page.tsx` | 212 | **NO — added in this PR** | Cost ledger (PR #370) |
| `cancel-info/page.tsx` | 430 | yes (link) | Cancellation reasons / churn |
| `consumer-leads/page.tsx` | 23 (+ ConsumerLeadsClient) | yes (link) | Cart-abandonment funnel (PR #400) |
| `crons/page.tsx` | 255 | yes (link) | Cron schedules + run-now buttons |
| `dispute-agent/page.tsx` | 195 | **NO — added in this PR** | PR #408 — agent decision telemetry |
| `dispute-intelligence/page.tsx` | 294 | **NO — added in this PR** | PR #406 — outcome dataset analytics |
| `legal-refs/page.tsx` | 1637 | yes (link as "Legal Refs") | Compliance Centre |
| `legal-updates/page.tsx` | 548 | not linked | (separate from legal-refs) |
| `restore-bank-data/page.tsx` | 254 | yes (link) | Bank txn restore tool |
| `whatsapp/page.tsx` | 184 | **NO — added in this PR** | PR #404 — Twilio template SIDs |

## Admin tabs inside the unified `page.tsx`

Tabs (state-driven, not separate routes): `overview` / `members` / `tickets` / `leads` / `ai_team`.

- **Overview** — `/api/admin/metrics` returns MRR, ARR, paying customers, free users, tier breakdown, deal health, recent signups. **Real data.**
- **Members** — `/api/admin/members` list + drill-in. **Real data** (1 row already loads).
- **Tickets** — `<TicketList>` queries `/api/support/tickets` with `status=active`. **BROKEN — see below.**
- **Leads** — `<LeadsList>` queries `leads` table directly via Supabase client. Currently 0 rows. Component is healthy, table is empty.
- **AI Team** — `<AITeamPanel>` queries `/api/admin/team-status`. Recent overhaul wired it to real cron data, but the component still presents the legacy executive C-suite without flagging that most are dormant.

## Supabase-verified row counts (2026-05-01)

```
support_tickets       16   (15 resolved, 1 awaiting_reply, 0 open/in_progress)
leads                  0   (social DM funnel — table empty)
consumer_leads         0   (cart-abandonment CRM — table empty)
disputes              30
agent_runs (30d)      44
agent_messages (30d)   0   (Managed Agents truly not firing — confirms CLAUDE.md)
business_log (7d)   1110
```

## Headline findings

1. **Tickets tab broken — query bug, not data.**
   - `support_tickets` has 16 rows (15 resolved, 1 awaiting_reply).
   - Default UI filter was `status=active`, which the API mapped to `['open','in_progress']` — **omitting `awaiting_reply`** and resolved/closed.
   - Result: founder saw a hardcoded "0 tickets" in a system that has been running tickets for weeks.
   - **Fix in this PR:**
     - `src/app/api/support/tickets/route.ts` — `'active'` now maps to `['open','in_progress','awaiting_reply']` (the full not-yet-closed set).
     - `src/components/admin/TicketList.tsx` — default filter changed from `'active'` to `''` (all), so the founder lands on the full ticket history with the active-only one click away.

2. **Dispute Intelligence (PR #406) missing from admin nav.** Page exists at `/dashboard/admin/dispute-intelligence` but the tab strip on `/dashboard/admin` had no link. Added in this PR.

3. **Dispute Agent (PR #408) missing from admin nav.** Page exists at `/dashboard/admin/dispute-agent`. Added.

4. **WhatsApp templates (PR #404) missing from admin nav.** Page exists at `/dashboard/admin/whatsapp`. Added.

5. **Billing (PR #370) missing from admin nav.** Page exists at `/dashboard/admin/billing`. Added.

6. **Disputes already in user sidebar.** Founder report was stale — no change needed.

7. **Leads / Consumer Leads "overlap" is a labelling problem, not a data problem.**
   - Two distinct tables, two distinct funnels:
     - `leads` (30 columns: name, email, platform, platform_user_id, first_message, source_post_id, status, follow_up_at, notes, ...) — social DM/comment funnel.
     - `consumer_leads` (31 columns: stripe_checkout_session_id, intended_tier, funnel_stage, discount_code, ...) — Stripe cart-abandonment + pricing-page exit CRM.
   - Schemas barely overlap — a single physical UNION view would be lossy on either side.
   - **Fix in this PR:** kept both, but added a "Source: Social DM funnel" clarifier banner in `<LeadsList>` with a one-click "Open Consumer Leads" link, and renamed the Consumer Leads tooltip to make the split explicit. A future PR can build a unified view if usage data warrants it.

8. **AI Team page is honest now but wasn't.**
   - `agent_messages` 0 rows in last 30d ⇒ Claude Managed Agents are configured but not firing (confirms the CLAUDE.md audit on 17 Apr).
   - **Fix in this PR:** added an amber "Honest state" primer at the top of `<AITeamPanel>` that lists the active workers, the configured-but-dormant Managed Agents, and the Railway-disabled C-suite, with a one-click link to the Claude Managed Agents console at `https://claude.ai/code/agents`. A full per-agent drill-in rewrite is out of scope for this PR.

9. **`legal-updates/page.tsx` (548 LoC) is on disk but not linked anywhere** in the admin tab strip. No founder complaint about it; left as-is for follow-up. May be obsolete now that `legal-refs` covers the compliance workflow.

## Out of scope for this PR (filed for follow-up)

- True per-tab `<details>` consolidation of the in-page tabs vs the link strip — the current admin shell mixes both. A follow-up PR can convert all admin pages into proper sidebar entries on the admin shell so the founder can deep-link without the tabbed monolith.
- Unified Leads view (single UNION query across `leads` + `consumer_leads`).
- AI Team per-agent drill-in drawer with last-10-runs.
- Tickets empty-state copy for the active filter.
