# Task Queue (Updated 26 Mar 2026 - End of Day)

## Completed Today (26 Mar)
- [x] Weekly acquisition report + /cac Telegram command
- [x] Facebook /photos endpoint + dedup guard
- [x] Money Recovery Score widget (confirm/amend/reject)
- [x] Mark as Cancelled with auto-calculated savings
- [x] Profile page address/postcode edit form
- [x] Chatbot Phase 2 (6 Money Hub tools)
- [x] Chatbot Phase 3 (4 cross-tab intelligence tools)
- [x] Energy Tariff Monitor (daily cron)
- [x] Weekly Money Digest Email (Monday 7am)
- [x] Admin dashboard Leads tab
- [x] 5 SEO landing pages
- [x] Welcome email sequence (5 emails, mint/navy)
- [x] Casey social post branding (mint/navy)
- [x] Meta Custom Audiences retargeting (4 segments)
- [x] Ticket resolution knowledge base
- [x] Leo CLO legal compliance (daily)
- [x] Auto-close tickets from email replies
- [x] Churn prevention automation (7d/14d/pre-renewal)
- [x] Homepage comparison table (17 features)
- [x] Unified merchant normalisation (120+ patterns)
- [x] PublicNavbar with mobile hamburger (all pages)
- [x] All Desktop review bug fixes
- [x] Sidebar plan badge Stripe sync
- [x] Homepage pointer-events fix
- [x] Vercel GitHub integration reconnected

## Waiting for Desktop Strategy
- [ ] Google Ads: 3 search campaigns (£800/month budget)
- [ ] Meta Ads: 2 conversion campaigns (£600/month budget)
- [ ] Referral system upgrade (dual-sided £5 reward)
- [ ] Influencer strategy + MoneySavingExpert promotion plan

## Ready to Build
- [ ] Google Ads weekly optimisation cron (auto-adjust budgets by CPA)
- [ ] 4 SEO blog articles (1500+ words each, FAQ schema)
- [ ] Nightly merchant standardisation cleanup job
- [ ] Churn prevention: cancellation page retention offer

## Low Priority
- [ ] ElevenLabs video content
- [ ] Instagram Stories
- [ ] AI Bill Negotiator
- [ ] Smart Document Scanner
- [ ] PRE-LAUNCH: Set LinkedIn vanity URL to linkedin.com/company/paybacker - LinkedIn page currently at linkedin.com/company/112575954 with no custom URL. Go to LinkedIn admin panel > Edit page > Public URL and claim linkedin.com/company/paybacker. Quick 2-minute job. (@Paul)
- [ ] POST-LAUNCH: Apply for TikTok Content Posting API - Register TikTok developer app at developers.tiktok.com, request Content Posting API scope. Requires app review. Account: @paybacker.co.uk. Will need ElevenLabs video pipeline built first since TikTok is video-only. Lower priority — do after launch. (@Paul)
- [ ] POST-LAUNCH: Add LinkedIn company page posting via API - Register LinkedIn developer app at linkedin.com/developers, link to company page (ID: 112575954), request w_organization_social scope. Free API. Add to Casey's cross-posting automation alongside FB, IG, and X. (@Claude Code)
- [ ] BUG-18: Add bottom padding to prevent tab bar obscuring content - On mobile, fixed bottom navigation tab bar covers last ~60px of scrollable content. Add padding-bottom: 80px (tab bar height + 16px buffer) to main content container on all dashboard pages when bottom tab bar is visible. (@Claude Code)
- [ ] BUG-19: Clarify Forms vs Complaints distinction - Forms and Complaints sections overlap in functionality — users won't understand the difference. Consider merging Forms into Complaints, or add clear descriptions at top of each page: "Complaints: AI-generated letters to companies" vs "Forms: Official regulatory forms (Ofgem, CAA, etc.)". Add contextual links between them. (@Claude Code)
- [ ] BUG-20: Add monthly/annual pricing toggle - Pricing page only shows monthly prices. Add Monthly/Annual toggle at top of pricing cards. Offer ~20% discount for annual billing (Essential: £4.99/mo or £47.90/yr saving £12). Requires creating annual price IDs in Stripe. (@Claude Code)

## Awaiting External
- [ ] Google OAuth verification (submitted 24 Mar)
- [ ] Meta App Review (real-time webhooks)

