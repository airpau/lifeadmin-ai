# Handoff Notes

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
