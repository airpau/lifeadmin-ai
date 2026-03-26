# Shared Memory

## Key Credentials (Reference Only - actual values in Claude memory)
- Stripe: Live mode (pk_live, sk_live, whsec)
- Meta: System user token (never expires), Page ID, IG ID
- Awin: Publisher 2825812, Advertiser 125502
- Google Ads: Campaign 23678309004
- Railway: Agent server running 15 agents
- Telegram: Bot @PaybackerAssistantBot, Founder chat ID 1003645878

## Key URLs
- Production: paybacker.co.uk
- Railway: lifeadmin-ai-production.up.railway.app
- GitHub: airpau/lifeadmin-ai
- Supabase: kcxxlesishltdmfctlmo (eu-west-2)

## Current Users
- 27 total (mostly test accounts)
- 1 real external user: Lewis Fields (lewis.baker1995@gmail.com)
- All test+oscar accounts are Awin integration tests
- MRR: ~100 (all from test accounts)



## Marketing Playbook (2026-03-26)
Full marketing playbook created covering Google Ads, Meta Ads, and influencer marketing. Saved as paybacker-marketing-playbook.md in outputs. Key details:
- Budget: £500-£1,500/mo across all channels
- Google Ads: 40-50% of budget. Search campaigns for complaint letters, subscriptions, energy bills, flight delays, money saving. Plus brand campaign and Performance Max. Campaign ID: 23678309004.
- Meta Ads: 25-30% of budget. Need to install Meta Pixel + Conversions API first, then let pixel learn 1-2 weeks. Conversion campaign + retargeting.
- Influencer: 15-25% of budget. UK personal finance micro-influencers (1K-50K). Use Paybacker referral links for tracking. £50-150 per micro collab.
- Tasks tagged [Claude Code] vs [Chrome] vs [Manual] for cross-interface execution.
- Immediate priorities: check Google Ads dev token, install Meta Pixel, add fbclid tracking, research influencers.
- Need to add: fbclid capture on signup, weekly signup-by-source SQL query, Telegram CAC report.



## GTM Strategy & Roadmap (March 2026)

### Readiness Scores
- Core Product: 8/10 | UX Polish: 5/10 | Trust & Social Proof: 3/10 | Onboarding: 4/10 | Acquisition Engine: 4/10 | Retention: 6/10 | Monetisation: 6/10 | Legal & Compliance: 5/10

### Critical Blockers
1. Awin affiliate sign-off (revenue dependent)
2. Meta App Review for social login
3. Google Ads developer token
4. UX bug fixes (38 bugs logged, 8 tasks in queue)

### Key New Feature Proposals
1. Money Recovery Score — gamified dashboard metric showing potential savings
2. AI Bill Negotiator — automated negotiation letters/scripts
3. Household Mode — shared household finance management
4. Weekly Money Digest Email — retention-driving email digest
5. Savings Passport — visual savings tracker with milestones
6. Smart Document Scanner — OCR for bills/contracts
7. Energy Tariff Monitor — real-time energy deal alerts
8. Paybacker for Business — B2B expansion for small businesses

### 12-Week Roadmap Summary
- Weeks 1-4: Fix critical bugs, UX polish, trust signals, onboarding flow
- Weeks 5-8: New features (Money Recovery Score, Weekly Digest, Household Mode)
- Weeks 9-12: Growth engine (referrals, content marketing, PR push, Paybacker for Business scoping)

### Competitive Differentiation
- vs Emma/Snoop/Plum: Paybacker combines budgeting WITH complaint resolution AND bill switching — none do all three
- vs Resolver: Paybacker adds AI-powered letter generation + open banking data, Resolver is manual templates only
- vs Citizens Advice/Which?: Paybacker automates the process end-to-end rather than just providing information

### Strategy Document
Full document: paybacker-gtm-strategy-and-roadmap.docx (generated 26 March 2026)



