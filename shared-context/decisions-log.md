# Decisions Log

## 2026-03-26 -- Founding member pricing
**Decision:** Essential 4.99/mo, Pro 9.99/mo (founding member rates)
**Reason:** Original 9.99/19.99 too expensive for early users. Need to remove friction.
**Made by:** Founder

## 2026-03-26 -- Founding members paused
**Decision:** Disable founding member auto-upgrade during Awin testing
**Reason:** Oscar from Awin needs clean test flow without auto-upgrade interfering
**Made by:** Founder

## 2026-03-26 -- System user token for Meta
**Decision:** Use never-expiring system user token instead of user tokens
**Reason:** User tokens expire, system tokens don't. Enables fully autonomous posting.
**Made by:** Founder + Claude Code

## 2026-03-26 -- Daily social posting
**Decision:** Automated daily posts at 10am with Perplexity research
**Reason:** Need consistent social presence for user acquisition. Manual posting doesn't scale.
**Made by:** Founder

## 2026-03-26 -- Developer agent creates PRs only
**Decision:** Developer agent works on branches, never main. PRs require review.
**Reason:** Safety. Autonomous code changes to production are too risky.
**Made by:** Claude Code

## 2026-03-26 15:42:39 - Adopted aggressive 12-month £100K MRR execution plan. Starting budget £5K/month scaling to £18K cap. Influencer-led strategy (40% of budget) with Google Ads (20%), Meta Ads (15%), TikTok Spark Ads (10%), SEO (10%), Tools (5%). PR/partnerships strategy targeting MSE, Martin Lewis, Which?, MoneySupermarket for free growth spikes. Self-funding model: reinvest 80% of MRR.
**Decision:** Adopted aggressive 12-month £100K MRR execution plan. Starting budget £5K/month scaling to £18K cap. Influencer-led strategy (40% of budget) with Google Ads (20%), Meta Ads (15%), TikTok Spark Ads (10%), SEO (10%), Tools (5%). PR/partnerships strategy targeting MSE, Martin Lewis, Which?, MoneySupermarket for free growth spikes. Self-funding model: reinvest 80% of MRR.
**Reason:** Model projects £97.9K MRR at M12 from paid channels alone. PR/partnership expected value adds £15K+/mo, putting £100K+ MRR within reach. Total 12-month spend £162K, total revenue £462K, net positive £300K. Revenue exceeds spend from Month 3. Assumptions: 0.52 signups/£1 (influencer-led), 8.5% conversion, 2.5% churn, 0.22 viral coefficient.
**Made by:** Paul (founder) + Claude Desktop (Cowork)

## 2026-03-26 16:06:43 - Marketing plan Day 1 is gated on: (1) Google Ads developer token approval, (2) Google OAuth verification, (3) TrueLayer production status. Until all three are live, focus on pre-launch tasks that don't require these: MSE Forum reputation building, influencer identification, SEO content, and product bug fixes. The 90-day clock starts when all three are approved, not on a fixed calendar date.
**Decision:** Marketing plan Day 1 is gated on: (1) Google Ads developer token approval, (2) Google OAuth verification, (3) TrueLayer production status. Until all three are live, focus on pre-launch tasks that don't require these: MSE Forum reputation building, influencer identification, SEO content, and product bug fixes. The 90-day clock starts when all three are approved, not on a fixed calendar date.
**Reason:** Spending £5K/month on ads that drive users to a product where bank connections and email scanning don't work would waste budget and create a bad first impression. Better to nail the product experience first, build MSE Forum reputation (free), identify creators (free), and fix remaining bugs — then launch hard when everything is ready.
**Made by:** Cowork + Paul

## 2026-03-26 16:09:39 - Google Ads API: Explorer access confirmed. Awaiting upgrade to Basic access. Campaigns cannot launch until Basic access approved. Updated blocker status accordingly.
**Decision:** Google Ads API: Explorer access confirmed. Awaiting upgrade to Basic access. Campaigns cannot launch until Basic access approved. Updated blocker status accordingly.
**Reason:** Paul confirmed Google Ads API access at Explorer level but Basic access (needed for campaign management) is still pending approval. This remains a launch blocker alongside Google OAuth verification and TrueLayer production.
**Made by:** Paul + Cowork

## 2026-03-26 16:09:42 - Pre-launch mode activated. Paused ad-performance-monitor and weekly-performance-review scheduled tasks. Morning briefing updated to deliver pre-launch prep tasks until all 3 blockers clear (~2 April). Social posting continues as brand awareness.
**Decision:** Pre-launch mode activated. Paused ad-performance-monitor and weekly-performance-review scheduled tasks. Morning briefing updated to deliver pre-launch prep tasks until all 3 blockers clear (~2 April). Social posting continues as brand awareness.
**Reason:** No ads running yet, no product live yet. Monitoring tasks would produce empty reports. Focus shifts to free preparation work: influencer research, MSE forum engagement, PR prep, SEO content, and product testing.
**Made by:** Cowork

