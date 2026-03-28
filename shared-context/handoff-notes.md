# Handoff Notes

## 2026-03-28 -- Claude Code Session (Phase 4 Complete)
**Interface:** Claude Code
**Completed:**
- Phase 4: Provider T&Cs Database — FULLY COMPLETE
  - 33 UK providers across 6 sectors (energy, broadband, mobile, finance, insurance, travel)
  - Cancellation methods, complaints contacts, ombudsman details, exit fees, T&C links
  - Fuzzy provider matching (eon/E.ON/e.on all match)
  - Letter generation injects provider complaints email, response deadline, ombudsman
  - Provider Info card on dispute detail page
  - /api/provider-terms API with fuzzy search

**ALL 4 PHASES OF AI LETTERS INTELLIGENCE UPGRADE ARE COMPLETE:**
1. Phase 1: Dispute threads + correspondence tracking
2. Phase 2: Legal intelligence (56 refs, anti-hallucination, weekly verification)
3. Phase 3: Contract vault, upload UI, alerts, subscription linking
4. Phase 4: Provider T&Cs database, 33 UK companies, letter + dispute integration

**Ready for Phase 5:** Deadlock tracking, nudges, resolution flow, dashboard stats.

---

## 2026-03-28 -- Claude Code Session (Phase 3 Complete — All Phases Done)
**Interface:** Claude Code
**Completed:**
- Phase 3: Contract Vault — FULLY COMPLETE
  - Private contracts storage bucket with user-scoped RLS
  - /api/contracts/upload + /api/contracts (list/delete)
  - /dashboard/contracts: card grid, detail view, upload modal, filters
  - "My Contracts" in sidebar, status badges, unfair clause warnings
  - Daily contract expiry cron, letter generation integration
  - Subscription sync from extracted contract terms

**ALL 3 PHASES OF AI LETTERS INTELLIGENCE UPGRADE ARE COMPLETE:**
1. Phase 1: Dispute threads + correspondence tracking
2. Phase 2: Legal intelligence (56 refs, anti-hallucination, weekly verification cron)
3. Phase 3: Contract vault, upload UI, alerts, subscription linking

---

## 2026-03-28 -- Claude Code Session (Phase 2 Complete)
**Interface:** Claude Code
**Completed:**
- Phase 2: Legal Intelligence is FULLY COMPLETE
  - 56 verified UK consumer law references in legal_references table (all with source_urls)
  - Anti-hallucination safeguards: AI MUST ONLY cite verified refs, output cross-check logs warnings
  - Full disclaimer on all AI letters (legislation.gov.uk, Citizens Advice, ombudsman)
  - Weekly automated verification cron (legislation.gov.uk API + Claude Haiku for regulator changes)
  - Confidence badges: green/amber dots on rights pills (strong/moderate legal protection)
  - Rights pills clickable to source URLs in both thread view and letter modal

**Phase 2 Status:** COMPLETE. Ready for Phase 3 (Provider T&C Database).

**Phase 3 Plan (not yet started):**
- Provider T&C database for major UK companies (energy, broadband, mobile, streaming, insurance, gym)
- Key clauses: cancellation policy, price increase terms, complaint escalation, ombudsman details
- Auto-fallback if user hasn't uploaded their own contract
- Leo agent could periodically check for T&C changes

---

## 2026-03-27 22:00 -- Claude Code Session (Major Build)
**Interface:** Claude Code
**Completed:**
- Dispute threads + correspondence tracking (Phase 1 of AI Letters upgrade)
  - disputes + correspondence tables with RLS, 13 existing letters migrated
  - Full dispute detail page with timeline, status management, letter generation
  - Correspondence uploads (email, phone call, notes, file attachments)
  - Contract upload with Claude Vision analysis (extracts terms, flags unfair clauses)
  - Contract terms auto-injected into letter generation prompts
  - First-time guided tour with Framer Motion spotlight effect
  - Contract upload on both new dispute form AND dispute detail page
- Global email rate limiter (max 2 marketing emails per user per day) across all 7 cron jobs
- Fixed price increase detector (was detecting incoming payments as alerts, now debits only)
- Fixed all /dashboard/forms dead links -> /dashboard/complaints
- Fixed pro chatbot missing "New Chat" button
- Fixed OG image Vercel build error (fs/path -> fetch)
- Provider name normalisation + provider_type auto-detection
- Dismissed all bad price increase alerts

**Still needed:**
- Email digest consolidation (rate limiter is in, but deals/targeted/price alerts still send as separate emails rather than one digest)
- "Better Deals" section on overview is slow + "View All" just goes to subscriptions page
- Phase 2: Legal knowledge base (structured UK consumer law reference docs for AI prompts)
- Phase 3: Provider T&C database for major UK companies

---

## 2026-03-27 -- Claude Code Session (Two Tasks for Desktop)

### TASK 1: Architect AI Letters Intelligence Upgrade

Transform AI Letters into the UK's smartest AI complaints and compensation tool. It remembers every conversation with a company, reads the actual contract you signed, knows the company's own T&Cs, and cites the exact law that protects you - so every response is perfect.

**IMPORTANT: This is a consumer product, NOT a legal/case management tool. All language, UX, and copy must be friendly and accessible. No legal jargon. Position as: "You tell us what happened. We write the perfect response."**

Key phases:

1. **Legal Knowledge Base** - Curated UK consumer law reference database (Consumer Rights Act 2015, Consumer Credit Act 1974, UK261, Ofcom/Ofgem/FCA codes, GDPR, etc.) stored as structured docs injected into AI prompts. Version-dated for currency. The user never sees this - the AI just knows the law.
2. **Conversation Tracking** - Change flat letter list to a dispute thread per company. Each dispute: provider, issue type, status, timeline. Users add emails, photos of letters, phone call summaries. AI reads the full thread so each response references what came before. "Further to my letter dated..."
3. **Contract & T&C Analysis** - Users upload contracts (PDF/photo). Claude Vision extracts key terms (notice periods, cancellation clauses, price increase terms). AI cross-references automatically when writing the next response.
4. **Provider T&C Database** - Curated T&Cs for major UK providers (energy, broadband, mobile, streaming, insurance, gym). Key clauses: cancellation, price increase, complaint escalation, ombudsman. Falls back to these if user hasn't uploaded their own contract.
5. **Homepage Reframe** - Consumer-friendly positioning: "We read your contract, know their T&Cs, and cite the exact law that protects you." No "case management" language. Make it feel like having a brilliant friend who knows every consumer right.

**Differentiator:** Nobody else cross-references contracts + T&Cs + current law to write the perfect personalised response. This is the AI that fights your corner.

### TASK 2: Restructure Email System (URGENT - User Receiving 11+ Emails/Day)

**Problem:** Paul received 11 emails in one morning. Current system has 11 independent email triggers with no global rate limiting.

**Current email triggers (all independent, no cross-cron coordination):**

| # | Type | Schedule | Rate Limit |
|---|------|----------|------------|
| 1 | Waitlist Sequence | Daily 9am | 1/user/day, 7 emails over 28d |
| 2 | Onboarding Sequence | Daily 10am | 1/user/day, 5 emails over 10d |
| 3 | Renewal Reminders | Daily 8am | 1 per window (30/14/7d) |
| 4 | Price Increase Alerts | Daily 8am | 1/merchant deduplicated |
| 5 | Deal Alerts | Monday 9am | 1/week |
| 6 | Targeted Deals | Wed+Fri 9am | Cooldown 2-7d by score |
| 7 | Weekly Money Digest | Monday 7am | 1/week |
| 8 | Churn Prevention | Daily 11am | 1 per type/week |
| 9 | Founding Member Expiry | Daily 8am | 1 per window (7/3/1d) |
| 10 | Welcome Email | On signup | One-time |
| 11 | Agent emails (Riley, Drew) | Variable | None |

**Key files:**
- Cron routes: `src/app/api/cron/*/route.ts` (9 cron triggers)
- Email templates: `src/lib/email/*.ts`
- Agent email tools: `agent-server/src/tools/email-tools.ts`
- Cron config: `vercel.json`

**Required changes:**
1. Global email rate limiter - max 2 emails per user per day (excluding transactional like password reset)
2. Consolidate deal alerts + targeted deals + price increases into a single daily digest
3. Add user email preferences table (frequency: daily digest / weekly / off)
4. Stagger cron times so they don't all fire in same morning window
5. Agent emails must check the global limiter before sending

---