## End of Session Checklist
- [x] Update business_log with session summary
- [x] Update handoff-notes.md
- [x] Update blueprint document
- [x] Update task queue
- [ ] Full end-to-end test of all features
- [ ] Commit and push all changes
- [ ] Verify Vercel deploy successful

## High
- [x] PRE-LAUNCH: Create MoneySavingExpert Forum account and start engaging (Deprioritised — MSE forums aggressively ban self-promotion. Forum engagement is low-ROI vs direct editorial pitching. Replaced with PR-focused MSE editorial pitch task.) - Sign up to MSE Forum, create profile, start genuinely engaging in money-saving discussions (NOT promoting Paybacker yet). Build credibility for 1-2 weeks before any product mentions. This is free and can be done now. (@Paul)
- [ ] PRE-LAUNCH: Research and log 20 TikTok nano/micro finance creators - Search TikTok for UK personal finance creators with 5K-50K followers. Log names, follower counts, engagement rates, and contact info to the Influencer Tracker sheet. Draft outreach DMs but don't send until launch week. (@Paul + Cowork)
- [ ] PRE-LAUNCH: Draft MSE editorial pitch + press release - Write a press release and pitch email targeting MSE's editorial team (not the forum). Angle: AI-powered app that automatically finds overpayments, cancels unused subscriptions, and switches bills for UK consumers. Include real savings data if available from beta testing. Find the right editorial contact. Save as Gmail draft — don't send until product is fully live and tested. (@Cowork)
- [ ] Add X (Twitter) posting to Casey agent via API v2 - Once Paul provides X API credentials (API Key, API Secret, Access Token, Access Token Secret), add Twitter/X posting to Casey's automation. Use X API v2 POST /2/tweets endpoint. Cross-post the same content going to Facebook and Instagram. Free tier allows 1,500 posts/month. Store credentials as Railway env vars: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET. Account: @PaybackerUK (@Claude Code)
- [ ] BUG-04: Fix bank sync "3802m ago" timestamp to human-readable - Last synced indicator shows raw minutes "3802m ago" instead of readable format. Use date-fns formatDistanceToNow or similar. Show "X minutes ago" for <60min, "X hours ago" for <24h, "X days ago" for <7d, actual date beyond that. (@Claude Code)
- [ ] BUG-05: Merge duplicate "Other" income categories - Money Hub income breakdown shows multiple entries labelled "Other". Consolidate all "Other"/"Uncategorised" entries into a single row. If multiple sub-types exist, group under one "Other" with expandable breakdown. Deduplicate before rendering. (@Claude Code)
- [ ] BUG-06: Fix inconsistent navbar on Privacy Policy and Terms pages - Privacy Policy page uses older/different navbar than landing page. Ensure all public pages (landing, about, pricing, blog, privacy, terms, deals) use the same shared Navbar component. Check Privacy Policy and Terms pages import current global navbar, not legacy version. (@Claude Code)
- [ ] BUG-07: Fix inconsistent footer on About page - About page footer has different design/layout vs landing page footer. Use single shared Footer component across all public pages. Audit each page to confirm same footer import. Remove page-specific footer overrides. (@Claude Code)
- [ ] BUG-08: Fix currency formatting missing trailing zero (£11,289.8) - Monetary values display as "£11,289.8" instead of "£11,289.80". Create/update shared currency formatter using Intl.NumberFormat with minimumFractionDigits:2 and maximumFractionDigits:2. Apply consistently across all monetary displays in the app. (@Claude Code)
- [ ] BUG-09: Fix negative currency format £-3,791.54 → -£3,791.54 - Negative amounts show minus after pound sign (£-3,791.54) instead of before (-£3,791.54). Update currency formatter to handle negatives: prepend "-£" and format absolute value. Or use Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'}) which handles this natively. (@Claude Code)
- [ ] BUG-10: Fix How It Works section — steps 2-3 hidden off-screen - Landing page How It Works section only shows Step 1. Steps 2 and 3 are cut off/pushed out of visible container. Check container width/overflow settings — likely overflow:hidden or fixed height clipping content. Ensure all 3 steps visible in row (desktop) or stacked column (mobile). (@Claude Code)

