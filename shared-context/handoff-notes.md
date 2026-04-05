## Active Handoff Notes

### RAILWAY AGENTS — DISABLE IMMEDIATELY (2026-04-05)
The Railway-hosted agent server (`agent-server/`) is legacy and must be disabled. These agents only monitor/report and waste compute.

**To disable:** Go to Railway.app → your project → agent-server service → Settings → Suspend Service (or set env var `AGENTS_ENABLED=false` in Railway dashboard).

**Replacement:** Cowork scheduled tasks (Paperclip agents) are now the execution layer. They run as Claude Code sessions on Paul's machine with full git, gh CLI, and code-writing capability.

**Active Cowork tasks created 2026-04-05:**
- `dev-sprint-runner` — Daily 7am. Picks top Critical task, implements it, creates PR, notifies Paul via Telegram.
- `paperclip-business-monitor` — Daily 6pm. Monitors PR status, sprint completions, business health.

The Vercel cron `/api/cron/executive-agents` was already effectively disabled (scheduled for Jan 1st once a year). The Railway Docker container is the only thing that needs to be suspended.

---

### FCA COMPLIANCE — CRITICAL BLOCKER
As of 31 March 2026, Paybacker MUST NOT display bank account balances anywhere in the UI. This is an FCA regulatory requirement — we do not have agent registration yet. Only transaction-derived data (spending, income, categories, scores) can be shown. See memory.md for full rules.

**Outstanding fix:** The Money Hub "Net position" card still shows a £ value and needs replacing with "Savings Rate" percentage. The Antigravity prompt was sent (claude-code-moneyhub-fca-compliance.md) but may not have been applied yet. If Net Position is still visible, apply the fix from that prompt.

### Yapily Migration
- Moving from TrueLayer to Yapily as Open Banking provider
- Christian (Yapily) sending requirements document on what can/cannot be shown
- Integration requirements saved in infrastructure.md
- DO NOT fetch balance endpoints from Yapily API, only transaction endpoints

### QA Testing Pass Pending
Paul is about to do a full systematic QA pass of every feature. Known issues:
- Spending Breakdown > Mortgages drill-down only shows one mortgage (should be multiple)
- Naming conventions need review across all pages
- Multiple minor UI/data issues expected

### DBS Check
- Paul submitted Basic DBS check application on 31 March 2026
- Needed for FCA fit and proper test
- Takes up to 14 days to process

### Google Ads API
- Basic Access application submitted, awaiting review (typically 3 business days)
---

## 2026-04-01 02:04:53 - Cowork
**Completed:** Built and deployed tier-based automatic bank sync infrastructure. Diagnosed April sync failure (expired TrueLayer tokens + sandbox mode). Deployed Supabase edge function `bank-sync` with auto/manual/month-end triggers. Set up pg_cron jobs (6h auto-sync + 1st-of-month sweep). Created database functions for tier-based rate limiting (Free=1x/24h, Essential=daily, Pro=every 6h). All 3 bank connections marked expired — user must reconnect when Yapily goes live.

**Next steps:** 1. Set TRUELAYER_CLIENT_SECRET and CRON_SECRET in Supabase Edge Function secrets. 2. Wire frontend Sync button to call edge function with JWT. 3. Add expired connection banner with reconnect flow. 4. Implement Money Hub sparse data handling (March recap, expected bills when April is empty). 5. Add tier-based sync frequency badges and free-tier upgrade prompts.

---

## 2026-04-01 02:20:52 - Cowork
**Completed:** Built contract end date alerting and deal targeting system. Database migration adds contract_renewal_alerts table, subscriptions_expiring_soon view, find_best_deal_for_subscription() function, and trigger to auto-populate contract dates from bill uploads. Edge function contract-alerts deployed, runs daily at 7am via pg_cron, sends tiered email alerts (60/30/14/7/3 days) with matched affiliate deals showing potential savings. All subscription contract_end_dates are currently NULL — frontend needs updating for manual entry and bill upload extraction.

**Next steps:** 1. Run Claude Code prompt: claude-code-contract-alerts-prompt.md. 2. Add contract details section to subscription edit form (end date, term, auto-renew, exit fee). 3. Add Upload Bill button that creates contract_extractions with subscription_id (trigger auto-populates dates). 4. Show contract status badges on subscription list. 5. Display in-app alerts from contract_renewal_alerts table. 6. Add Contracts Expiring Soon card to Money Hub.

---

## 2026-04-01 09:06:25 - Cowork (Monthly P&L)
**Completed:** March 2026 Monthly P&L completed. Pre-launch month: £19.97 real MRR, ~£88 total costs, net loss ~£68. 35 users (mostly test), 1 real external paying user. 80+ features built. All 3 hard blockers still pending. Full P&L appended to business-ops.md, project-status.md updated with Monthly P&L section, decision logged.

**Next steps:** CLAUDE CODE ACTION ITEMS:
1. **FIX: Facebook page access token** — get_recent_posts returns OAuthException 190 "User access token is not supported". Casey agent cannot post to Facebook. Need to regenerate or fix the Page access token (system user token may need Page-level permissions).
2. **FIX: daily_ad_metrics cron** — Table is completely empty. The daily 7am cron that pulls Google Ads / Meta Ads metrics is either not running or failing silently. Debug and fix. This is critical before ads go live.
3. **FIX: Google Ads conversion tracking** — ~100+ clicks, 0 conversions logged. Verify that the Supabase signup triggers a Google Ads conversion event (or offline conversion upload). Without this, auto-optimisation crons will never fire.
4. **BUILD: Landing page CRO** — Add social proof, clearer CTA, trust signals to homepage. 0% conversion from paid traffic is a red flag that must be fixed before scaling spend.
5. **BUILD: Yapily integration** — Begin sandbox integration per Yapily meeting (31 March). Remove bank balance displays from MoneyHub. Replace Net Position card with Savings Rate. Add SHOW_BANK_BALANCES feature flag.
6. **UPDATE: Budget model** — Add Yapily £1,500/mo to cost projections. Re-forecast M1 start date.