## 2026-03-26 01:30 -- Browser Extension Session
**Interface:** Chrome Extension
**Completed:**
- Created Meta System User "Paybacker Poster" (ID: 61578647176991) with Admin access
- Assigned 4 assets with full control: Facebook Page, Instagram, Ad account, App
- Generated never-expiring System User token (saved to memory)
- Confirmed working via Graph API Explorer
- Facebook Page ID: 1056645287525328
- Instagram Business Account ID: 17841440175351137
- API version: v25.0
- App settings updated: privacy policy URL, category, app domain, data deletion URL

**Still needed:**
- App icon (1024x1024) for App Settings

---

## 2026-03-26 01:30 -- Claude Code Session
**Interface:** Claude Code (SSH)
**Completed:**
- Massive development session: 50+ commits
- Google Search Console verified, dynamic sitemap
- UTM/gclid tracking on signup
- Stripe live with founding member prices (4.99/9.99)
- Awin integration fully working (S2S + client-side)
- Lebara deals with promo codes
- Solutions + deals pages fixed
- Contract tracking UI with end dates
- Founding member programme (paused for Awin testing)
- Deals page restructured by category
- Blog agent with Perplexity research
- OG image for social sharing
- Homepage live stats
- Resend inbound email for tickets
- Charlie Telegram bot with agent triggering
- Developer agent creating PRs
- Cross-agent notification system
- Daily automated social posting to FB + IG
- Casey CCO can now research and post autonomously
- Action items UX fixed with intelligent routing
- Posted launch announcements to Facebook and Instagram

**Still needed:**
- Oscar Awin sign-off (then re-enable founding members)
- Railway rebuild for Casey's posting tools
- Action items form pre-fill testing
- ElevenLabs video integration
- Page load speed optimisation

---

## 2026-03-26 07:24:23 - Cowork (Desktop)
**Completed:** Created a comprehensive implementation plan for the Interactive Chatbot Dashboard Management feature — Paybacker's highest priority product differentiator. The plan covers: (1) Technical architecture for upgrading /api/chat from text-only to a full tool-use agent with Claude Sonnet, server-side tool execution against Supabase, streaming responses, and conversation persistence. (2) Phase 1: Subscription management via chatbot (list, create, update, dismiss subscriptions via chat) + company logos using Clearbit Logo API with fallback to initials. (3) Phase 2: Money Hub interactive management (spending queries, transaction recategorisation with merchant rules, budget setting, savings goals). (4) Phase 3: Cross-tab intelligence (deal comparison, scanner opportunity actions, enriched complaint letters with subscription context). (5) Full UI/UX redesign of ChatWidget.tsx with rich cards, confirmation buttons, quick action chips, tool execution indicators, and expanded view. (6) Database: new tables chat_conversations, chat_tool_audit, provider_domains + logo_url/provider_domain columns on subscriptions. (7) API routes: rewritten /api/chat, new /api/chat/conversations, /api/logos/[domain]. (8) Estimated 8-12 weeks total across all phases. Full plan saved as interactive-chatbot-implementation-plan.md in outputs.

**Next steps:** IMPLEMENT THE INTERACTIVE CHATBOT — START WITH PHASE 1:

1. READ THE PLAN: The full implementation plan is saved as interactive-chatbot-implementation-plan.md. Read it first for complete context including exact tool definitions, database schemas, file structure, and conversation flow examples.

2. CREATE FEATURE BRANCH: git checkout -b feature/interactive-chatbot

3. DATABASE MIGRATIONS (do first):
   - ALTER subscriptions: add logo_url TEXT, provider_domain TEXT
   - CREATE TABLE chat_conversations (id, user_id, title, messages JSONB, active_tab, created_at, updated_at) with RLS
   - CREATE TABLE chat_tool_audit (id, user_id, conversation_id, tool_name, tool_input JSONB, tool_result JSONB, success, error_message, execution_time_ms, created_at) with RLS
   - CREATE TABLE provider_domains (id, provider_pattern, domain, display_name, category) + seed with ~20 common UK providers

4. REWRITE /api/chat/route.ts:
   - Upgrade model from Haiku to claude-sonnet-4-20250514
   - Accept { message, conversationId?, activeTab? }
   - Build system prompt with user context + activeTab awareness
   - Pass tools[] array to Claude API call
   - Handle tool_use response blocks: execute server-side against Supabase using service role key + user_id scoping
   - Feed tool_result back to Claude for natural language response
   - Stream response via SSE
   - Log all tool executions to chat_tool_audit
   - Save/update conversation in chat_conversations

5. IMPLEMENT TOOL REGISTRY (src/app/api/chat/tools/registry.ts):
   - Define tool interface: { name, description, input_schema, handler }
   - Group by domain: subscriptions, moneyHub, deals, scanner, complaints

6. IMPLEMENT SUBSCRIPTION TOOLS (src/app/api/chat/tools/subscriptions.ts):
   - list_subscriptions: SELECT with optional status/category filters
   - get_subscription: lookup by provider_name (ILIKE) or id
   - update_subscription: UPDATE category, amount, billing_cycle, dates, notes (with validation)
   - create_subscription: INSERT with required provider_name + amount, auto-resolve logo
   - dismiss_subscription: SET dismissed_at = NOW()

7. IMPLEMENT LOGO RESOLVER (src/lib/logo-resolver.ts):
   - Primary: Clearbit https://logo.clearbit.com/{domain}
   - Lookup domain from provider_domains table
   - Fallback: coloured initials avatar
   - Cache resolved logos on subscription row
   - Create /api/logos/[domain]/route.ts proxy with caching

8. UPDATE ChatWidget.tsx:
   - Refactor into component structure under src/components/chat/
   - Add rich card rendering for subscription results (SubscriptionCard.tsx with logo)
   - Add confirmation buttons (ChatConfirmation.tsx) for "Shall I go ahead?" flows
   - Add quick action chips (ChatQuickActions.tsx) based on activeTab
   - Add tool execution progress indicator (ChatToolProgress.tsx)
   - Pass activeTab prop from parent page

9. TEST: Run npx tsc --noEmit. Test conversation flows: recategorise subscription, add new subscription, dismiss subscription. Verify logos display correctly. Verify tool audit logging works.

10. AFTER PHASE 1: Proceed to Phase 2 (Money Hub tools) following the same plan document.

---

## 2026-03-26 07:44:36 - Cowork (Desktop)
**Completed:** Completed a full UX and feature review of paybacker.co.uk. Walked through every page (landing, pricing, about, blog, and all dashboard sections). Found 3 critical bugs, 12 UX issues, and proposed 10 new features. Full report saved as paybacker-ux-feature-review.docx in outputs. Key findings: (1) Sidebar client-side routing is broken — clicking nav links updates URL but doesn't re-render the page, requires F5 to navigate. (2) Multiple public pages return 404: /deals, /dispute-energy-bill, /solutions/energy — these are listed as live in project status but don't resolve. (3) Default Next.js 404 page has no branding. (4) About page references Finexer instead of TrueLayer. (5) Bank-detected subscriptions show raw ALL CAPS merchant names. (6) Mobile responsiveness is completely broken — no hamburger menu, no sidebar collapse, no card stacking. (7) No onboarding flow for new users. (8) Chatbot popup overlaps content on every page load.

**Next steps:** FIX THE FOLLOWING BUGS AND UX ISSUES IN PRIORITY ORDER:

=== P0: FIX IMMEDIATELY (before any marketing spend) ===

1. FIX SIDEBAR CLIENT-SIDE ROUTING BUG
The dashboard sidebar navigation is broken. Clicking any sidebar link updates the URL in the address bar but does NOT re-render the page content. Users must press F5 to see the correct page. This affects EVERY sidebar link.
- Root cause is likely: sidebar links are not using Next.js <Link> components, OR there's a layout-level state issue preventing re-renders, OR the dashboard layout component is not reacting to pathname changes.
- Check: src/components/Sidebar.tsx or src/components/DashboardLayout.tsx (or equivalent)
- Ensure all sidebar links use next/link <Link> with proper href
- Ensure the dashboard layout does not cache/memoize children in a way that prevents re-renders on route change
- Test by clicking between Overview, Money Hub, Complaints, Subscriptions — content should update WITHOUT needing F5

2. FIX 404 PUBLIC PAGES
These URLs all return 404 but are referenced on the landing page and/or sitemap:
- /deals — the landing page CTA "Browse Deals Free - No Signup Needed" links here but it 404s. The deals page only exists at /dashboard/deals (behind auth).
- /dispute-energy-bill — listed as an SEO landing page in project status
- /solutions/energy — listed as a solutions page in project status
ACTION: Check if these pages exist in the codebase but aren't deployed, or if they were never created. For /deals, create a public deals preview page showing sample deals with a CTA to sign up for personalised results. For SEO pages, either create them or remove from sitemap.xml to avoid Google penalties.

