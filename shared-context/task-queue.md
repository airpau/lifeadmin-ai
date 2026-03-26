# Task Queue (Updated 26 Mar 2026)

## Just Completed
- [x] Weekly acquisition report + /cac Telegram command (built, deploying)
- [x] Facebook /photos endpoint fix (no more Supabase link previews)
- [x] Social post deduplication guard (max 1 Facebook post per day)
- [x] Instagram cross-post of launch announcement
- [x] ICO trust signals added to homepage, footer, about page
- [x] Founding member programme re-enabled (Oscar approved Awin)
- [x] Full website redesign (navy/mint design system)
- [x] Interactive chatbot Phase 1 (subscription tools)
- [x] Support ticketing system + AI executive team
- [x] Meta Conversions API (server-side)
- [x] Google Ads API integration built
- [x] Telegram bot with agent triggering
- [x] MCP server for cross-interface coordination

## Immediate (ready to build now)
- [ ] Repost Facebook with /photos endpoint (deploy in progress)
- [ ] Clean up 30+ stale agent_tasks from 24 Mar
- [ ] Create first Google Ads search campaigns via API (credentials ready)

## High Priority
- [ ] Weekly Money Digest Email (retention) - spending summary, renewal alerts, savings tips
- [ ] Money Recovery Score - dashboard widget showing savings potential
- [ ] Profile page address/postcode fields - for auto-filling complaint letters
- [ ] Admin dashboard Leads tab - view social media leads
- [ ] Interactive chatbot Phase 2 - Money Hub tools (budget, spending, goals via chat)
- [ ] Build 5-email welcome sequence in Resend - WEEK 1-2 — Create automated email drip sequence:
Email 1 (day 0): 'Welcome to Paybacker!' — CTA: Complete first account scan
Email 2 (day 3): 'We found potential savings' — personalised with scan results
Email 3 (day 7): 'Did you know AI can write complaint letters?' — Feature showcase
Email 4 (day 14): 'Switch deals and save £X/year' — Deal switching feature
Email 5 (day 21): 'Unlock Pro features — 7-day free trial' — Upgrade CTA with social proof
All emails: Paybacker branding, unsubscribe, mobile-optimised, track opens + clicks. (@Claude Code)
- [ ] Set up complete analytics tracking (GA4 + Mixpanel + UTM) - WEEK 2 — Configure complete analytics:
- GA4: Custom events for signup, login, scan_complete, complaint_generated, deal_found, upgrade_to_essential, upgrade_to_pro, referral_shared, referral_converted
- Mixpanel: Signup funnel (landing → signup → scan → value_found → upgrade)
- UTM parsing: Store utm_source, utm_medium, utm_campaign in user profile on signup
- First-touch attribution stored per user
- Weekly automated report email every Monday to paul@paybacker.co.uk (@Claude Code)
- [ ] Write & publish 4 SEO articles (Month 1 batch) - WEEK 1 — Generate and deploy 4 SEO articles to paybacker.co.uk/blog:
1. 'How to Dispute Your Energy Bill UK 2026' (target: 'dispute energy bill uk')
2. 'Flight Delay Compensation: Complete UK Guide' (target: 'flight delay claim uk')
3. 'Cancel Any Subscription UK: New 2026 Law Explained' (target: 'cancel subscription uk law')
4. 'Council Tax Band Challenge: Step-by-Step Guide' (target: 'council tax band wrong')
Each article: 1500+ words, H1/H2 structure, FAQ schema markup, internal links, meta title (60 char), meta description (155 char). Submit to Google Search Console for indexing. (@Claude Code)
- [ ] Build automated Google Ads weekly optimisation script - WEEK 2 — Create cron job that runs every Monday:
1. Pull last 7 days metrics for all campaigns (impressions, clicks, conversions, cost, CPA)
2. Rules: CPA < £6 → increase daily budget 20% (cap 3x original). CPA £6-10 → no change. CPA £10-15 → decrease 30%. CPA > £15 → pause.
3. Add negative keywords from search terms report (irrelevant terms)
4. Log all changes to Paybacker MCP via append_context
5. Send summary email to Paul (@Claude Code)
- [ ] Build automated Meta Ads weekly optimisation script - WEEK 2 — Create cron job that runs every Monday:
1. Pull last 7 days metrics for all ad sets
2. Rules: CPA < £6 → increase budget 20%. CPA > £12 → pause. CTR < 0.8% → flag for creative replacement.
3. Rotate creatives monthly (test 2 new variants)
4. Refresh lookalike audiences monthly from latest converter data
5. Log changes and send summary email (@Claude Code)
- [ ] Build churn prevention automation system - WEEK 3 — Create automated churn prevention:
- 7 days inactive → re-engagement email ('We found new savings for you')
- 14 days no scan → push email ('New savings found since your last visit')
- Cancellation page visit → show retention offer (1 month free)
- 3 days before renewal → value summary email ('This month you saved £X')
- Log all churn events with reason codes to Supabase
Target: reduce churn to < 2.5%, retention offers converting > 20% (@Claude Code)

