# Task Queue

## Strategic (Analyse in Claude Desktop first)
- [ ] Interactive chatbot dashboard management - users manage subscriptions, transactions, budgets, deals via chatbot with tool-use. Add company logos (Clearbit/Brandfetch). Full spec in business_log.
- [ ] Admin dashboard Leads tab - view, filter, update lead status, retargeting
- [ ] Meta Custom Audiences retargeting from leads table

## Critical
- [ ] Re-enable founding member programme (blocked: waiting Oscar Awin sign-off)
- [ ] Fix Telegram agent callback reliability (agents run but results not always returned)
- [ ] Verify Railway rebuilt with Casey's posting tools
- [ ] Fix sidebar client-side routing bug - Dashboard sidebar navigation is broken. Clicking nav links updates URL but page content doesn't re-render — users must F5 to navigate. Check sidebar Link components and dashboard layout re-render logic. Likely missing next/link or layout state caching issue. (@Claude Code)
- [ ] Fix 404 public pages (/deals, /dispute-energy-bill, /solutions/energy) - Multiple public URLs return 404: /deals, /dispute-energy-bill, /solutions/energy. Landing page CTA 'Browse Deals Free' links to /deals which 404s. Create public deals preview page. Check if SEO pages exist in codebase. Remove broken URLs from sitemap. (@Claude Code)
- [ ] Create custom 404 page with branding - Currently shows default Next.js plain white 404. Create app/not-found.tsx with Paybacker dark theme, navigation, links to home/complaints/pricing, and CTA to generate a free complaint letter. (@Claude Code)
- [ ] Fix about page Finexer reference — should be TrueLayer - About page says 'powered by Finexer' for Open Banking but actual integration uses TrueLayer. Search and replace all Finexer references in codebase. Subscriptions page correctly says TrueLayer. (@Claude Code)

## High
- [ ] Chase Oscar for Awin sign-off on test+oscar7
- [ ] ElevenLabs integration for video content (Creator plan 11/mo)
- [ ] Action items form pre-fill -- verify complaints page reads params correctly
- [ ] Meta App icon (1024x1024) for App Settings
- [ ] Google Ads developer token -- check if basic access approved
- [ ] Build new user onboarding flow - New users land on complex dashboard with no guidance. Create onboarding checklist widget on Overview for users where onboarded_at IS NULL: (1) Connect bank, (2) Review subscriptions, (3) Generate first complaint letter, (4) Set a budget. Set onboarded_at when complete. (@Claude Code)
- [ ] Normalise bank-detected merchant names + add logos - Bank-detected subscriptions show raw ALL CAPS: DELIVEROO PLUS SUBS, L.B.HOUNSLOW, VIRGIN MEDIA PYMTS. Create merchant name mapping (provider_domains table). Add logos via Clearbit API. Add logo_url and provider_domain columns to subscriptions. Fallback to coloured initials. (@Claude Code)
- [ ] Fix chatbot popup — only show once per session - Chatbot proactive message appears on EVERY page load and overlaps content (pricing table, deals, trust section). Use sessionStorage to show once per session only. Don't show on pricing/checkout pages. Chatbot icon alone is sufficient. (@Claude Code)
- [ ] Mobile responsive pass — landing page first - Site does not respond to mobile viewports at all. On 390px: nav shows full text links (need hamburger menu), cards don't stack, dashboard sidebar doesn't collapse. Start with landing page: hamburger nav, stacking cards, full-width CTAs. Then dashboard: bottom tab bar or collapsible sidebar. (@Claude Code)

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