3. CREATE CUSTOM 404 PAGE
Currently showing the default Next.js "404 | This page could not be found." on a plain white background with no navigation.
- Create app/not-found.tsx (or src/app/not-found.tsx depending on project structure)
- Include: Paybacker branding/header, dark theme matching the rest of the site, helpful message, links to home/complaints/pricing, search bar optional, CTA to generate a free complaint letter
- This turns dead ends into conversion opportunities

4. FIX ABOUT PAGE — FINEXER REFERENCE
The about page says "powered by Finexer" for Open Banking but the actual integration uses TrueLayer (confirmed on the subscriptions page banner).
- Search codebase for "Finexer" and replace with "TrueLayer" everywhere
- The subscriptions page correctly says "We use TrueLayer (FCA regulated)" — match this wording

=== P1: THIS SPRINT ===

5. BUILD NEW USER ONBOARDING FLOW
New users land on a complex dashboard with zero guidance. Create an onboarding checklist widget:
- Show for users where onboarded_at IS NULL on their profile
- Steps: (1) Connect your bank account, (2) Review detected subscriptions, (3) Generate your first complaint letter, (4) Set a budget
- Display as a card/widget at the top of the Overview page with progress indicators
- When all steps complete, set onboarded_at = NOW() on the profile and hide the widget
- This is the single most important UX improvement for converting signups to active users

6. NORMALISE BANK-DETECTED MERCHANT NAMES + ADD LOGOS
Bank-detected subscriptions show raw ALL CAPS text: "DELIVEROO PLUS SUBS", "L.B.HOUNSLOW", "VIRGIN MEDIA PYMTS", "MYHOUSEMAID".
- Create a merchant_display_names mapping (can be the provider_domains table from the interactive chatbot plan)
- Map common patterns: "DELIVEROO PLUS SUBS" -> "Deliveroo Plus", "L.B.HOUNSLOW" -> "LB Hounslow (Council Tax)", "VIRGIN MEDIA PYMTS" -> "Virgin Media", "MYHOUSEMAID" -> "MyHousemaid"
- Add company logos using Clearbit Logo API: https://logo.clearbit.com/{domain} (free, no auth)
- Add logo_url and provider_domain columns to subscriptions table
- Display 32x32 logo next to subscription name, fallback to coloured initials circle

7. FIX CHATBOT POPUP PERSISTENCE
The chatbot proactive message ("Been overcharged on a bill?") appears on EVERY page load and overlaps content (pricing table, deal cards, trust section).
- Use sessionStorage to track if the user has dismissed the popup
- Only show once per session
- Don't show on pricing page or checkout pages where it overlaps CTAs
- The chatbot icon (orange circle) is sufficient — the popup is interruptive

8. MOBILE RESPONSIVE PASS — LANDING PAGE FIRST
The site does not respond to mobile viewports at all. On 390px width (iPhone):
- Nav bar shows full text links instead of hamburger menu
- Two-column cards don't stack to single column
- Dashboard sidebar doesn't collapse
Priority: Start with the landing page (this is where mobile ad traffic lands)
- Add hamburger menu for mobile nav (<768px breakpoint)
- Stack feature cards to single column on mobile
- Make hero CTA full-width on mobile
- Dashboard: Convert sidebar to bottom tab bar or collapsible hamburger on mobile

=== P2: NEXT SPRINT (after P0/P1 are done) ===

9. AI "MONEY SAVED" SCORECARD
- The database already has money_saved on subscriptions and total_money_recovered on profiles
- Create a dashboard widget showing total savings: cancelled subs savings + complaint refunds + deal switches
- Display prominently on Overview: "Paybacker has saved you £X this year"

10. ONE-CLICK COMPLAINT FROM ACTION ITEMS
- Action items on Overview have "Write Complaint Letter" buttons but they go to a blank form
- Pre-fill the complaint form with data from the action item: company name, amount, issue description
- Pass via URL params: /dashboard/complaints?company=BritishGas&amount=117.46&issue=overcharge

11. WEEKLY MONEY DIGEST EMAIL
- Extend the Charlie agent's daily digest to send user-facing weekly emails via Resend
- Include: subscriptions renewing this week, budget status, new opportunities, total saved to date

12. CONTRACT END DATE AUTO-DEAL ALERTS
- Query subscriptions where contract_end_date is within 30/14/7 days
- Auto-search deals for that category
- Send notification: "Your BT contract ends in 14 days. We found 3 cheaper deals."

NOTE: The full UX review document with all details is saved as paybacker-ux-feature-review.docx in outputs.

---

## 2026-03-26 08:11:02 - Cowork (Claude in Chrome)
**Completed:** Completed comprehensive deep-dive functional test of every feature on paybacker.co.uk. Tested: landing page CTAs, public pages (about/blog/pricing), complaints (end-to-end letter generation), forms (11 types), subscriptions (add/edit/cancel/email), deals (all categories + affiliate links), Money Hub (income/spending/drill-downs), spending insights, rewards (badges/points/tiers), scanner, profile, chatbot, and overview action items. Found 38 bugs total: 5 Critical, 11 High, 14 Medium, 8 Low. Full report saved as paybacker-functional-test-report.docx.

**Next steps:** Claude Code should fix the 38 bugs identified in priority order. Start with P1-Critical bugs:

1. BUG-05/BUG-14: FIX DATES IN GENERATED LETTERS — The /api/chat complaint generation and cancellation email endpoints output wrong dates ('14 July 2025' and '[Date]'). Pass new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'}) to the AI prompt and ensure the date appears correctly in the letter body.

2. BUG-09: AUTO-FILL USER DATA IN LETTERS — After letter generation, replace [YOUR NAME], [YOUR EMAIL], [YOUR PHONE NUMBER], [YOUR ADDRESS] placeholders with data from the user's profile (profiles table). At minimum fill name and email from Supabase auth.

3. BUG-13: FIX SIDEBAR ACTIVE STATE — The sidebar component doesn't update its active state on client-side navigation. Use usePathname() from next/navigation and compare against each nav item's href. Ensure the component re-renders on route change.

4. BUG-18: REMOVE/FIX DEAD OCTOPUS ENERGY DEAL — The Awin affiliate link for Octopus Energy goes to closedMerchant.html. Either update the affiliate URL or remove/hide the deal card.

Then P2-High bugs:
5. BUG-16: MERCHANT NAME NORMALISATION — Implement title-case conversion and a known-merchant mapping table to convert UPPERCASE bank names to proper display names. Apply across subscriptions, deals, Money Hub, spending, and chatbot.
6. BUG-11/BUG-25: CURRENCY FORMATTING — Use Intl.NumberFormat('en-GB') consistently for all currency displays across all pages.
7. BUG-33: ADD PROFILE EDIT — Add an Edit Profile section with name, address, phone, postcode fields. Save to profiles table.
8. BUG-03: FIX PRICING PAGE NAV — Add the PublicNavbar component to the pricing page layout.
9. BUG-02: ALLOW LOGGED-IN USERS TO VIEW LANDING PAGE — Remove auth redirect from / route.
10. BUG-12: AUTO-ADVANCE BILLING DATES — Add logic to advance next_billing_date when it's in the past.
11. BUG-15: SEPARATE EMAIL GENERATION FROM STATUS CHANGE — Don't set subscription to 'Cancelling' when generating the email.
12. BUG-17: ADD MAILTO SEND BUTTON — Add a 'Send via Email' button to cancellation emails using mailto: link.
13. BUG-19/BUG-20: CLEAN UP BANK DATA — Strip phone numbers from names, consolidate duplicate 'Other' categories.
14. BUG-21: HUMAN-READABLE SYNC TIMES — Use formatDistanceToNow() for bank sync timestamps.
15. BUG-01: MAKE CATEGORY TAGS CLICKABLE — Wrap landing page tags in Link components.

---

## 2026-03-26 10:44:07 - Cowork (Desktop)
**Completed:** Completed full website test of every page on paybacker.co.uk after the redesign. Tested: landing page, about, blog (listing + articles), pricing, deals (index + categories), sign in/sign up auth flow, dashboard overview, Money Hub, Scanner, Complaints/AI Letters, Subscriptions, Forms, Spending Insights, Rewards, Profile, Chatbot, and mobile responsiveness. Found 9 bugs ranging from critical to low priority, all logged as individual tasks in the MCP task queue under "Bug Fixes (from Desktop review)".