## Bug Fixes (from Desktop review)
- [ ] Hero text contrast on landing + pricing pages
- [ ] Public pages navbar not responsive on mobile (no hamburger menu)
- [ ] Inconsistent navbar links across public pages
- [ ] Sign In button should redirect logged-in users to dashboard
- [ ] Pricing page excessive empty space + missing monthly/annual toggle
- [ ] Plan status mismatch (sidebar vs profile)
- [ ] Deals count mismatch (index vs category page)
- [ ] Pricing card text contrast

## Medium Priority
- [ ] SEO landing pages (dispute-energy-bill, flight-delay-compensation, etc.)
- [ ] Casey social post branding update (mint/navy prompts)
- [ ] Meta Custom Audiences retargeting from leads table
- [ ] Welcome email sequence (5-email onboarding drip via Resend)
- [ ] ElevenLabs video content integration (key stored on Vercel)
- [ ] Interactive chatbot Phase 3 - cross-tab intelligence
- [ ] Legal compliance monitoring (Leo CLO agent)

## Low Priority
- [ ] CJ Affiliate setup (British Gas)
- [ ] Instagram Stories support
- [ ] AI Bill Negotiator
- [ ] Energy Tariff Monitor
- [ ] Smart Document Scanner
- [ ] Household Mode / Savings Passport / Paybacker for Business

## Critical
- [ ] Google Ads: Create 3 initial search campaigns - WEEK 1 — Create 3 exact-match search campaigns via Google Ads API:
1. 'PB-Energy-Dispute': keywords=['dispute energy bill uk','energy bill help uk','energy bill too high'], match=EXACT, CPC cap=£3.50, daily=£10, location=England+Wales, age=25-55
2. 'PB-Cancel-Sub': keywords=['cancel subscription uk','how to cancel subscription','subscription cancellation law uk'], match=EXACT+PHRASE, CPC=£3.00, daily=£8
3. 'PB-Flight-Delay': keywords=['flight delay compensation uk','flight delay claim'], match=EXACT, CPC=£4.00, daily=£8
Conversion tracking: signup event from GA4. Total budget: £800/month across all 3. (@Claude Code)
- [ ] Meta Ads: Create 2 initial conversion campaigns - WEEK 1 — Create 2 conversion campaigns via Meta Ads API:
1. 'PB-Problem-Aware': objective=CONVERSIONS, interests=['personal finance','money saving expert','consumer rights','energy bills'], age 25-45, UK, £5/day. Creative: 'Still Overpaying for Bills?' with product screenshot.
2. 'PB-Solution-Aware': objective=CONVERSIONS, retarget website visitors 30d + 2% lookalike from signup completers, £5/day. Creative: 'AI Writes Your Complaint Letter in 60 Seconds'.
Install Meta Pixel on paybacker.co.uk for signup + upgrade events. Total budget: £600/month. (@Claude Code)
- [ ] Build referral system (dual-sided £5 reward) - WEEK 1 — Build complete referral system:
- Supabase tables: referral_codes, referral_rewards
- API: POST /api/referral/generate, POST /api/referral/redeem
- Reward: Both parties get 1 month free Essential (or £5 credit if paying)
- Dashboard: 'Invite Friends' card with copy-to-clipboard share link
- Email trigger via Resend when referral converts
- UTM tracking: all referral links include utm_source=referral&utm_campaign={user_code} (@Claude Code)