## Google Ads API Access (March 2026)
- Access Level: Explorer (production access)
- Developer Token: jCSfgPvX1M1zrWb92a3Zyw
- Customer ID: 390-589-8717
- Daily Operation Limit: 2,880 ops/day
- Can do: Create/manage campaigns, ad groups, ads, keywords, budgets, targeting, reporting
- Cannot do: Keyword Planner API, Audience Insights, billing management, account creation
- Task logged for Claude Code to build integration + first search campaigns



## Website Redesign Plan (March 2026)
- Direction: Calm & Trustworthy (Monzo/Revolut/Linear inspired)
- Scope: Full site — landing page, all public pages, full dashboard
- Tooling: v0 by Vercel (Premium $20/mo) for component generation + Claude Code for integration
- Fonts: Plus Jakarta Sans (headings) + Inter (body)
- Palette: Navy-950 #0A1628 base, mint-400 #34D399 accent, orange-400 #FB923C secondary, slate neutrals
- Key principles: Emotional predictability, generous whitespace, rounded cards (16px), soft shadows, framer-motion animations
- Task logged with full design tokens, colour palette, typography scale, every page specification, and v0 prompts
- Paul approved flexible budget



## Marketing Pack Created (March 2026)
- Full Google Ads copy for 4 campaigns: Complaint Letters, Subscription Management, Energy Savings, Money Recovery
- 15 RSA headlines + 4 descriptions per campaign, all within character limits
- Callout and sitelink extensions for all campaigns
- 2-week social media content calendar (14 posts) for Facebook + Instagram
- 5-email welcome/onboarding sequence with conditional logic
- Weekly Money Digest email template
- All saved in paybacker-marketing-pack.docx
- Implementation notes for Claude Code: use Resend for emails, Casey agent for social, Google Ads API for campaigns



## ElevenLabs + HeyGen Integration Plan (March 2026)
- ElevenLabs Creator plan ($22/mo): TTS, voice cloning, sound effects, music, conversational AI
- HeyGen Creator plan ($29/mo): AI avatar video generation with ElevenLabs voice integration
- Total: ~$51/mo

### Marketing Use Cases
- Automated video ad pipeline: script (Claude) → voiceover (ElevenLabs) → avatar video (HeyGen) → post (Casey agent)
- A/B test dozens of ad variants cheaply
- Social video content at scale

### Product Use Cases
- Voice-enabled chatbot (mic button, real-time speech conversation) — major differentiator
- "Listen to your letter" audio playback on complaint letters
- Personalised audio notifications/digests
- Custom audio branding (notification sounds, celebration chimes)

### Task logged for Claude Code with full API references and implementation order



## UPDATE: ElevenLabs Now Has Native Image & Video (March 2026)
- ElevenLabs launched Image & Video feature — NO NEED for HeyGen anymore
- Uses Google Veo + OpenAI Sora for video, Flux/Nanobanana for images
- Full pipeline on one platform: text → image → video → voiceover → music → lip-sync → export
- Studio feature: visual canvas for building content pipelines
- Flows (coming): programmatic API for automated content production at scale
- Video generation requires paid plan (Creator $22/mo minimum)
- This simplifies the stack to just ONE subscription (ElevenLabs) instead of ElevenLabs + HeyGen
- Previous task in MCP should be updated: remove HeyGen references, use ElevenLabs native video instead



## Pre-Launch Status (Updated 26 March 2026)
- **Launch target:** ~2 April 2026
- **Mode:** PRE-LAUNCH — build everything, deploy nothing live
- **Hard blockers:** (1) Google Ads Basic access, (2) Google OAuth verification, (3) TrueLayer production
- **Google Ads API:** Explorer access ONLY (2,880 ops/day). Can create campaigns but must be PAUSED. Awaiting Basic upgrade.
- **All ad campaigns:** Must be created in PAUSED state — Paul will approve go-live after blockers clear
- **MSE Forum:** DO NOT USE for promotion — high ban risk (Paul confirmed). Use editorial/press pitch route instead.
- **PR drafts in Gmail:** MSE, Guardian (Patrick Collinson), BBC Money Box, Which? — all ready, DO NOT SEND until product is live and tested
- **Social media posting:** Continues through pre-launch (Casey agent, brand awareness only)