**Next steps:** Fix all 9 bugs from the "Bug Fixes (from Desktop review)" section in the task queue. Start with the 2 CRITICAL bugs first: (1) Hero text invisible on landing + pricing pages — change heading colour to white #FFFFFF, subtitle to slate-300 minimum; (2) Public pages navbar not responsive on mobile — add hamburger menu at max-width 768px. Then fix 3 HIGH bugs: inconsistent navbar across public pages, Sign In redirect for logged-in users should go to /dashboard, pricing page excessive empty space. Then 4 MEDIUM/LOW: pricing card contrast, plan status mismatch sidebar vs profile, chatbot popup should be once per session, missing billing toggle on pricing, deals count mismatch. Full fix instructions are in each task description.

---

## 2026-03-26 15:43:42 - Claude Desktop (Cowork)
**Completed:** Created comprehensive £100K MRR execution plan with 7-sheet spreadsheet. Logged 9 critical/high priority tasks to MCP task queue. Model projects £97.9K MRR at Month 12 from paid channels (£5K start, scaling to £18K cap), with PR/partnerships expected to push over £100K. All Claude Code automation specs are detailed in the 'Claude Code Automations' sheet of paybacker-100k-mrr-execution-plan.xlsx.

**Next steps:** Claude Code should execute tasks in this priority order:
1. CRITICAL (Week 1): Create 3 Google Ads search campaigns via API
2. CRITICAL (Week 1): Create 2 Meta Ads conversion campaigns via API  
3. CRITICAL (Week 1): Build referral system (Supabase tables, API endpoints, dashboard component, Resend email trigger)
4. HIGH (Week 1-2): Build 5-email welcome sequence in Resend
5. HIGH (Week 2): Set up GA4 + Mixpanel + UTM tracking with weekly automated report
6. HIGH (Week 1): Write and publish 4 SEO articles to blog
7. HIGH (Week 2): Build Google Ads weekly auto-optimisation cron job
8. HIGH (Week 2): Build Meta Ads weekly auto-optimisation cron job
9. HIGH (Week 3): Build churn prevention automation system

Full specs for each task are in the MCP task queue AND in the execution spreadsheet at /Users/paul-ops/Library/Application Support/Claude/local-agent-mode-sessions/677cbb7a-f568-47d3-af97-0d15404a6529/1e7d2fe4-a423-4c86-895c-77ebabed2870/local_26d14bf2-c1cb-4022-888c-0c588b57e71c/outputs/paybacker-100k-mrr-execution-plan.xlsx (Sheet: 'Claude Code Automations').

Budget allocations per channel per month are in the 'Budget Calendar' sheet.

---

## 2026-03-26 16:30 - Claude Code Session (Full Day)
**Completed:** Massive 30+ feature development session. Built:

**Chatbot (15 tools total):** Phase 2 (spending, budgets, transactions, financial overview) + Phase 3 (deal finder, complaint with context, scanner opportunities, contract alerts).

**Email Automation:** Weekly Money Digest (Mon 7am), welcome sequence rewritten (5 emails mint/navy), churn prevention (7d/14d inactive + pre-renewal value summary).

**Financial Tools:** Money Recovery Score widget with confirm/amend/reject, auto-calculated savings on cancel, Energy Tariff Monitor (daily Perplexity research + alerts), budget planner category fix.

**Admin:** Leads tab (filter/status/notes), ticket resolution knowledge base (Riley self-improving), Leo CLO daily legal compliance, auto-close tickets from email replies.

**Marketing:** 5 SEO landing pages, Meta Custom Audiences (4 segments weekly), Casey mint/navy branding, weekly acquisition report + /cac Telegram command.

**Bug Fixes:** PublicNavbar with hamburger, pointer-events-none on gradient overlays, sidebar tier from Stripe, deals count, pricing spacing, auth redirects, merchant normalisation (120+ patterns), unified category system.

**Infrastructure:** Vercel GitHub reconnected, energy_tariffs + ticket_resolutions tables, compliance_log enhanced, tasks constraints updated.

**Still outstanding:**
1. Google Ads campaigns (waiting for Desktop strategy + influencer/MSE plan)
2. Meta Ads campaigns (waiting for Desktop strategy)
3. Referral system upgrade (waiting for Desktop strategy)
4. Google Ads weekly optimisation cron
5. 4 SEO blog articles (1500+ words each)
6. Nightly merchant cleanup job
7. Full end-to-end testing of all features built today

---

## 2026-03-26 16:04:01 - Claude Desktop (Cowork)
**Completed:** Set up complete automation system: 7 scheduled tasks running (daily briefing 8:30am, daily social 10am, midday ad monitor 12pm, weekly performance Monday 9am, influencer/PR pipeline Wednesday 2pm, monthly P&L 1st of month). Gmail connected to hello@paybacker.co.uk — Cowork can now draft outreach emails directly. 3 PR email drafts already in Gmail: Which? pitch, Meaningful Money podcast pitch, MSE Deals submission.

**Next steps:** Claude Code needs to build the following for the automation system to work end-to-end:

1. DAILY AD PERFORMANCE LOGGING: Create a cron job (or Railway scheduled function) that runs at 7am daily:
   - Pull Google Ads metrics via API (impressions, clicks, conversions, spend, CPA per campaign)
   - Pull Meta Ads metrics via API (same)
   - Write results to Supabase table: daily_ad_metrics (date, platform, campaign_name, impressions, clicks, conversions, spend, cpa)
   - Also write a summary to Paybacker MCP via append_context(file='business-ops.md')
   - This data is what the Cowork morning briefing reads each day

2. WEEKLY AUTO-OPTIMISATION (Monday 6am, before Cowork reports at 9am):
   - Google Ads: CPA < £6 → +20% budget. CPA £10-15 → -30%. CPA > £15 → pause. Add negative keywords from search terms.
   - Meta Ads: CPA < £6 → +20% budget. CPA > £12 → pause. CTR < 0.8% → flag creative.
   - Log all changes to MCP.

3. SIGNUP ATTRIBUTION TRACKING: On every new signup, log utm_source/medium/campaign to user profile AND to business_log table. This lets Cowork track which creators/channels are performing.

4. REFERRAL SYSTEM: Build as previously specified — this is critical for the viral growth coefficient.

5. CHURN PREVENTION: Automated emails for inactive users (7-day, 14-day triggers).

All of this feeds into the automated morning briefing that Cowork generates for Paul at 8:30am daily.

---

## 2026-03-26 16:45:18 - Cowork (Desktop)
**Completed:** Switched entire system to PRE-LAUNCH MODE (target launch ~2 April). Paused ad monitor + weekly performance review. Updated influencer/PR pipeline to research-only. Added 6 pre-launch tasks to queue. Built PR contact database (MSE, Guardian, BBC, Which?, Podcasts, Fintech press). Created 4 Gmail draft pitch emails ready to send at launch. Dropped MSE Forum strategy (ban risk) — replaced with editorial pitch. Logged all decisions to MCP.

**Next steps:** CLAUDE CODE — BUILD ALL OF THE FOLLOWING IN PAUSED/DRAFT STATE (nothing goes live until Paul approves after 3 blockers clear: Google Ads Basic access, Google OAuth verification, TrueLayer production):

