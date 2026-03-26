# Task Queue

## Strategic (Analyse in Claude Desktop first)
- [ ] Interactive chatbot dashboard management - Phase 1 DONE (subscription tools). Phase 2: Money Hub tools. Phase 3: cross-tab intelligence.
- [ ] Admin dashboard Leads tab - view, filter, update lead status, retargeting
- [ ] Meta Custom Audiences retargeting from leads table

## Critical
- [ ] Re-enable founding member programme (blocked: waiting Oscar Awin sign-off)
- [ ] Fix Telegram agent callback reliability (agents run but results not always returned)
- [ ] Verify Railway rebuilt with Casey's posting tools
- [x] ~~Fix sidebar routing~~ DONE
- [x] ~~Fix 404 public pages~~ DONE
- [x] ~~Custom 404 page~~ DONE
- [x] ~~Finexer -> TrueLayer~~ DONE
- [x] ~~Fix complaint letter dates~~ DONE - today's date injected into prompt
- [x] ~~Auto-fill user profile data~~ DONE - replaces placeholders post-generation
- [x] ~~Fix sidebar active state~~ DONE - startsWith for sub-routes
- [x] ~~Dead Octopus Energy link~~ DONE - removed from both deals pages

## High
- [ ] Chase Oscar for Awin sign-off on test+oscar7
- [ ] ElevenLabs integration for video content (Creator plan £11/mo)
- [ ] Action items form pre-fill -- verify complaints page reads params correctly
- [ ] Meta App icon (1024x1024) for App Settings
- [ ] Google Ads developer token -- check if basic access approved
- [ ] Mobile responsive pass -- full landing page (hamburger menu, stacking cards)
- [ ] Fix subscription billing dates: auto-advance next_billing_date when in past. Consolidate duplicate Other categories in spending. Show human-readable sync times.
- [x] ~~Onboarding flow~~ DONE
- [x] ~~Merchant name normalisation~~ DONE
- [x] ~~Chatbot popup~~ DONE
- [x] ~~Mobile chatbot~~ DONE
- [x] ~~Currency formatting~~ DONE - formatGBP utility
- [x] ~~Pricing page nav~~ DONE
- [x] ~~Cancellation email status~~ DONE - no longer changes to pending_cancellation
- [ ] Build Google Ads API Integration & Create First Search Campaigns - Build a Google Ads API integration for Paybacker to programmatically create and manage ad campaigns.

## Credentials
- Access Level: Explorer (production access, 2,880 ops/day limit)
- Developer Token: jCSfgPvX1M1zrWb92a3Zyw
- Customer ID: 390-589-8717

IMPORTANT: Store these in environment variables, NOT hardcoded. Use GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID.

## What Explorer Access Allows
- Create/manage campaigns, ad groups, ads, extensions
- Set budgets, targeting, bidding strategies, manage keywords
- Read performance data and reporting
- Pause, enable, modify campaigns
- 2,880 operations/day (plenty for single account)

## What Explorer Access CANNOT Do (don't build these)
- Keyword Planner API (do research in Google Ads UI instead)
- Audience Insights / Reach Planning API
- Billing/payments management via API
- Creating new advertiser accounts

## Implementation Steps

1. INSTALL GOOGLE ADS API CLIENT
   - npm: google-ads-api (Node.js client) OR use REST API directly
   - Set up OAuth2 credentials (will need refresh token — check if already configured)

2. CREATE API ROUTE: /api/google-ads/campaigns
   - POST: Create new campaign (campaign type, budget, bidding strategy, targeting)
   - GET: List campaigns with performance metrics
   - PATCH: Update campaign settings (budget, status, targeting)

3. CREATE API ROUTE: /api/google-ads/ads
   - POST: Create ad groups and responsive search ads
   - GET: List ads with performance data
   - PATCH: Update ad copy, pause/enable ads

4. CREATE FIRST SEARCH CAMPAIGNS targeting these segments:
   a. "Complaint letter generator" / "write complaint letter" / "consumer rights letter" — high intent, low competition
   b. "Cancel subscription help" / "how to cancel [provider]" — matches core feature
   c. "Overcharged on energy bill" / "energy bill complaint" — matches SEO landing pages
   d. "Check if I'm owed a refund" / "claim refund from company" — money recovery angle

5. AD COPY TEMPLATES (Responsive Search Ads):
   Headlines (max 30 chars each, need 15):
   - "Free AI Complaint Letters"
   - "Fight Unfair Bills With AI"
   - "Get Your Money Back Today"
   - "Cancel Subscriptions Easily"
   - "AI-Powered Bill Fighter"
   - "Write Complaint Letters Free"
   - "Overcharged? We Can Help"
   - "Save Money on Every Bill"
   - "UK Consumer Rights Tool"
   - "Stop Overpaying on Bills"
   - "Free Energy Bill Check"
   - "AI Writes Your Complaints"
   - "Paybacker - Money Recovery"
   - "Reclaim What You're Owed"
   - "Smart Subscription Manager"
   
   Descriptions (max 90 chars each, need 4):
   - "Paybacker uses AI to write complaint letters, track subscriptions & find savings. Try free."
   - "Connect your bank, spot overcharges, and let AI generate complaint letters in seconds."
   - "Join thousands saving money with AI-powered bill management. No credit card needed."
   - "FCA-regulated Open Banking. AI complaint letters. Subscription tracking. 100% free tier."

6. CAMPAIGN SETTINGS:
   - Location targeting: United Kingdom
   - Language: English
   - Bidding: Maximise conversions (start with this)
   - Daily budget: Start at £10/day per campaign (Paul can adjust)
   - Conversion tracking: Track signups via the existing UTM/gclid tracking on signup

7. CREATE GOOGLE ADS AGENT (optional, for Oscar or new agent):
   - Daily performance check via API
   - Auto-pause underperforming ads (high spend, no conversions after 7 days)
   - Weekly performance report to Charlie for Telegram digest

## Notes
- Explorer access is sufficient for all campaign management operations
- Don't build keyword planner features — those are restricted at this access level
- The existing UTM/gclid tracking on signup should already capture Google Ads conversions
- Start with search campaigns only — display/video can come later (@Claude Code)

## High (from GTM Strategy)
- [ ] Install Meta Conversions API (server-side) alongside Pixel for better ad attribution
- [ ] Add fbclid capture on signup (same pattern as gclid/UTM in middleware)
- [ ] Weekly signup-by-source SQL query + Telegram report for CAC tracking
- [ ] Trust signals: testimonials section, letter count stats, success rate on homepage
- [ ] Weekly Money Digest Email - spending summary, renewal alerts, deal suggestions
- [ ] Money Recovery Score - gamified dashboard metric showing potential savings

## Medium
- [ ] Legal compliance monitoring (Leo CLO agent)
- [ ] Instagram Stories posting support
- [ ] Video content generation pipeline (ElevenLabs + fal.ai)
- [ ] Telegram approval buttons for proposals
- [ ] AI Bill Negotiator - automated negotiation letters for existing providers
- [ ] Smart Document Scanner - OCR for bills/contracts
- [ ] Energy Tariff Monitor - real-time energy deal alerts

## Low
- [ ] CJ Affiliate setup (British Gas)
- [ ] Charlie Telegram -- improve agent run reliability
- [ ] Update blueprint doc with MCP server and unified system
- [ ] Household Mode - shared household finance management
- [ ] Savings Passport - visual savings tracker with milestones
- [ ] Paybacker for Business - B2B expansion scoping