---

## 2026-04-01 13:05:19 - Cowork Scheduled Task (Influencer/PR Pipeline)
**Completed:** Completed Wednesday 1 April influencer/PR pipeline research. Identified 15 UK personal finance nano/micro creators across TikTok and Instagram (8 nano at £150-400/video, 7 micro at £400-800/video). Drafted 2 outreach DM templates (nano DM + micro email). Compiled journalist contact list (8 journalists + 3 podcast targets). Researched MSE forum — found relevant user pain points (manual updates, limited integrations, confusing UIs) that align with Paybacker's features. Logged full report to business-ops.md. Added 4 new tasks.

**Next steps:** 1. Paul: Verify creator follower counts via HypeAuditor/Modash before outreach. 2. Cowork: Build influencer tracker spreadsheet (next available session). 3. Post-launch: Begin outreach starting with HIGH priority nano creators (cheapest, most authentic). 4. Post-launch: Send PR pitches to Guardian Money (Patrick Collinson) and BBC (Kevin Peachey) — drafts already in Gmail. 5. Next pipeline run (8 April): If launched, switch to active outreach mode. If not, continue research and add more creators to shortlist.

---

## 2026-04-01 17:02:17 - Claude Cowork
**Completed:** Major database and system fixes applied:

DATABASE FIXES:
1. Category override persistence trigger (trg_apply_category_override) — recategorisation now persists on refresh
2. Universal auto_categorise_transactions() function — uses merchant_rules for ALL users
3. Self-learning trigger (trg_learn_from_override) — user recategorisations feed back into merchant_rules
4. get_monthly_spending() / get_monthly_spending_total() — correct spending excluding transfers/income
5. get_subscription_total() / dismiss_subscription() / cancel_subscription() — return updated totals
6. get_subscriptions_with_actions() — returns subscriptions with cancellation info from merchant_rules
7. generate_cancellation_email() — produces cancellation email template for any subscription
8. 32 merchant_rules entries updated with cancellation URLs/emails/phones
9. 1,200+ transactions recategorised (transfers, income, shopping, bills, mortgages, etc.)
10. 'transfer' normalised to 'transfers' everywhere
11. Revolut card top-ups fixed to 'transfers'
12. Feb spending: £76,723 corrected to £20,618.55

DATA QUALITY:
- 369 transactions still have NULL user_category (mostly older card purchases without clear merchant names)
- All TRANSFER/CREDIT/DIRECT_DEBIT/STANDING_ORDER categories now properly mapped
- auto_categorise_transactions() should be called after every bank sync for all users

**Next steps:** FRONTEND CHANGES NEEDED (in priority order):

1. CRITICAL: Replace localStorage dismiss with Supabase RPCs for expected bills
2. CRITICAL: Use get_expected_bills RPC instead of client-side computation
3. CRITICAL: Use get_monthly_spending_total RPC for spending banner
4. CRITICAL: Use get_subscriptions_with_actions for subscription list
5. CRITICAL: Use dismiss_subscription/cancel_subscription RPCs (returns updated total)
6. CRITICAL: Show cancellation options consistently for ALL subscriptions
7. HIGH: Add spending category totals to breakdown
8. MEDIUM: Move Savings Goals above Financial Actions Centre

EDGE FUNCTION CHANGES:
9. CRITICAL: In bank-sync, call auto_categorise_transactions(user_id) after every sync
10. CRITICAL: In bank-sync, call fix_ee_card_merchant_names(user_id) after every sync
11. CRITICAL: In bank-sync, call detect_and_sync_recurring_transactions(user_id) after sync

See /mnt/outputs/money-hub-fixes.md and /mnt/outputs/paybacker-frontend-fixes.md for detailed code patches.

---

## 2026-04-01 17:58:37 - Dispatch (Cowork)
**Completed:** Major session: Tiered bank sync (free/essential/pro), self-learning chatbot with product_features DB, interactive AI financial assistant with 19 tool functions and correction logging, plus 10+ bug fixes (mortgage drill-down, grocery budget, gym terms in letters, white text copy/paste, email connection status, price alerts overview, subscription totals/checkboxes/dont-recognise flow, Vercel build errors, RLS security fixes). All deployed to production.

**Next steps:** 1. Manual testing of tiered bank sync (connect as free user, verify 1 account limit and weekly sync). 2. Test chatbot interactive features (recategorise, search transactions, add subscription). 3. Phase 3 Contract Upload UI still not started. 4. The email spam fix (daily digest consolidation) from the task queue is still outstanding. 5. Consider running the chatbot gap analysis cron manually to see initial insights.

---

## 2026-04-01 22:51:25 - Dispatch (Cowork)
**Completed:** Consumer UX audit implementation: Homepage overhaul (founder section, live stats, simplified pricing, founding counter, 3-step guide, blog deep links, Trustpilot placeholder). Onboarding flow (guided quick win, bank nudge, upgrade triggers, empty states, try-before-signup). Auth redirect deep link fix in progress.

**Next steps:** 1. Set up Trustpilot business page and link it. 2. Add a real founder photo to replace the initials avatar. 3. Auth redirect fix deploying now. 4. Consider A/B testing the onboarding flow. 5. Manual test the full signup-to-value journey as a new free user.