1. Google Ads: 3 search campaigns (complaint letters, subscription management, energy savings) — CREATE IN PAUSED STATE via API
2. Meta Ads: 2 conversion campaigns — CREATE IN PAUSED STATE via API
3. Daily ad metrics logging cron to Supabase (build it — will return empty until ads run)
4. Weekly auto-optimisation cron (build logic, won't fire until ads enabled)
5. Referral system upgrade (dual-sided £5 reward infrastructure)
6. 4 SEO blog articles 1500+ words each (THESE CAN GO LIVE NOW — no blocker)
7. Signup attribution tracking (utm params → user profile + business_log)

THINGS THAT CAN GO LIVE IMMEDIATELY: SEO articles, bug fixes from UX review, chatbot improvements, referral backend. Social posting already running via Casey agent.

IMPORTANT: Google Ads API is Explorer access only (not Basic yet). Explorer can still create campaigns but has 2880 ops/day limit. All campaigns must be created in PAUSED state regardless.

---

## 2026-03-26 17:43:31 - Cowork (Desktop)
**Completed:** Finalised definitive marketing strategy (v2) in business-ops.md — single source of truth replacing all previous playbook fragments. Covers: budget model (£5K start, 80% reinvest, £18K cap), Google Ads (3 campaigns with full RSA copy), Meta Ads (2 campaigns with creative specs), influencer strategy (40% budget), SEO (4 articles), social media (5 platforms), referral upgrade (dual-sided £5), PR/media (4 Gmail drafts), email automation, and attribution tracking. Also cleaned up memory.md to remove old fragmented marketing sections and point to business-ops.md as the authority. Created claude-code-marketing-prompt.md with exact execution instructions.

**Next steps:** Claude Code: Run the 7-task marketing build prompt from claude-code-marketing-prompt.md (also available in outputs folder). Priority order: (1) Google Ads 3 campaigns PAUSED, (2) Meta Ads 2 campaigns PAUSED, (3) Daily metrics cron, (4) Weekly optimisation cron, (5) Signup attribution, (6) Referral upgrade, (7) 4 SEO articles. ALL AD CAMPAIGNS MUST BE CREATED IN PAUSED STATE. Full ad copy, keywords, targeting, and creative specs are in business-ops.md Section 2-3. After completion, log all IDs to MCP and update task queue.

---

## 2026-03-26 18:36:45 - Cowork (Desktop App)
**Completed:** Completed full end-to-end UAT & UX test of paybacker.co.uk across 18 pages/features. Found 20 bugs: 3 CRITICAL, 7 HIGH, 7 MEDIUM, 3 LOW. All 20 bugs logged to MCP task queue with detailed descriptions and fix instructions. UAT report saved as HTML. Claude Code bug-fix prompt created with all 20 bugs in priority order with specific fix guidance.

**Next steps:** Claude Code should: 1) Read the MCP task queue to see all 20 BUG items. 2) Fix them in priority order (CRITICAL first: pricing page gap, chatbot auto-open, Paybacker self-dispute). 3) Key fixes: shared currency formatter with Intl.NumberFormat for BUG-08/09, shared Navbar/Footer components for BUG-06/07, merchant name cleaning for BUG-15. 4) Run tsc --noEmit after all fixes. 5) Mark each bug complete in task queue. 6) Commit and verify Vercel deploy.

---

## 2026-03-26 19:30 - Claude Code Session (Continued)
**Completed:** Universal email scanner (IMAP), all 20 UAT bugs fixed, X/Twitter integration, ElevenLabs TTS, Meta Ads campaigns created (PAUSED), ad metrics + optimisation crons, 4 SEO blog articles, churn prevention, referral Stripe rewards, loading animation for complaints, UK journalist PR list, feature roadmap approved.

**New feature roadmap (approved by founder, needs Desktop design review):**
1. Smart Bill Comparison (show cheaper alternatives next to subscriptions)
2. One-Click Switching (pre-fill switch application)
3. Annual Financial Report (PDF, shareable)
4. Household Mode (family sharing)
5. Price Increase Alerts (detect silent increases)
6. WhatsApp Bot (chatbot on WhatsApp)
7. Savings Challenges (gamified)
8. Share Your Win (social share after complaint)
9. Receipt Scanner (OCR for paper bills)
10. Credit Score Impact Warning

**Next steps:** Desktop to design UX for these 10 features. Google Ads blocked on Basic API access. Meta Ads blocked on app Live mode.

---

## 2026-03-26 19:30:11 - Cowork (Desktop App)
**Completed:** Designed full UX and implementation plan for 10 founder-approved features. Priority ranking: P1 Sprint 1 (Weeks 1-3): #8 Share Your Win (S, 1-2d), #10 Credit Score Warning (S, 1d), #5 Price Increase Alerts (M, 3-4d), #1 Smart Bill Comparison (L, 5-7d). P2 Sprint 2 (Weeks 4-8): #2 One-Click Switching (M, 3-4d), #9 Receipt Scanner (M, 3-4d), #7 Savings Challenges (M, 4-5d), #3 Annual Financial Report (M, 4-5d). P3 Sprint 3 (Weeks 9-14): #6 WhatsApp Bot (L, 7-10d), #4 Household Mode (L, 10-14d). Total: 41-56 dev days. New DB tables: subscription_comparisons, price_increase_alerts, challenge_templates, user_challenges, whatsapp_links, scanned_receipts, complaint_evidence, households, household_members, household_invitations. New chatbot tools: find_cheaper_alternatives, detect_price_increases, scan_receipt, manage_challenges. Cross-cutting: shared OG image generation, unified notification system, expanded loyalty points.

**Next steps:** Claude Code should start with the two P1 quick wins after current bug fixes are done: (1) Share Your Win — ShareWinModal.tsx + OG image generator + trigger wiring into complaints/subscriptions/deals cancel flows. (2) Credit Score Warning — CreditScoreWarning.tsx modal + credit-product-detector.ts + wire into cancel flow. Then move to Price Increase Alerts and Smart Bill Comparison. Apply for WhatsApp Business API in Week 1 (takes 1-4 weeks) so it's ready for Sprint 3. Full plan with UX wireframes saved as paybacker-10-features-implementation-plan.html in outputs.


---

## 2026-03-26 19:30 - Cowork (Desktop) — 10 FEATURES BUILD INSTRUCTIONS FOR CLAUDE CODE

**EXECUTE IN THIS ORDER. Read business-ops.md, memory.md, and the decisions-log.md first for full context.**

### PHASE 1: QUICK WINS (Do these first — 2-3 days total)

#### Feature 8: Share Your Win
After a successful complaint, subscription cancellation, or deal switch, show a share modal with pre-filled social text and the user's referral link.

Build:
- `src/components/share/ShareWinModal.tsx` — Modal with share card preview showing savings amount. Buttons: X (twitter.com/intent/tweet?text=...&url=...), Facebook (facebook.com/sharer/sharer.php?u=...), WhatsApp (wa.me/?text=...), Copy to clipboard. All URLs include user's referral link from referrals table.
- `src/app/api/share/[id]/og.png/route.ts` — Dynamic OG image using @vercel/og (satori). Navy #0A1628 background, mint #34D399 accent, white text. Shows: "I just saved £X with @PaybackerUK" + paybacker.co.uk/?ref=USERID.
- `src/lib/share-triggers.ts` — Trigger logic. Show modal after: complaint letter generated (if estimated refund > £10), subscription cancelled (with annual savings), deal switched. Don't show more than once per session. Award 25 loyalty points for sharing.
- Wire into: complaints page (after letter generation), subscriptions (after cancel), and the switching flow.

#### Feature 10: Credit Score Impact Warning
When cancelling a credit product (credit card, loan, BNPL), show a warning modal about credit score impact.

Build:
- `src/lib/credit-product-detector.ts` — Function that checks subscription category and provider name. Credit categories: "Credit Card", "Loan", "Buy Now Pay Later", "Store Card". Provider patterns: Barclaycard, Amex, Capital One, HSBC Credit, Klarna, Clearpay, Vanquis, Aqua, etc. Returns { isCreditProduct, productType, warningContent }.
- `src/components/subscriptions/CreditScoreWarning.tsx` — Warning modal. Shows product-specific impacts (credit cards: utilisation ratio + history length; loans: early repayment fees; BNPL: missed payment reporting). Includes tip: "Consider keeping unused free cards open". Includes FCA disclaimer: "This is general information, not financial advice." Buttons: [Cancel Anyway] [Keep Subscription].
- Wire into the subscription cancel flow and the chatbot's dismiss_subscription tool. Check credit-product-detector before proceeding with cancellation.

### PHASE 2: PRICE INCREASE ALERTS (3-4 days)

#### Feature 5: Price Increase Alerts
AI monitors bank transactions month-over-month. Detects silent price increases and prompts complaints.

Database:
```sql
CREATE TABLE price_increase_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  merchant_normalized TEXT,
  old_amount DECIMAL(10,2) NOT NULL,
  new_amount DECIMAL(10,2) NOT NULL,
  increase_pct DECIMAL(5,2),
  annual_impact DECIMAL(10,2),
  old_date DATE,
  new_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','dismissed','actioned')),
  complaint_id UUID REFERENCES complaints(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE price_increase_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own alerts" ON price_increase_alerts FOR ALL USING (auth.uid() = user_id);
```

Build:
- `src/lib/price-increase-detector.ts` — Group transactions by normalised merchant (use existing merchant normalisation lib). For merchants with 2+ months of data, compare most recent amount to previous. Flag if: same merchant, increase > 2%, both look like recurring payments (similar date each month), amount > £5. Exclude: groceries, fuel, variable amounts.
- `src/app/api/cron/price-increases/route.ts` — Daily cron (protected by CRON_SECRET). Runs detection for all users with bank connections. Inserts new alerts. Sends Resend email notification for each new alert.
- `src/components/alerts/PriceIncreaseCard.tsx` — Alert card showing: old amount, new amount, increase %, annual impact, relevant regulation (Ofcom for telecoms, Ofgem for energy). Buttons: [Write Complaint] (pre-fills complaint with increase details), [Find Cheaper Deal] (links to comparison), [Dismiss].
- Add to dashboard overview as an alert banner when active alerts exist.
- Add to scanner page as a new "Price Increases" tab.
- Add `detect_price_increases` chatbot tool to the tool registry.

