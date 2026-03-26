# Task Queue

## Strategic (Analyse in Claude Desktop first)
- [ ] Interactive chatbot dashboard management - users manage subscriptions, transactions, budgets, deals via chatbot with tool-use. Add company logos (Clearbit/Brandfetch). Full spec in business_log.
- [ ] Admin dashboard Leads tab - view, filter, update lead status, retargeting
- [ ] Meta Custom Audiences retargeting from leads table

## Critical
- [ ] Re-enable founding member programme (blocked: waiting Oscar Awin sign-off)
- [ ] Fix Telegram agent callback reliability (agents run but results not always returned)
- [ ] Verify Railway rebuilt with Casey's posting tools
- [x] ~~Fix sidebar client-side routing bug~~ DONE - removed invalid edge runtime exports
- [x] ~~Fix 404 public pages~~ DONE - created public /deals page, fixed homepage CTA
- [x] ~~Create custom 404 page~~ DONE - branded not-found.tsx
- [x] ~~Fix Finexer reference~~ DONE - changed to TrueLayer on about + privacy pages
- [ ] Fix dates in generated complaint letters and cancellation emails - BUG-05/BUG-14: Complaint letters show '14 July 2025' and cancellation emails show '[Date]' placeholder. Pass current date to AI prompt and replace placeholders. Use new Date().toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'}). (@Claude Code)
- [ ] Auto-fill user profile data in generated letters - BUG-09: Letters contain [YOUR NAME], [YOUR EMAIL], [YOUR ADDRESS] etc. After generation, replace with data from profiles table and Supabase auth. Add profile edit form (BUG-33) so users can set address/phone. (@Claude Code)
- [ ] Fix sidebar active state bug on all dashboard pages - BUG-13: Sidebar highlights wrong page (e.g., Forms when on Rewards, Deals when on Subscriptions). Use usePathname() from next/navigation, compare against nav item hrefs, ensure re-render on route change. (@Claude Code)
- [ ] Remove or fix dead Octopus Energy affiliate link - BUG-18: Octopus Energy 'View Deal' opens awin1.com/closedMerchant.html — dead link. Remove deal or update affiliate URL. Add periodic health check for all deal links. (@Claude Code)

## High
- [ ] Chase Oscar for Awin sign-off on test+oscar7
- [ ] ElevenLabs integration for video content (Creator plan 11/mo)
- [ ] Action items form pre-fill -- verify complaints page reads params correctly
- [ ] Meta App icon (1024x1024) for App Settings
- [ ] Google Ads developer token -- check if basic access approved
- [x] ~~Build new user onboarding flow~~ DONE - checklist on dashboard overview - New users land on complex dashboard with no guidance. Create onboarding checklist widget on Overview for users where onboarded_at IS NULL: (1) Connect bank, (2) Review subscriptions, (3) Generate first complaint letter, (4) Set a budget. Set onboarded_at when complete. (@Claude Code)
- [x] ~~Normalise bank-detected merchant names + add logos~~ DONE - 70+ patterns, title-casing - Bank-detected subscriptions show raw ALL CAPS: DELIVEROO PLUS SUBS, L.B.HOUNSLOW, VIRGIN MEDIA PYMTS. Create merchant name mapping (provider_domains table). Add logos via Clearbit API. Add logo_url and provider_domain columns to subscriptions. Fallback to coloured initials. (@Claude Code)
- [x] ~~Fix chatbot popup~~ DONE - once per session, excluded from pricing/auth pages - Chatbot proactive message appears on EVERY page load and overlaps content (pricing table, deals, trust section). Use sessionStorage to show once per session only. Don't show on pricing/checkout pages. Chatbot icon alone is sufficient. (@Claude Code)
- [x] ~~Mobile responsive chatbot~~ DONE - repositioned above nav bar
- [ ] Mobile responsive pass — full landing page (hamburger menu, stacking cards) - Site does not respond to mobile viewports at all. On 390px: nav shows full text links (need hamburger menu), cards don't stack, dashboard sidebar doesn't collapse. Start with landing page: hamburger nav, stacking cards, full-width CTAs. Then dashboard: bottom tab bar or collapsible sidebar. (@Claude Code)
- [ ] Implement merchant name normalisation across all pages - BUG-16/19/23/24: Bank-sourced names display as ALL CAPS with appended phone numbers, dates, and truncation. Implement title-case conversion + known merchant mapping table. Apply to subscriptions, deals, Money Hub, spending, chatbot. (@Claude Code)
- [ ] Fix currency formatting across all pages - BUG-11/25: Currency values missing commas (£68352), trailing zeros (£11,289.8), or decimals (£5678). Use Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP', minimumFractionDigits:2}) consistently everywhere. (@Claude Code)
- [ ] Fix pricing page missing nav + allow landing page for logged-in users - BUG-03: Pricing page has no navigation header. BUG-02: Logged-in users redirected from landing page. Add PublicNavbar to pricing layout. Remove auth redirect from / route. (@Claude Code)
- [ ] Fix subscription billing dates, status changes, and consolidate Other categories - BUG-12: Auto-advance next_billing_date when in the past. BUG-15: Don't change status to Cancelling when generating email. BUG-20: Consolidate duplicate Other categories in spending breakdown. BUG-21: Show human-readable sync times. (@Claude Code)

## Medium
- [ ] Legal compliance monitoring (Leo CLO agent)
- [ ] Page load speed -- integrate LazyImage component (PR merged)
- [ ] Instagram Stories posting support
- [ ] Video content generation pipeline (ElevenLabs + fal.ai)
- [ ] Telegram approval buttons for proposals

## Low
- [ ] CJ Affiliate setup (British Gas)
- [ ] Charlie Telegram -- improve agent run reliability
- [ ] Update blueprint doc with MCP server and unified system
