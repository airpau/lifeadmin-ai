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
