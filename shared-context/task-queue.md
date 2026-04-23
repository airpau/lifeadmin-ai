# Task Queue (Updated 6 Apr 2026)

## IMMEDIATE — Paul to action
- [ ] **Set EMAIL_ENCRYPTION_KEY in Vercel** — Required for Yahoo Mail IMAP. Run `openssl rand -hex 32` and add to Vercel env vars. Without this, Yahoo password encryption/decryption will fail.
- [ ] **Complete Azure publisher verification** — Go to Microsoft Partner Center, get MPN ID, then add it in Entra admin center → App registrations → Paybacker Email Scanner → Branding → Publisher verification. Required for Outlook OAuth consent screen.
- [ ] **DISABLE Railway agents** — Go to Railway.app → your project → agent-server service → Settings → Suspend Service. These are legacy and wasting compute. Paperclip Cowork tasks are the new execution layer.
- [ ] **Add GITHUB_TOKEN to Vercel env** — Required for the daily-ceo-report to show open PRs. Generate at github.com/settings/tokens (repo scope). Add to Vercel project environment variables.
- [x] ~~Run dev-sprint-runner~~ — Running daily at 10am, completed first sprint (legal disclaimer) on 6 Apr.

## Agent Execution Layer — Cowork Scheduled Tasks (LIVE as of 5 Apr 2026)
- [x] dev-sprint-runner — Daily 7am. Picks top Critical task, implements, creates PR, Telegrams Paul.
- [x] paperclip-business-monitor — Daily 6pm. Checks PR status, sprint completions, flags urgent items.
- [x] daily-ceo-report updated — Now includes open GitHub PRs and sprint completions (needs GITHUB_TOKEN)