### PHASE 3: SMART BILL COMPARISON (5-7 days)

#### Feature 1: Smart Bill Comparison
Match subscriptions against deals table and energy_tariffs table. Show cheaper alternatives with savings estimate.

Database:
```sql
CREATE TABLE subscription_comparisons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  deal_id UUID,
  current_price DECIMAL(10,2),
  deal_price DECIMAL(10,2),
  annual_saving DECIMAL(10,2),
  deal_provider TEXT,
  deal_name TEXT,
  deal_url TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed BOOLEAN DEFAULT false
);
ALTER TABLE subscription_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own comparisons" ON subscription_comparisons
  FOR ALL USING (subscription_id IN (SELECT id FROM subscriptions WHERE user_id = auth.uid()));

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS category_normalized TEXT;
```

Build:
- `src/lib/comparison-engine.ts` — Match subscription category_normalized against deals table WHERE deals.category matches. For energy subs, also query energy_tariffs. Calculate: (current_monthly - deal_monthly) * 12. Only show if annual saving > £24. Return top 3 deals sorted by saving.
- `src/components/subscriptions/ComparisonCard.tsx` — Side-by-side card within each subscription. Shows: YOUR PLAN (name, price, key detail) vs BEST DEAL (name, price, key detail). Savings in large mint text. Buttons: [Compare All Deals] [Switch Now]. Also list 2 more alternatives below.
- `src/components/dashboard/SavingsOpportunityWidget.tsx` — Overview widget: "You could save £X/year" with count of subs with cheaper alternatives. Links to subscriptions page.
- `src/app/api/subscriptions/compare/route.ts` — On-demand comparison for a single subscription.
- `src/app/api/cron/compare-subscriptions/route.ts` — Weekly batch comparison for all users. Cron protected by CRON_SECRET.
- Add `find_cheaper_alternatives` chatbot tool.

### PHASE 4: ONE-CLICK SWITCHING (3-4 days, after Phase 3)

#### Feature 2: One-Click Switching
After comparison, user clicks Switch Now. Pre-fill details and redirect to provider via Awin affiliate link.

Build:
- `src/components/subscriptions/SwitchingModal.tsx` — 3-step modal: (1) Confirm details — show name, email, address, postcode from profile with [Edit] buttons. Checkbox: "Also cancel old provider". (2) Redirect — copy details to clipboard, open deal URL (Awin affiliate) in new tab. Show "After signing up, come back and click below." (3) Post-switch — "Switch recorded! +50 loyalty points." If cancel box was checked, auto-trigger cancellation email for old provider.
- `src/app/api/subscriptions/switch/route.ts` — Records the switch: creates new subscription from deal data, updates old subscription status to "Switching", awards 50 loyalty points, optionally triggers cancel email.
- `src/lib/clipboard-prefill.ts` — Formats user profile data for clipboard copy.
- Wire the [Switch Now] button from ComparisonCard to open SwitchingModal.
- After switch completes, trigger Share Your Win modal (#8).

### PHASE 5: RECEIPT SCANNER (3-4 days)

#### Feature 9: Receipt Scanner
Camera/upload OCR using Claude Vision. Extract provider, amount, date. Add as dispute evidence.

Database:
```sql
CREATE TABLE scanned_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  extracted_data JSONB,
  provider_name TEXT,
  amount DECIMAL(10,2),
  receipt_date DATE,
  receipt_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE scanned_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own receipts" ON scanned_receipts FOR ALL USING (auth.uid() = user_id);

CREATE TABLE complaint_evidence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES scanned_receipts(id),
  evidence_type TEXT DEFAULT 'receipt',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE complaint_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own evidence" ON complaint_evidence
  FOR ALL USING (complaint_id IN (SELECT id FROM complaints WHERE user_id = auth.uid()));
```

Build:
- `src/components/scanner/ReceiptScanner.tsx` — Modal with camera preview (getUserMedia) + drag-and-drop upload zone. Accept JPEG, PNG, PDF, HEIC, max 10MB. On mobile: `<input type="file" accept="image/*" capture="environment">`.
- `src/app/api/receipts/scan/route.ts` — Upload image to Supabase Storage. Send to Claude Sonnet vision with prompt: "Extract from this receipt/bill: provider_name, total_amount, date, line_items (each with description and amount), reference_number. Return as JSON." Save to scanned_receipts table.
- `src/components/scanner/ReceiptResults.tsx` — Shows extracted data with editable fields. Action buttons: [Add as Dispute Evidence] [Create Subscription] [Write Complaint About This Bill] [Just Save].
- Add `scan_receipt` chatbot tool — accepts image, runs extraction, asks what to do.
- Wire "Attach Evidence" button on complaints page to open ReceiptScanner.

### PHASE 6: SAVINGS CHALLENGES (4-5 days)

#### Feature 7: Savings Challenges
Gamified micro-challenges verified by bank transactions. Awards loyalty points.

Database:
```sql
CREATE TABLE challenge_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('spending','action')),
  category TEXT,
  duration_days INTEGER,
  reward_points INTEGER DEFAULT 100,
  badge_id UUID,
  verification_rule JSONB NOT NULL,
  icon TEXT,
  active BOOLEAN DEFAULT true
);

CREATE TABLE user_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  template_id UUID REFERENCES challenge_templates(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','failed','abandoned')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  progress JSONB DEFAULT '{}'
);
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own challenges" ON user_challenges FOR ALL USING (auth.uid() = user_id);
```

Build:
- `src/lib/challenge-engine.ts` — Two types: (a) Spending challenges — daily cron checks if disqualifying transactions appeared (e.g., "No Takeaways" fails if Eating Out transaction detected). (b) Action challenges — check completion state (cancelled a sub, wrote a complaint, referred a friend). Verification rules stored as JSONB in templates.
- `src/components/rewards/ChallengesTab.tsx` — New tab on Rewards page. Shows: Active challenges with progress bars, Available challenges with [Start] buttons, Completed challenges with points earned.
- `src/components/rewards/ChallengeCard.tsx` — Individual card: icon, name, progress bar, days remaining, reward amount, action button.
- `src/app/api/cron/verify-challenges/route.ts` — Daily cron to check spending challenge progress.
- Add `manage_challenges` chatbot tool (list active, start new, check progress).
- Seed 12 challenge templates: No Takeaways (7d, 100pts), No Coffee Shops (7d, 100pts), Cancel Unused Sub (action, 150pts), Switch Energy (action, 200pts), Write Complaint (action, 50pts), Refer a Friend (action, 250pts), Stay Under Budget (30d, 300pts), Save £100 This Month (30d, 200pts), No Impulse Buys (7d, 100pts), Review All Subscriptions (action, 75pts), Set Up Budget (action, 50pts), Connect Bank (action, 50pts).
- After challenge completes, trigger Share Your Win (#8).

### PHASE 7: ANNUAL FINANCIAL REPORT (4-5 days)

#### Feature 3: Annual Financial Report
Spotify Wrapped for money. PDF + social share card.

Database:
```sql
CREATE TABLE annual_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  data JSONB NOT NULL,
  pdf_url TEXT,
  share_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year)
);
ALTER TABLE annual_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own reports" ON annual_reports FOR ALL USING (auth.uid() = user_id);
```

Build:
- `src/lib/report-generator.ts` — Aggregate: total_money_recovered (complaints), total_subscriptions_cancelled + savings, deals_switched + savings, spending_by_category_monthly, loyalty_points_earned, challenges_completed. Generate PDF using @react-pdf/renderer with Paybacker branding.
- `src/app/api/reports/annual/route.ts` — Generate report, save PDF to Supabase Storage, cache in annual_reports table.
- `src/app/api/reports/annual/share-image/route.ts` — OG image: "I saved £X this year with @PaybackerUK" + stats summary. Uses @vercel/og.
- `src/components/profile/AnnualReportCard.tsx` — Widget on profile page: stats preview + [Download PDF] + [Share on Social].
- Available on-demand (profile page) and auto-generated in January via cron. Email notification when ready via Resend.

### AFTER ALL FEATURES

1. Run `npx tsc --noEmit` after each feature
2. Test each feature end-to-end
3. Update MCP task queue — mark features complete
4. Log handoff notes with all new component paths
5. Commit each feature on its own branch, merge to main
6. Verify Vercel deployment after each merge

### REMINDERS
- Design system: navy #0A1628, mint #34D399, orange #FB923C, Plus Jakarta Sans
- All new tables need RLS policies
- All cron endpoints need CRON_SECRET protection
- All new chatbot tools go in src/app/api/chat/tools/
- GitHub: airpau/lifeadmin-ai
- Supabase project: kcxxlesishltdmfctlmo

---

## 2026-03-26 22:30 - Claude Code Session (End of Day)
**Completed:** 70+ features, fixes, and improvements. Highlights: 8 of 10 roadmap features built (Share Your Win, Credit Score Warning, Price Increase Alerts, Smart Bill Comparison, Receipt Scanner in AI Letters, Savings Challenges, Annual Financial Report, AI Self-Learning). Plus: universal email scanning (IMAP), X/Twitter integration, ElevenLabs TTS, 14-day Pro trial, referral Stripe rewards, churn prevention, energy tariff monitor, 20 UAT bugs fixed, unified merchant normalisation, 18 chatbot tools, Meta Ads campaigns, 4 SEO blog articles, UK journalist PR list.

**AI Self-Learning System:** Every user correction feeds merchant_rules with confidence scoring. Confidence 1 = suggestion, 2+ = overrides hardcoded, 3+ = applied retroactively. Nightly 2am cron applies trusted rules to all users. Wired into spending, Money Hub, and transactions APIs.

**Skipped:** WhatsApp Bot (not worth the cost/complexity), Household Mode (data protection concerns, too complex for v1).

**Blockers:**
1. Microsoft Azure app (Outlook OAuth) - Paul needs to register at portal.azure.com
2. Google Ads Basic API access - applied, waiting for Google
3. Google OAuth verification - submitted 24 March
4. Meta App Review - needed for ad creatives

**Next steps:** Claude Desktop to run full end-to-end UAT test. Paul to set up Microsoft Azure app + Trustpilot page. Launch target ~2 April.



---

# UAT v2 BUG FIX INSTRUCTIONS FOR CLAUDE CODE (26 March 2026)

Read the task queue for all 17 bugs (BUG-V2-01 through BUG-V2-17). Fix them in priority order: CRITICAL → HIGH → MEDIUM → LOW.

**3 REGRESSIONS from UAT v1** — these were supposedly fixed but came back. Ensure fixes go in SHARED UTILITIES not component-local code:
- BUG-V2-02: Sync time "187m ago" (was v1 BUG-04)
- BUG-V2-03: Duplicate "Other" categories (was v1 BUG-05)
- BUG-V2-04: Negative currency £-amount (was v1 BUG-09)

## CRITICAL (1 bug)

**BUG-V2-01: Raw merchant names in dashboard comparison widget**
Raw bank names like "BRITISH GAS", "SKY SUBSCRIPTION 08442411653", "PAYPAL *LEBARA 2691337 35314369001". Expand merchant name cleaning utility with UK merchant mappings. Strip reference codes, processor prefixes, phone numbers. Apply to ALL transaction displays.

## HIGH (7 bugs)

**BUG-V2-02: Sync "187m ago" not human-readable (REGRESSION)**
Replace raw minutes with relative time: <60min → "X min ago", <24h → "X hours ago", <7d → "X days ago". Use formatDistanceToNow() if date-fns available. Fix must be in shared utility.

**BUG-V2-03: Duplicate "Other" categories (REGRESSION)**
Income 2x "Other", spending 3x "Other". Consolidate before rendering: merge all "Other"/"Uncategorised"/empty/null into single summed row.

**BUG-V2-04: Negative currency £-4,857.65 (REGRESSION)**
Use Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }). Create shared formatCurrency() used everywhere.

