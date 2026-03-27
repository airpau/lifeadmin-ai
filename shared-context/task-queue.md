# Task Queue (Updated 27 Mar 2026)

## URGENT - Email Spam Fix
- [ ] Implement global email rate limiter (max 2 emails per user per day)
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
- [ ] Google Ads Basic API access (applied, waiting for approval)
- [ ] Google OAuth verification (submitted 24 March)
- [ ] Meta App Review (needed for ad creatives - app in dev mode)
- [ ] TrueLayer production approval
- [ ] Microsoft Azure app verification

### Claude Code (when blockers clear):
- [ ] Create 3 Google Ads search campaigns PAUSED (when Basic access approved)
- [ ] Create Meta ad creatives (when app switched to Live mode)
- [ ] Fix any bugs from Paul's manual testing

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
