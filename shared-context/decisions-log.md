# Decisions Log

## 2026-03-26 -- Founding member pricing
**Decision:** Essential 4.99/mo, Pro 9.99/mo (founding member rates)
**Reason:** Original 9.99/19.99 too expensive for early users. Need to remove friction.
**Made by:** Founder

## 2026-03-26 -- Founding members paused
**Decision:** Disable founding member auto-upgrade during Awin testing
**Reason:** Oscar from Awin needs clean test flow without auto-upgrade interfering
**Made by:** Founder

## 2026-03-26 -- System user token for Meta
**Decision:** Use never-expiring system user token instead of user tokens
**Reason:** User tokens expire, system tokens don't. Enables fully autonomous posting.
**Made by:** Founder + Claude Code

## 2026-03-26 -- Daily social posting
**Decision:** Automated daily posts at 10am with Perplexity research
**Reason:** Need consistent social presence for user acquisition. Manual posting doesn't scale.
**Made by:** Founder

## 2026-03-26 -- Developer agent creates PRs only
**Decision:** Developer agent works on branches, never main. PRs require review.
**Reason:** Safety. Autonomous code changes to production are too risky.
**Made by:** Claude Code

## 2026-03-26 15:42:39 - Adopted aggressive 12-month £100K MRR execution plan. Starting budget £5K/month scaling to £18K cap. Influencer-led strategy (40% of budget) with Google Ads (20%), Meta Ads (15%), TikTok Spark Ads (10%), SEO (10%), Tools (5%). PR/partnerships strategy targeting MSE, Martin Lewis, Which?, MoneySupermarket for free growth spikes. Self-funding model: reinvest 80% of MRR.
**Decision:** Adopted aggressive 12-month £100K MRR execution plan. Starting budget £5K/month scaling to £18K cap. Influencer-led strategy (40% of budget) with Google Ads (20%), Meta Ads (15%), TikTok Spark Ads (10%), SEO (10%), Tools (5%). PR/partnerships strategy targeting MSE, Martin Lewis, Which?, MoneySupermarket for free growth spikes. Self-funding model: reinvest 80% of MRR.
**Reason:** Model projects £97.9K MRR at M12 from paid channels alone. PR/partnership expected value adds £15K+/mo, putting £100K+ MRR within reach. Total 12-month spend £162K, total revenue £462K, net positive £300K. Revenue exceeds spend from Month 3. Assumptions: 0.52 signups/£1 (influencer-led), 8.5% conversion, 2.5% churn, 0.22 viral coefficient.
**Made by:** Paul (founder) + Claude Desktop (Cowork)

## 2026-03-26 16:06:43 - Marketing plan Day 1 is gated on: (1) Google Ads developer token approval, (2) Google OAuth verification, (3) TrueLayer production status. Until all three are live, focus on pre-launch tasks that don't require these: MSE Forum reputation building, influencer identification, SEO content, and product bug fixes. The 90-day clock starts when all three are approved, not on a fixed calendar date.
**Decision:** Marketing plan Day 1 is gated on: (1) Google Ads developer token approval, (2) Google OAuth verification, (3) TrueLayer production status. Until all three are live, focus on pre-launch tasks that don't require these: MSE Forum reputation building, influencer identification, SEO content, and product bug fixes. The 90-day clock starts when all three are approved, not on a fixed calendar date.
**Reason:** Spending £5K/month on ads that drive users to a product where bank connections and email scanning don't work would waste budget and create a bad first impression. Better to nail the product experience first, build MSE Forum reputation (free), identify creators (free), and fix remaining bugs — then launch hard when everything is ready.
**Made by:** Cowork + Paul

## 2026-03-26 16:09:39 - Google Ads API: Explorer access confirmed. Awaiting upgrade to Basic access. Campaigns cannot launch until Basic access approved. Updated blocker status accordingly.
**Decision:** Google Ads API: Explorer access confirmed. Awaiting upgrade to Basic access. Campaigns cannot launch until Basic access approved. Updated blocker status accordingly.
**Reason:** Paul confirmed Google Ads API access at Explorer level but Basic access (needed for campaign management) is still pending approval. This remains a launch blocker alongside Google OAuth verification and TrueLayer production.
**Made by:** Paul + Cowork

## 2026-03-26 16:09:42 - Pre-launch mode activated. Paused ad-performance-monitor and weekly-performance-review scheduled tasks. Morning briefing updated to deliver pre-launch prep tasks until all 3 blockers clear (~2 April). Social posting continues as brand awareness.
**Decision:** Pre-launch mode activated. Paused ad-performance-monitor and weekly-performance-review scheduled tasks. Morning briefing updated to deliver pre-launch prep tasks until all 3 blockers clear (~2 April). Social posting continues as brand awareness.
**Reason:** No ads running yet, no product live yet. Monitoring tasks would produce empty reports. Focus shifts to free preparation work: influencer research, MSE forum engagement, PR prep, SEO content, and product testing.
**Made by:** Cowork

## 2026-03-26 19:30:37 - 10 features implementation plan finalised. Priority: P1 (Sprint 1): Share Your Win, Credit Score Warning, Price Increase Alerts, Smart Bill Comparison. P2 (Sprint 2): One-Click Switching, Receipt Scanner, Savings Challenges, Annual Financial Report. P3 (Sprint 3): WhatsApp Bot, Household Mode. Total: 41-56 dev days over 14 weeks. Architecture: Claude Vision for receipts, existing deals/energy_tariffs for bill comparison, WhatsApp Cloud API for bot, shared OG image generation, unified notification system.
**Decision:** 10 features implementation plan finalised. Priority: P1 (Sprint 1): Share Your Win, Credit Score Warning, Price Increase Alerts, Smart Bill Comparison. P2 (Sprint 2): One-Click Switching, Receipt Scanner, Savings Challenges, Annual Financial Report. P3 (Sprint 3): WhatsApp Bot, Household Mode. Total: 41-56 dev days over 14 weeks. Architecture: Claude Vision for receipts, existing deals/energy_tariffs for bill comparison, WhatsApp Cloud API for bot, shared OG image generation, unified notification system.
**Reason:** Features ranked by impact-to-effort ratio. Quick wins (#8 Share Your Win, #10 Credit Score Warning) ship in days and drive virality + trust. Price Increase Alerts (#5) is a unique differentiator no UK competitor offers. Smart Bill Comparison (#1) is the core value prop. P3 features (WhatsApp, Household) deferred due to external API approvals and complex data models. All features designed to integrate with existing chatbot, loyalty points, and merchant normalisation systems.
**Made by:** Cowork (Claude Desktop) — designed with founder approval