**BUG-V2-05: Raw merchant names in subscriptions**
"Patreon* Membershippat Internet", "LBH", "Dvla-a15eyp", "Communityfibre", "Testvalley" → clean names. Use same utility as BUG-V2-01.

**BUG-V2-06: Profile Connected Accounts shows "Coming Soon"**
Gmail and Bank connected but showing "Coming Soon". Query bank_connections and email_connections tables for actual status.

**BUG-V2-07: Profile stats all £0/0/0**
13 letters generated but stats show 0. Query complaints table for COUNT, SUM(estimated_savings), and active disputes count.

**BUG-V2-08: Cancel options on uncancellable services**
Council tax, water, DVLA showing cancel buttons. Create blocklist, hide cancel or show "Statutory charge" label.

## MEDIUM (7 bugs)

**BUG-V2-09: Footer inconsistency** — All public pages must use same shared 4-column Footer. Deals page has NO footer at all.

**BUG-V2-10: "56 deals" vs 53 actual** — Make homepage count dynamic or update static number.

**BUG-V2-11: No 14-day trial on pricing** — Add "Start with 14-day free trial" badge, change CTA to "Start Free Trial".

**BUG-V2-12: Scanner missing connection sections** — Bank connection CTA and email provider tiles not rendering. Check component.

**BUG-V2-13: Duplicate council tax entries** — LBH + L.B. Hounslow as separate entries. Deduplicate after name cleaning.

**BUG-V2-14: Forms page empty** — /dashboard/forms renders no content. Check component for errors.

**BUG-V2-15: No Forms vs Letters distinction** — Add descriptions and cross-links on each page.

## LOW (2 bugs)

**BUG-V2-16: Dashboard 5+ second load** — Use Promise.all() for parallel fetching, add skeleton loaders.

**BUG-V2-17: Bottom tab bar obscures content** — Add pb-20 to main content wrapper, lg:pb-6 for desktop reset.

## AFTER FIXES
1. `npx tsc --noEmit` for TypeScript errors
2. Test each fix visually
3. Extra attention on 3 regressions — shared utilities not component-local
4. Test currency with positive, negative, zero, large values
5. Mark bugs done in task queue
6. Commit with clear message
7. Verify Vercel deployment

Design system: navy #0A1628, mint #34D399, orange #FB923C | GitHub: airpau/lifeadmin-ai | Supabase: kcxxlesishltdmfctlmo

---

## 2026-03-26 23:08:29 - Cowork (UAT Tester)
**Completed:** Completed comprehensive end-to-end UAT v2 test of paybacker.co.uk on 26 March 2026. Tested: Homepage, About, Blog, Deals, Pricing, SEO pages, Auth flow, Dashboard Overview, Money Hub, Subscriptions, AI Letters, Scanner, Deals (dashboard), Rewards, Profile, Chatbot, Forms, and mobile responsiveness. Found 17 bugs: 1 CRITICAL, 7 HIGH, 7 MEDIUM, 2 LOW. 3 bugs are REGRESSIONS from UAT v1 (sync time format, duplicate Other categories, negative currency format). All bugs logged to MCP task queue with fix instructions. Full HTML report saved. Fix prompt saved to handoff-notes.md.

**Next steps:** 1. Fix all 17 bugs in priority order (CRITICAL → HIGH → MEDIUM → LOW) using the instructions in handoff-notes.md under "UAT v2 BUG FIX INSTRUCTIONS". 2. Pay special attention to the 3 regressions (BUG-V2-02, 03, 04) — ensure fixes go in shared utilities so they don't regress again. 3. The merchant name cleaning (BUG-V2-01, V2-05) is a cross-cutting concern — build one robust utility and apply it everywhere. 4. After fixing, run TypeScript checks, test visually, mark tasks done in queue. 5. After bug fixes are deployed, run UAT v3 to verify all fixes and check for new regressions. 6. Then proceed to building the 10 new features (instructions already in handoff-notes.md from earlier today).

---

## 2026-03-26 23:00 - Claude Code Session (FINAL End of Day)
**Completed:** Fixed all 17 UAT v2 bugs (3 regressions + 14 new). Updated blueprint with 35+ new completed items. Updated task queue. Logged full session summary to MCP business_log. All tier features updated on homepage (22 rows) and pricing page.

**Session totals:** 80+ features/fixes/improvements. 37 bugs fixed. 18 chatbot tools. 8 of 10 roadmap features. AI self-learning system. Universal email scanning. X/Twitter. ElevenLabs. 14-day trial. Referral rewards. The product is feature-complete for launch.

**Tomorrow priorities:**
1. Paul: register Microsoft Azure app (portal.azure.com) for Outlook OAuth
2. Paul: manual feature testing
3. Paul: Trustpilot page setup
4. Wait for: Google Ads Basic access, Google OAuth verification
5. Fix any bugs found in testing
6. Launch preparation (~2 April target)



---

# AI LETTERS INTELLIGENCE UPGRADE — ARCHITECTURE BLUEPRINT (27 March 2026)

## Overview
Transform AI Letters from one-shot letter generator into threaded dispute companion. Consumer product — NO legal jargon anywhere in the UI. The user experience: "You tell us what happened. We write the perfect response."