## URGENT - Email Spam Fix
- [~PR#99] Implement global email rate limiter (max 2 emails per user per day) — rate limiter exists in email-rate-limit.ts; PR#99 fixes missing types (contract_expiry_alert, contract_end_alert, overcharge_alert) that were bypassing the cap (PR created 2026-04-20)
- [ ] Consolidate deal alerts + targeted deals + price increases into single daily digest
- [ ] Add user email preference settings (daily digest / weekly / off)
- [ ] Audit and restructure all 11 email cron triggers (see email-audit below)

## Architecture Task - AI Letters Intelligence Upgrade (Consumer-Friendly)
- [ ] Claude Desktop to architect the full AI Letters upgrade (see shared-context/handoff-notes.md for brief)
- [ ] Phase 1: Legal knowledge base - structured reference docs (invisible to user, powers the AI)
- [ ] Phase 2: Dispute conversation tracking - thread per company with uploads
- [ ] Phase 3: Contract upload and T&C analysis via Claude Vision
- [ ] Phase 4: Provider T&C database for major UK companies
- [ ] NOTE: Consumer product - no legal jargon, no "case management" language anywhere

## Outstanding

### Paul to do:
- [ ] Manual feature testing of all 80+ features
- [ ] Set up Trustpilot business page
- [ ] Set LinkedIn vanity URL to linkedin.com/company/paybacker

### Waiting for external:
- [ ] Google OAuth verification — CASA security scan submitted 5 April, awaiting result
- [ ] Yapily contract — replacing TrueLayer as Open Banking provider, awaiting contract from Yapily
- [ ] Microsoft Azure app verification — publisher verification incomplete (no MPN ID linked). Needed for Outlook email scanning consent screen.
- [x] ~~Google Ads Basic API access~~ — REJECTED twice, not pursuing
- [x] ~~Meta App Review~~ — NOT NEEDED, Instagram API works in dev mode
- [x] ~~TrueLayer production approval~~ — REPLACED by Yapily

### Claude Code (when blockers clear):
- [x] ~~Create 3 Google Ads search campaigns~~ — DROPPED (Basic API access rejected)
- [x] ~~Create Meta ad creatives~~ — NOT NEEDED (working in dev mode)
- [ ] Fix any bugs from Paul's manual testing
- [ ] Set EMAIL_ENCRYPTION_KEY in Vercel env — required for Yahoo Mail IMAP password encryption (generate 64-char hex: `openssl rand -hex 32`)

## Completed 26 Mar (80+ items)

### Features (8 of 10 roadmap):
- [x] Share Your Win (social share with referral link)
- [x] Credit Score Warning (amber modal for credit products)
- [x] Price Increase Alerts (daily bank data detection)
- [x] Smart Bill Comparison (side-by-side with Awin links)
- [x] Receipt/Bill Scanner (Claude Vision in AI Letters)
- [x] Savings Challenges (12 gamified, bank-verified)
- [x] Annual Financial Report (PDF, sample for non-Pro)
- [x] AI Self-Learning (confidence-based, nightly cleanup)

### Platform:
- [x] Universal email scanning (IMAP + OAuth)
- [x] X/Twitter integration (posting + engagement)
- [x] ElevenLabs TTS (listen to letters)
- [x] 14-day Pro trial (replaced founding member)
- [x] Referral Stripe rewards (1 free month both parties)
- [x] Meta Ads 2 campaigns (PAUSED)
- [x] Ad metrics + optimisation crons
- [x] Signup attribution tracking
- [x] 4 SEO blog articles + 5 SEO landing pages
- [x] Weekly Money Digest + Churn prevention
- [x] Energy Tariff Monitor
- [x] AI Letters (merged Complaints + Forms, 11 types)
- [x] Bill upload with AI scan + auto-fill
- [x] Comparison widget with actual deals
- [x] Merchant normalisation (120+ patterns)
- [x] 37 bugs fixed (20 v1 + 17 v2)
- [x] Homepage + pricing features updated

### Skipped (v2):
- WhatsApp Bot
- Household Mode
- One-Click Switching
- ElevenLabs video

## Medium
- [x] BUG: disputes.provider_type is NULL on all 13 migrated disputes (Verified fixed via Supabase query 28 Mar. All 13 disputes now have provider_type: energy(8), broadband(4), finance(1).) - All 13 migrated disputes have provider_type = NULL. This field is needed for legal reference lookup (energy, broadband, finance etc.). Fix: backfill based on provider_name mapping — British Gas/Eon/E.ON → 'energy', OneStream/Sky/Virgin Media → 'broadband', LendInvest → 'finance'. Also ensure the dispute creation form sets provider_type going forward. (@Claude Code)
- [x] BUG: Inconsistent provider name casing in disputes table (Verified fixed via Supabase query 28 Mar. All names properly cased: British Gas, E.ON, LendInvest, OneStream, Virgin Media.) - Provider names have inconsistent casing: "eon" vs "Eon", "British gas" vs "British Gas", "Virgin media" vs "Test virgin media ". This will break grouping, deduplication, and provider_terms lookups. Fix: (1) Normalise existing data — UPDATE disputes SET provider_name = CASE patterns. (2) Add a normalisation step in the dispute creation flow that title-cases provider names and trims whitespace. (@Claude Code)
- [x] Phase 2 Gap: Confidence indicator badges on legal reference pills (Built and deployed in commit 8bdb782. Green/amber dots with bg-green-500/bg-amber-500 on rights pills.) - The "Your rights" pills already link to legislation.gov.uk. Add visual confidence badges using the strength column from legal_references. Green = strong, Amber = moderate, Grey = informational. Show on letter preview UI next to each cited reference. (@Claude Code)
- [x] FEAT: Instagram DM auto-reply via ManyChat webhook + Claude AI (Webhook endpoint built and deployed. instagram_dm_log table created. Awaiting Paul to connect ManyChat account.) - Build /api/webhooks/instagram-dm endpoint. ManyChat (or similar Meta-approved tool) receives IG DMs → triggers webhook to Paybacker API → Claude generates contextual reply using product knowledge/FAQs/pricing → returns response via ManyChat API. Log all DM conversations to Supabase for analytics. Paul to connect ManyChat account separately. (@Claude Code)
- [ ] Sign up for HypeAuditor or Modash — verify creator metrics - Before any influencer outreach, sign up for a free trial of HypeAuditor or Modash to verify exact follower counts, engagement rates, and audience demographics for the 15 creators identified in the 1 April pipeline report. Key creators to verify: @mybudgetculture, @thebougiebudget, @savingmoneybish, @lookingafteryourpennies, @budgetingrobyn, @thismumsavesmoney, @thequidsquid, @penniestopounds, @thisgirltalksmoney. (@Paul)
- [ ] Create Influencer Tracker spreadsheet - Build a centralised influencer tracking spreadsheet with columns: Creator Name, Handle, Platform, Followers, Engagement Rate, Content Style, Contact Method, Estimated Cost, Outreach Status, Response, Contract Status, Video Published Date, Referral Link, Signups Attributed, ROI. Pre-populate with the 15 creators from the 1 April pipeline report. (@Cowork)
- [ ] Founder Journey Marketing — launch build-in-public content strategy. Paul's background: CS degree + 10 years IT specialist in UK law firms and banks. Platforms: X/Twitter (daily), LinkedIn (3x/week), Indie Hackers (monthly), Medium (biweekly). Content pillars: problem-first, traction transparency, regulatory insights, founder lessons, community spotlights. First steps: draft founding story Medium article, set up Indie Hackers profile, plan 90-day content calendar. (@Paul + Cowork)
- [ ] Draft MSE Deals Team submission (editorial route) - Prepare a submission to MoneySavingExpert's Deals Team via their official contact form. Position Paybacker as a free consumer tool (not a promo). Angle: 'Free AI tool that finds forgotten subscriptions and writes complaint letters using UK consumer law.' DO NOT post on MSE Forum (ban risk). Editorial/press route only. (@Cowork)
- [~PR#78] Frontend: Move Savings Goals above Financial Actions Centre - In money-hub page.tsx, move the Savings Goals section to sit next to the Budget Planner, above the Financial Actions Centre. Paul says it's currently too hard to find. (@Claude Code) (PR created 2026-04-19)
- [x] Feature: Google Sheets daily export of connected accounts (Lunchflow parity) - Paul subscribes to Lunchflow specifically because it exports all connected bank accounts to a Google Sheet updated daily — a single point of truth for tracking accounts. Paybacker should offer the same (and ideally more). Implementation plan: (1) FCA compliance check FIRST — confirm that exporting transaction data to a third-party sheet is permitted under our existing Open Banking registration. Lunchflow has this permission so it's likely fine, but must be verified. (2) Add Google Sheets OAuth scope (spreadsheets) to existing Google auth flow. (3) Build daily export cron: pull all transactions from Supabase for the user → group by account → write/update a Google Sheet with standard columns (Date, Description, Amount, Category, Account, Merchant). (4) On first run: create new sheet named "Paybacker — [user name] Accounts". On subsequent runs: append new rows since last export. (5) UI: "Export to Google Sheets" button in Money Hub or Settings → connect flow → confirmation with sheet link. Key questions for Paul before build: all-time or rolling 12 months? One tab per account or single tab with account column? Configurable columns? (@Claude Code + Cowork architecture review) (@Claude Code)

## Low
- [x] BUG: disputes table missing DELETE RLS policy (Verified fixed via pg_policies query 28 Mar. Disputes table now has all 4 RLS policies: SELECT, INSERT, UPDATE, DELETE.) - The correspondence table has SELECT/INSERT/UPDATE/DELETE RLS policies, but the disputes table only has SELECT/INSERT/UPDATE — no DELETE policy. Users cannot delete their own disputes. Fix: CREATE POLICY "Users can delete own disputes" ON disputes FOR DELETE USING (auth.uid() = user_id); (@Claude Code)
- [ ] Prepare 30-second app demo clip for creator outreach - Record or generate a 30-second screen recording showing Paybacker's key flow: connect bank → AI scans transactions → finds forgotten subscriptions → generates complaint letter. To be attached to outreach emails/DMs to give creators a quick visual of what the app does. Can be done post-launch once real data is flowing. (@Paul)

## High
- [x] Phase 2 Gap: Build automated legal reference verification cron (Built and deployed in commit 8bdb782. /api/cron/verify-legal-refs/route.ts with weekly schedule in vercel.json.) - No pg_cron extension, no edge functions, no DB functions exist. Build a Vercel cron API route (or Supabase Edge Function) that periodically HTTP HEADs source_urls on legislation.gov.uk and updates last_verified/verification_status/verification_notes. Schema columns already exist on legal_references table. (@Claude Code)
- [x] Phase 2 Gap: Anti-hallucination safeguards in letter generation (Built and deployed in commit 8bdb782. MUST ONLY cite instruction in agent prompt + cross-check logging in generate route.) - Letter generation must ONLY cite legal_references that exist in the DB. Query legal_references by category/applies_to BEFORE generating letter, inject matched refs into the prompt, and instruct Claude to ONLY use provided references — never invent statute names or section numbers. (@Claude Code)
- [x] Phase 2 Gap: Add disclaimer footer to all AI-generated letters (Fixed 6 Apr. Disclaimer shows on web page UI and PDF export only — NOT embedded in letter text. complaints-agent.ts cleaned, complaints/page.tsx already had disclaimer. Dev sprint runner also created shared legal-disclaimer.ts constant on feature branch.)
- [x] Phase 3: Contract Upload UI & Contract Vault (All built and deployed: /dashboard/contracts page with card grid, detail view, upload modal, Claude Vision extraction, status badges, daily expiry alerts cron, letter generation integration, subscription sync.) - Full Phase 3 build: schema changes (nullable dispute_id, add subscription_id, RLS, storage bucket), Claude Vision upload API, /dashboard/contracts vault page, contract expiry alerts, subscription linking, letter generation integration. See handoff notes for full spec. (@Claude Code)
- [x] BUG: Guided tour breaks on step 2 (Framer Motion spotlight) (Fixed and deployed by Claude Code. Tour now progresses through all steps correctly.) - The first-time guided tour with Framer Motion spotlight effect breaks on step 2. Likely a DOM target element not found or timing issue where the component for step 2 hasn't rendered yet when the tour tries to spotlight it. Check the tour step config, ensure the target selector for step 2 exists in the DOM at that point, and add a fallback/retry or waitFor logic. (@Claude Code)
- [x] BUG: AI chatbot cannot render charts/visualisations inline (Fixed and deployed. Chatbot now renders Recharts inline charts (pie, bar, line) within chat responses using JSON chart blocks.) - User asks chatbot for a pie chart of spending. Bot returns text description, claims "widget should display as a visual pie chart" but nothing renders. Bot then gaslights user saying "that's a problem with how the dashboard is displaying it." The chatbot needs to either: (1) render actual charts inline using React components (Recharts/Chart.js) within the chat response, or (2) generate a chart and return it as an image, or (3) link directly to the Money Hub page with the chart pre-filtered. It should NEVER claim to show something it can't render. (@Claude Code)
- [x] Money Hub payments page — thin data, raw bank names, no logos, no actions (Money Hub overhauled with intelligence layer: month-on-month arrows, forecast, insight banner, regular payments summary with 3 tabs. Note: raw bank descriptions still showing on some payment cards — merchant_rules display_name enrichment needed in UI.) - Regular Payments page at /dashboard/money-hub/payments showing raw bank descriptions (LENDINVEST BTL LTD, PAYPAL *DISNEYPLUS35314369001, COMMUNITYFIBRE LTD, SKIPTON B.S.) instead of clean display names. No logos on cards, no action buttons (cancel/switch/view contract), no price change indicators, no usage data. Only 6 subscriptions detected vs 19 on main subscriptions page. Cards are plain — need enrichment from merchant_rules display_name and provider_terms logo_url. (@Claude Code)
- [ ] Build iOS + Android app (Expo/React Native) - Create mobile apps for App Store and Google Play. Google Play Console developer account created 6 Apr (Paybacker LTD, DUNS 234681454). Recommended approach: Expo (React Native) with WebView wrapper for initial release, then gradually convert key screens to native components. Requires: app icons, splash screens, push notification setup, deep linking. Must handle Yapily Open Banking auth flow and Supabase auth on mobile. Priority: after Yahoo Mail + Paperclip agents + Azure verification. (@Claude Code + Cowork architecture)
- [ ] Frontend: Add spending category totals to breakdown - Spending breakdown needs category totals like income breakdown already has. Grand total must match the monthly spending banner. Use get_monthly_spending() which returns category, category_total, transaction_count. (@Claude Code)
- [ ] Fix URL routing: /dashboard/disputes and /dashboard/overview return 404 - Two URL routing issues: (1) Sidebar says "Disputes" but navigates to /dashboard/complaints — visiting /dashboard/disputes directly gives 404. Add redirect. (2) Overview content loads at /dashboard but /dashboard/overview gives 404. Add redirect. Both break bookmarks and shared links. (@Claude Code)
- [~PR#43] Money Hub: Mobile layout fixes — net worth overlap, regular payments overflow, hidden action buttons - Three mobile-specific layout bugs reported by Paul on 7 Apr 2026: (1) Net Worth section — numbers overlap each other on mobile, needs repositioning so all values are visible. (2) Regular Payments section — content overflows off the screen on mobile, needs responsive wrapping. (3) Action buttons (x/remove, recategorise) are not visible or accessible on mobile devices — items cannot be removed or managed. All three need proper responsive CSS/Tailwind fixes. Test on 375px viewport (iPhone SE) and 390px (iPhone 14). (@Claude Code) (PR created 2026-04-07)
- [ ] Money Hub: Fix Financial Action Centre "Track this" — broken context routing - In the Financial Action Centre, clicking "Track this" on any action item navigates to the contract page with no context — the user has no idea why they've landed there or what to do. Required fix: (1) Research what the correct destination/flow should be for each action item type (subscription → subscriptions page, bill → bills page, contract → contracts page with that contract pre-selected, etc.). (2) Pass the action item's context (name, type, amount, provider) as query params or state to the destination page. (3) The destination page should acknowledge the action ("You're tracking [item name]") and guide the next step. Each action item must feel purposeful and contextual. Reported by Paul 7 Apr 2026. (@Claude Code) (@Claude Code)

## Critical
- [ ] Full site audit fixes — 9 tasks from Cowork audit - Fix all 14 bugs found in Cowork full site audit (28 Mar): (1) Delete 3 duplicate disputes + add dedup prevention, (2) Fix Profile active disputes count (shows 38, should be 10), (3) Fix Overview complaints count (shows 14, should be 10), (4) Fix Income Breakdown duplicate Other categories + Spending Breakdown triple Other, (5) Add 14 new merchant_rules for clean display names, (6) Hide Switch and Save for council tax/loans/water, (7) Fix Monthly Trends chart month labels, (8) Rename Money Hub Subscriptions to Regular Payments, (9) Fix guided tour tooltip, (10) Fix subscription count consistency. Full prompt provided to Paul for Claude Code. (@Claude Code)
- [x] FCA COMPLIANCE: Replace Money Hub Net Position card with Savings Rate - Already implemented: OverviewPanel.tsx shows "Savings Rate %" (green/red) in card 3, feature-flags.ts has SHOW_BANK_BALANCES: false. Verified 2026-04-18.
- [~PR#49] Frontend: Replace localStorage dismiss with Supabase RPCs - In src/app/dashboard/money-hub/page.tsx: Replace dismissBill/undismissBill/clearAllDismissals functions to use supabase.rpc('dismiss_expected_bill'), supabase.rpc('restore_expected_bill'). Remove localStorage key pb_dismissed_bills_YYYY_MM. Load dismissed bills from dismissed_expected_bills table on mount. See /mnt/outputs/money-hub-fixes.md for exact code patches. (@Claude Code) (PR created 2026-04-10)
- [ ] Frontend: Use get_expected_bills RPC instead of client-side computation - Replace entire expected bills fetch logic with supabase.rpc('get_expected_bills', {p_user_id, p_year, p_month}). This handles deduplication and dismissal filtering server-side. Returns: provider_name, expected_amount, expected_date, billing_day, occurrence_count, is_subscription, subscription_id, bill_key. (@Claude Code)
- [~PR#72] Frontend: Use get_monthly_spending RPC for spending totals - Replace frontend spending total calculation with supabase.rpc('get_monthly_spending_total', {p_user_id, p_year, p_month}). Use get_monthly_spending() for category breakdown. These exclude transfers and income automatically. Feb 2026 correctly shows £20,618.55 instead of £76,723. (@Claude Code) (PR created 2026-04-18)
- [~PR#192] Bank-sync: Call fix_ee_card_merchant_names and detect_and_sync after sync - In the bank-sync edge function, after upserting transactions: 1) Call fix_ee_card_merchant_names(user_id) to fix EE-branded card merchants. 2) Call detect_and_sync_recurring_transactions(user_id) to flag recurring payments and auto-create subscriptions. 3) Call auto_categorise_transactions(user_id) for automatic categorisation. These must run for EVERY user on every sync, not just Paul's account. (@Claude Code) (PR created 2026-04-23)
- [ ] Make auto-categorisation system-wide using merchant_rules - The categorisation fixes applied to Paul's account were hardcoded. Need a universal auto_categorise_transactions(user_id) function that: 1) Uses merchant_rules table to match descriptions to categories for ANY user. 2) Handles TRANSFER/CREDIT/STANDING_ORDER/DIRECT_DEBIT category mapping. 3) Runs after every bank sync. 4) Self-learning: when users recategorise via overrides, creates/updates merchant_rules entries so ALL users benefit. The system must be self-learning and not specific to one user. (@Claude Code)
- [ ] Frontend: Use get_subscriptions_with_actions RPC for subscription list - Replace frontend subscription fetching with supabase.rpc('get_subscriptions_with_actions', {p_user_id}). Returns all active subscriptions with has_cancellation_info, cancellation_url, cancellation_email, cancellation_phone. Show "Generate Cancellation Email" and "Mark as Cancelled" buttons for ALL subscriptions consistently. If has_cancellation_info is true, pre-fill the cancellation contact. If false, show a generic cancellation email template. Use generate_cancellation_email RPC to get email content. (@Claude Code)
- [ ] Frontend: Use dismiss_subscription/cancel_subscription RPCs and update total - When user clicks Remove/Dismiss on a subscription, call supabase.rpc('dismiss_subscription', {p_user_id, p_subscription_id}). This returns the UPDATED subscription total in the response. Use the returned monthly_total/annual_total/active_count to update the UI immediately — no separate fetch needed. Same pattern for cancel_subscription. Current bug: total doesn't update after dismiss because frontend doesn't recalculate. (@Claude Code)
- [~PR#72] Frontend: Use get_monthly_income_total and get_monthly_income RPCs - Replace frontend income calculation with server-side RPCs. get_monthly_income_total(uuid, year, month) returns the correct income excluding transfers. get_monthly_income(uuid, year, month) returns breakdown by source (rental_airbnb, rental_direct, rental_booking, salary, other_income). These correctly exclude inter-account transfers that were inflating income. Feb 2026 income was showing ~£43K but should be £30,083. Mar 2026 income is £22,013. (@Claude Code) (PR created 2026-04-18)
- [ ] Apply frontend fixes from paybacker-frontend-fixes.md - Apply all 7 fixes documented in paybacker-frontend-fixes.md to page.tsx. Priority order: (1) Replace spending/income calculations with RPCs (fixes C1-C4 from audit), (2) Replace localStorage bills dismiss with Supabase RPCs (C5), (3) Use dismiss/cancel subscription RPCs with updated totals (C6), (4) Fix subscription count and annual total (H1-H2), (5) Consistent subscription action buttons (H3), (6) Income breakdown using RPC (H4), (7) Move Savings Goals position (M4). All DB functions are deployed and tested. (@Claude Code)
- [ ] Complete full test plan (100 test cases) before go-live - Comprehensive test plan saved to paybacker-full-test-plan.md with ~100 test cases across 10 sections: Money Hub (40 tests), AI Disputes (32 tests), Subscriptions (27 tests), Data Consistency, Navigation, Edge Functions, Security, Test User Scenarios, Legal Compliance, Performance. 29 blocker tests must pass before go-live. Estimated 4-6 hours for full first pass. Legal APIs: legislation.gov.uk (UK National Archives) + handbook.fca.org.uk (FCA Handbook). (@Paul)
- [ ] URGENT: April bank sync broken — Money Hub showing no data - Paul's Money Hub has no bank data at all for April 2026 — income and spending breakdowns are blank on day 7. This is a regression: the bank sync edge function is not running or not persisting data. Steps: (1) Check Vercel cron logs for bank-sync failures since 1 April. (2) Check Supabase transactions table for any April rows for Paul's account. (3) Confirm detect_and_sync_recurring_transactions and auto_categorise_transactions are being called after sync. (4) Re-trigger manual sync if needed. This blocks all Money Hub data display. Flagged via Obsidian ideas note 7 Apr 2026. (@Claude Code) (@Claude Code)