## 2026-03-26 19:30:37 - 10 features implementation plan finalised. Priority: P1 (Sprint 1): Share Your Win, Credit Score Warning, Price Increase Alerts, Smart Bill Comparison. P2 (Sprint 2): One-Click Switching, Receipt Scanner, Savings Challenges, Annual Financial Report. P3 (Sprint 3): WhatsApp Bot, Household Mode. Total: 41-56 dev days over 14 weeks. Architecture: Claude Vision for receipts, existing deals/energy_tariffs for bill comparison, WhatsApp Cloud API for bot, shared OG image generation, unified notification system.
**Decision:** 10 features implementation plan finalised. Priority: P1 (Sprint 1): Share Your Win, Credit Score Warning, Price Increase Alerts, Smart Bill Comparison. P2 (Sprint 2): One-Click Switching, Receipt Scanner, Savings Challenges, Annual Financial Report. P3 (Sprint 3): WhatsApp Bot, Household Mode. Total: 41-56 dev days over 14 weeks. Architecture: Claude Vision for receipts, existing deals/energy_tariffs for bill comparison, WhatsApp Cloud API for bot, shared OG image generation, unified notification system.
**Reason:** Features ranked by impact-to-effort ratio. Quick wins (#8 Share Your Win, #10 Credit Score Warning) ship in days and drive virality + trust. Price Increase Alerts (#5) is a unique differentiator no UK competitor offers. Smart Bill Comparison (#1) is the core value prop. P3 features (WhatsApp, Household) deferred due to external API approvals and complex data models. All features designed to integrate with existing chatbot, loyalty points, and merchant normalisation systems.
**Made by:** Cowork (Claude Desktop) — designed with founder approval

## 2026-03-27 19:09:50 - AI Letters Intelligence Upgrade: Use structured legal reference table (not RAG/vector DB) for legal knowledge base
**Decision:** AI Letters Intelligence Upgrade: Use structured legal reference table (not RAG/vector DB) for legal knowledge base
**Reason:** UK consumer law is a bounded, stable corpus (~15-20 key statutes cover 95% of disputes). Structured lookup by category/subcategory is more accurate (deterministic), cheaper ($0.006/request vs $20-50/mo for vector DB), and simpler (no embedding pipeline, no retrieval tuning) than RAG or vector search. Updates are simple INSERT/UPDATE statements, no re-embedding needed. 5 new tables: legal_references, disputes, correspondence, contract_extractions, provider_terms. 5-phase delivery plan totalling ~12-15 dev days.
**Made by:** Claude (Cowork architect)


## 2026-03-29: Gmail Scanner Fixed End-to-End

### Problem
Email scanner was broken across multiple layers — returned 0 results, spinner never stopped, results never displayed.

### Root Causes Found & Fixed

**1. Gmail API queries too restrictive (backend)**
- Commit `a1c5ec9` changed Gmail search to narrow subject/from filters with `newer_than:90d` → returned 0 emails
- Fix: Changed to broad `newer_than:1y` query, maxResults=80, fetch 40 email details, 50 provider cap
- Commits: `3772982`, `9e41c24`

**2. Haiku system prompt too minimal (backend)**
- Original prompt just said "Skip marketing emails" → only returned 4 opportunities
- Fix: Replaced with aggressive pattern-based prompt that identifies opportunities by type (subscription, bill, renewal, insurance, etc.) not by provider name
- Now returns 17-22 opportunities from Paul's inbox
- Commits: `c550a2f`, `c192a5f`

**3. Frontend scanner page bugs (3 exact issues)**
- `setScanningEmailId(null)` was not in a `finally` block → spinner never stopped
- `setScanResults(opps)` was not called → results never stored in state
- No JSX section rendered the opportunities list
- All 3 fixed in commit `bd0252f`
- Key: Vercel deployed successfully but browser cache served old JS bundle. Hard refresh (Cmd+Shift+R) was needed.

### Key Technical Details
- Scan API flow: Frontend → `/api/email/scan` (for IMAP) OR directly to `/api/gmail/scan` (for Google OAuth)
- Frontend calls `/api/gmail/scan` directly when `conn.authMethod === 'oauth' && conn.provider === 'google'`
- Gmail scan route: refreshes token → queries Gmail API → fetches email metadata → groups by sender → sends to Claude Haiku → parses JSON response → saves to `tasks` and `scanned_receipts` tables
- Model: `claude-haiku-4-5-20251001` with `max_tokens: 8192`
- Gmail query: `newer_than:1y` with `maxResults=80`
- State variables in scanner component: `scanningEmailId` (scanning state), `scanResults` (opportunities array), `emailScanResults` (count per connection), `opportunities` (mapped results)

### Test Account for Google OAuth Verification
- Email: `googletest@paybacker.co.uk`
- Password: `GoogleTest2026!`
- user_id: `cc7889a9-15c1-4a69-aafa-92a6f9a8a621`
- Profile: Pro tier with fake Stripe IDs (`sub_test_google_reviewer_pro`, `cus_test_google_reviewer`)
- Important: `getUserPlan()` in `src/lib/get-user-plan.ts` downgrades to free if no `stripe_subscription_id` exists — that's why we added fake Stripe IDs
- Auth fix: bcrypt cost factor had to be 10 (not 6), and token fields needed empty strings not nulls

### Known Remaining Issues
- Suggested action buttons on opportunities don't do anything yet (track/cancel/switch_deal etc.)
- Will fix after Google verification is approved

## 2026-03-31 15:49:31 - Proceed with Yapily as Open Banking provider, replacing TrueLayer. Remove all bank balance displays from MoneyHub until FCA agent registration is approved (~2 months). Replace Net Position card with Savings Rate percentage. Add feature flag SHOW_BANK_BALANCES to gate balance display functionality.
**Decision:** Proceed with Yapily as Open Banking provider, replacing TrueLayer. Remove all bank balance displays from MoneyHub until FCA agent registration is approved (~2 months). Replace Net Position card with Savings Rate percentage. Add feature flag SHOW_BANK_BALANCES to gate balance display functionality.
**Reason:** Yapily confirmed that displaying bank account balances constitutes providing consolidated account information under PSD2/PSRs, which requires FCA agent registration. Transaction-derived data (spending, income, categories) can be shown without FCA approval. This allows Paybacker to launch with full transaction analytics while FCA registration is processed in parallel.
**Made by:** Paul Airey

## 2026-04-01 09:05:56 - Monthly P&L Review (March 2026): Pre-launch month with £19.97 real MRR and ~£88 total costs. Execution plan M1 has NOT started — all 3 blockers still pending. Recommend: (1) daily blocker chasing, (2) fix Facebook token + ad metrics cron, (3) landing page CRO before scaling ads, (4) soft launch to friends/family immediately, (5) submit FCA agent registration for Yapily, (6) update budget model with Yapily £1,500/mo cost.
**Decision:** Monthly P&L Review (March 2026): Pre-launch month with £19.97 real MRR and ~£88 total costs. Execution plan M1 has NOT started — all 3 blockers still pending. Recommend: (1) daily blocker chasing, (2) fix Facebook token + ad metrics cron, (3) landing page CRO before scaling ads, (4) soft launch to friends/family immediately, (5) submit FCA agent registration for Yapily, (6) update budget model with Yapily £1,500/mo cost.
**Reason:** March was a build month, not a growth month. 80+ features deployed, full UAT passed, but no real marketing spend due to blockers. Only 1 confirmed external paying user. Google Ads ran briefly at ~£10.60/day with 0 conversions — landing page conversion needs optimising before scaling. Yapily decision adds significant new cost (£1,500/mo). All M1 forecast variances are expected since the 12-month growth clock hasn't started yet.
**Made by:** Automated Monthly P&L (Cowork)

## 2026-04-01 16:55:48 - Replace localStorage-based expected bills dismiss with Supabase database persistence
**Decision:** Replace localStorage-based expected bills dismiss with Supabase database persistence
**Reason:** localStorage approach has a React state batching bug — rapid dismissals overwrite each other, only last survives refresh. Created dismissed_expected_bills table with RPC functions for dismiss/restore/get. Frontend needs updating to use these RPCs instead of localStorage.
**Made by:** Paul / Claude Cowork

## 2026-04-01 16:55:50 - Add database trigger to auto-apply category overrides to bank_transactions
**Decision:** Add database trigger to auto-apply category overrides to bank_transactions
**Reason:** Recategorisation was not persisting — money_hub_category_overrides saved the override but bank_transactions.user_category was never updated, so on page refresh old category reappeared. Trigger now fires AFTER INSERT/UPDATE on overrides and applies to matching transactions automatically.
**Made by:** Paul / Claude Cowork

## 2026-04-01 16:55:52 - Create server-side spending calculation functions that exclude transfers and income
**Decision:** Create server-side spending calculation functions that exclude transfers and income
**Reason:** Frontend spending total was £76K instead of £20K because transfers were counted as spending. Created get_monthly_spending() and get_monthly_spending_total() which exclude user_category IN ('transfers','income') and category='TRANSFER'. Frontend should use these instead of summing all negative transactions.
**Made by:** Paul / Claude Cowork

## 2026-04-01 17:06:00 - Reclassify inter-account transfers as transfers, not income
**Decision:** Reclassify inter-account transfers as transfers, not income
**Reason:** Income was massively over-inflated because money moving between Paul's own accounts (JPG OPERATIO DIRECTOR, AIRPROP LTD FLEXIPAY, AIREY P A CD LLOYDS, JPG OPERATIO LOAN REPAYMENTS) was being counted as income. 114 transactions reclassified from income to transfers, removing £71,962 of double-counted income. Added merchant_rules entries for these patterns so the system catches them for ALL users. Created get_monthly_income_total() and get_monthly_income() functions as the server-side source of truth for income calculations.
**Made by:** Paul / Claude Cowork