## Architecture Decision: Legal Knowledge Base
**Structured reference docs, NOT RAG or vector DB.** UK consumer law is a bounded, stable corpus (~15-20 statutes cover 95% of disputes). Store in `legal_references` table, look up by category/subcategory, inject into Claude prompt. Cost: ~2K extra tokens per request ($0.006). No vector DB hosting needed.

## 5 New Tables + 1 FK Addition

### 1. legal_references — Powers the AI (invisible to users)
~80-120 rows covering all UK consumer dispute categories. Fields: category, subcategory, law_name, section, summary, full_text, applies_to (text array), strength ('strong'/'supporting'/'escalation'), escalation_body.

### 2. disputes — One thread per company issue
Fields: user_id FK, provider_name, provider_type, issue_type, title, description, status (open/waiting_response/escalated/resolved_won/resolved_partial/resolved_lost/closed), disputed_amount, recovered_amount, escalation_level (company/deadlock/ombudsman/court), escalation_body, deadlock_date, resolved_at. RLS enabled.

### 3. correspondence — Every message in the thread
Fields: dispute_id FK, user_id FK, direction (outbound/inbound), method (letter/email/phone_call/live_chat/uploaded_document), subject, body, body_html, attachments jsonb, legal_refs_used jsonb, ai_generated bool, ai_confidence numeric, sent_at. RLS enabled.

### 4. contract_extractions — What Claude Vision found in contracts
Fields: user_id FK, dispute_id FK, provider_name, file_url, file_type, raw_extracted_text, contract_start, contract_end, minimum_term_months, notice_period_days, monthly_cost, annual_cost, cancellation_fee, price_increase_terms, early_exit_fee, key_clauses jsonb, auto_renewal, cooling_off_days, ai_summary. RLS enabled.

### 5. provider_terms — Company T&Cs we know about (shared, no RLS)
Fields: provider_name, provider_type, cancellation_policy, cancellation_notice_days, cancellation_fee, price_increase_terms, minimum_term_months, complaint_email, complaint_phone, complaint_address, complaint_escalation, ombudsman_name, ombudsman_url, deadlock_weeks (default 8), auto_renewal, cooling_off_days (default 14), tc_url, last_verified, notes.

### 6. Add dispute_id FK to existing tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id);

## 5 Delivery Phases (each ships independently)

**Phase 1 (3-4 days): Dispute Threads + Correspondence Tracking** — disputes table, correspondence table, dispute detail page with timeline, upload, phone logging, thread-aware letter generation. Migrate existing letters into threads.

**Phase 2 (2 days): Legal Intelligence** — legal_references table, seed ~80 rows, inject into prompt by category, show "Laws cited" on letters, confidence indicator.

**Phase 3 (3 days): Contract Intelligence** — contract_extractions table, Claude Vision upload+extraction, "Here's what we found" results card, contract terms fed into letter generation prompt.

**Phase 4 (2-3 days): Provider Knowledge** — provider_terms table, seed top 30 UK providers, auto-populate complaint addresses, show "Their T&Cs say..." in dispute detail, ombudsman escalation CTA.

**Phase 5 (2-3 days): Escalation Automation** — deadlock timer (8-week rule), smart nudges, ombudsman narrative generation, resolution tracking, "You've saved £X" dashboard.

## AI Prompt Architecture
The generate endpoint assembles: system prompt (consumer rights expert persona) + dispute context + full correspondence thread (oldest first) + contract terms (if uploaded) + provider T&Cs (if in database) + relevant legal references (by category). Output as JSON: { letter, confidence, confidence_reasoning, laws_cited, next_step_suggestion }. Cost per generation: ~$0.015-0.030 with Sonnet.

## Consumer Language Rules
NEVER show in UI: "case", "evidence", "legal database", "escalation level", "thread", "case management"
ALWAYS use: "dispute", "what happened", "your rights", "next step", "their response", "your contract says"



---

# BUILD STATUS — AI Letters Intelligence Upgrade (27 March 2026)
- Phase 1: DEPLOYED ✅ (disputes + correspondence + migration)
- Phase 2: NOT STARTED (legal_references table + smart citation)
- Phase 3: PARTIAL (contract_extractions table exists, UI NOT showing — needs fix)
- Phase 4: NOT STARTED (provider_terms table + 30 UK providers)
- Phase 5: NOT STARTED (escalation automation + resolution tracking)
- Guided tour: has_seen_disputes_tour column added to profiles ✅
- Trustpilot: SET UP ✅
- LinkedIn vanity URL: SET UP ✅
- Google OAuth verification: STILL WAITING (submitted 24 March)

---

## 2026-03-28 01:06:27 - Claude Desktop (Cowork)
**Completed:** Phase 2 (Legal Intelligence) database verification complete. Confirmed via Supabase queries:
- 85 legal references in production, all with source_url, all verification_status = "current"
- All last_verified timestamps from 27-28 March 2026
- Categories: finance(18), energy(17), general(17), broadband(16), travel(3), parking(3), insurance(2), hmrc(2), council_tax(2), debt(2), nhs(2), dvla(1)
- BUG FIX CONFIRMED: provider_type backfilled on all 13 disputes (energy:8, broadband:4, finance:1)
- BUG FIX CONFIRMED: provider_name casing normalised (British Gas, E.ON, LendInvest, OneStream, Virgin Media)
- BUG FIX CONFIRMED: DELETE RLS policy added to disputes table (now has all 4: SELECT/INSERT/UPDATE/DELETE)

**Next steps:** PHASE 2 GAPS — Claude Code must complete these 4 items:

1. AUTOMATED VERIFICATION CRON — NOT BUILT
   - No pg_cron extension installed (cron.job table doesn't exist)
   - No database functions matching 'legal' or 'verif'
   - No Edge Functions deployed
   - NEEDS: Either Vercel cron API route or Supabase Edge Function that periodically checks source_urls still resolve (HTTP HEAD requests to legislation.gov.uk) and updates last_verified / verification_status
   - Schema already supports it: last_verified, last_changed, verification_status, verification_notes columns exist

2. ANTI-HALLUCINATION SAFEGUARDS — Check letter generation prompt
   - Letter generation must ONLY cite legal_references that exist in the DB
   - AI must not invent statute names or section numbers
   - Implement: query legal_references by category/applies_to BEFORE generating letter, inject matched refs into prompt, instruct Claude to ONLY use provided refs

3. DISCLAIMER FOOTER — Add to generated letters
   - Every AI-generated letter needs: "This letter was generated by AI using publicly available legal information. It does not constitute legal advice. If unsure, consult a qualified solicitor or Citizens Advice."
   - Add to letter generation output AND to any PDF/email exports

4. CONFIDENCE INDICATOR BADGES — UI on legal ref pills
   - The "Your rights" pills already link to legislation.gov.uk
   - Add visual confidence badges using the strength column (values likely: strong/moderate/weak)
   - Green badge = strong, Amber = moderate, Grey = informational
   - Show on the letter preview UI next to each cited reference

---

## 2026-03-28 01:16:14 - Claude Desktop (Cowork)
**Completed:** Phase 3 architecture designed. Audited existing infrastructure: contract_extractions table exists but locked to disputes (dispute_id NOT NULL, 0 rows), subscriptions has contract fields but no file upload, correspondence-files bucket exists but no contracts bucket, contract_extractions missing UPDATE/DELETE RLS.

**Next steps:** Phase 3 scope: 1) Schema changes (make dispute_id nullable, add subscription_id FK, add UPDATE/DELETE RLS, create private contracts storage bucket), 2) Contract upload API with Claude Vision extraction, 3) Contract Vault page at /dashboard/contracts with cards/filters/detail view, 4) Contract expiry alerts (30-day warnings via money_hub_alerts), 5) Link contracts to subscriptions with sync, 6) Integration with letter generation (inject contract terms into prompts). Full prompt provided to Paul for Claude Code session.

---

## 2026-03-28 01:28:20 - Claude Desktop (Cowork)
**Completed:** All 3 phases of AI Letters Intelligence Upgrade verified complete in Supabase. Phase 3 confirmed: contract_extractions schema updated (dispute_id nullable, subscription_id added, file_type, contract_type, monthly_cost, annual_cost columns), full CRUD RLS, private contracts storage bucket. 85 legal refs all current. Project status updated.

**Next steps:** 1. BUG FIX: Guided tour breaks on step 2 — Framer Motion spotlight, likely DOM target not found or timing issue. 2. Phase 4: Provider T&Cs for 30+ UK companies. 3. Phase 5: Deadlock tracking, nudges, resolution, dashboard stats.
