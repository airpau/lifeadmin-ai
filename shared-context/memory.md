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