## Medium
- [ ] PRE-LAUNCH: Set up Trustpilot business page - Claim Paybacker on Trustpilot, complete the business profile, and have it ready for launch. Early reviews from beta testers will help conversion rates. (@Paul)
- [ ] PRE-LAUNCH: Set up TikTok Business Account - Create TikTok Business Account for Paybacker if not already done. Needed for TikTok Spark Ads and influencer campaign tracking. (@Paul)
- [ ] PRE-LAUNCH: Research UK money journalists (Guardian, BBC, Which?) - Find specific journalist names, beats, and contact emails at Guardian Money, BBC Money, Which? Magazine. Draft PR pitch emails for review. Don't send until product is fully live and tested. (@Cowork)
- [ ] BUG-11: Fix £68K annual subscription estimate calculation - Subscription tracker reports ~£68,000 annual spend — wildly implausible for a consumer. Audit subscription detection and annual estimate logic. Ensure only genuinely recurring transactions counted (not one-offs). Verify annual multiplier (monthly×12, weekly×52). Add sanity check flagging estimates above £5,000/year. (@Claude Code)
- [ ] BUG-12: Add missing logo icon to blog navbar - Blog page navbar shows "Paybacker" text but missing logo icon that appears on other pages. Ensure blog layout imports same Navbar component (with logo) used on other pages. If blog uses separate layout (e.g., MDX layout), add the shared navbar. (@Claude Code)
- [ ] BUG-13: Remove or hide low stat counters that undermine trust - Landing page shows live counters like "12 complaint letters generated" — tiny numbers hurt credibility pre-launch. Either remove counters until meaningful volume (1,000+), or replace with static text like "Helping UK consumers save money". Show value-based stats once real data available. (@Claude Code)
- [ ] BUG-14: Fix "25 free spaces" counter — connect to real data or remove - "Only 25 free spaces remaining" urgency message will erode trust if number never changes. Either connect counter to real signup data (free-tier cap minus actual signups) so it genuinely decrements, or remove and use different urgency mechanism like "Early access — limited time". (@Claude Code)
- [ ] BUG-15: Clean up raw bank merchant names - Some merchant names appear as raw bank feed text (e.g., "AMZN MKTP UK*AB1CD2EF3", "SQ *COFFEE SHOP"). Expand merchant name mapping/cleaning logic. Add regex patterns for common UK merchants (Amazon, Netflix, Spotify, supermarkets). Strip reference codes, asterisks, payment processor prefixes (SQ *, PAYPAL *). (@Claude Code)
- [ ] BUG-16: Add profile completeness nudge for empty fields - Profile page shows "Not set" for phone/address/postcode with no encouragement to complete. Add profile completeness indicator (e.g., "Profile 40% complete"). Add helper text explaining why each field is useful (e.g., "Address needed for complaint letters"). Make "Not set" fields clickable to edit inline. (@Claude Code)
- [ ] BUG-17: Fix onboarding checklist step numbering - Dashboard onboarding checklist has inconsistent step numbering/ordering. Steps don't flow logically. Ensure sequential numbering (1,2,3,4) in logical order: 1) Connect bank, 2) Set budget, 3) Review subscriptions, 4) Write first complaint. Auto-check completed steps and highlight next action. (@Claude Code)

## Critical
- [ ] PRE-LAUNCH: Full end-to-end product test of all features - Before launch, do a complete walkthrough: signup flow, Stripe payments, chatbot, money hub, energy monitor, all 15 AI agents. Log any bugs for Claude Code to fix. (@Paul)
- [ ] BUG-01: Fix pricing page massive empty gap - Pricing page has a huge white gap (hundreds of pixels) between header and pricing cards. Likely oversized top margin/padding on pricing section container or hidden empty element. Remove excess spacing so cards appear immediately below header. (@Claude Code)
- [ ] BUG-02: Stop chatbot popup auto-opening on every page load - Chatbot widget pops up automatically on every page load. Change default state to closed/minimised. Only open when user clicks chat icon. Store session flag so it doesn't re-open on navigation. Remove any auto-open timer or useEffect triggering popup on mount. (@Claude Code)
- [ ] BUG-03: Exclude Paybacker's own transactions from dispute suggestions - Dashboard action items suggest disputing Paybacker's own subscription charges. Add filter to dispute/action-items logic excluding transactions where merchant name matches "Paybacker" (case-insensitive). Also exclude user's own bank transfer references and known internal transactions. (@Claude Code)
