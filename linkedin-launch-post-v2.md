# LinkedIn launch post v2 — broadband £505 founder-recovery story

**Status:** Approved 28 Apr 2026, deferred to ~29 Apr 2026 pending Yapily integration go-live.

**Why deferred:** Paul wants paybacker.co.uk's bank-connect flow fully working before driving traffic from a public LinkedIn post. The post directs readers to paybacker.co.uk and a broken bank-connect on landing would tank conversion + first-impression quality.

**Posting steps tomorrow:**
1. Open https://www.linkedin.com/feed/ in Chrome (signed in as Paul Airey).
2. Click "Start a post".
3. Paste the body below verbatim.
4. Hit Post.
5. Copy the post URL (⋯ → Copy link to post).
6. Tell Cowork the URL — Cowork will then:
   - Pin the post as Featured pin #3 on the personal profile
   - Update row 2 of the Paybacker LinkedIn Tracker Sheet (https://docs.google.com/spreadsheets/d/1_eUbuspUzqYAQ3pU6mcWPMKdQO4ePStq0yWZXu11lKA/edit) — Date / Day / Post URL / Topic / 0 metrics / followers baseline / Notes
   - Begin the 4-hour comment-reply watch (first 30 days post-launch)

## Post body (paste verbatim)

```
I built Paybacker because I was tired of UK companies offering pennies for problems the law says they owe pounds for.

This week, my own broadband provider gave me proof.

35 days without internet at one flat. 17 days at another. The provider's goodwill offer to me, in writing:

  £106.96.

What UK law actually entitles me to:

  £505.46.

Here's the breakdown — every figure cites a specific UK regulation Paybacker pulled from a daily-refreshed statute index:

→ £312.17 — Ofcom Voluntary Automatic Compensation Scheme on the 35-day outage. £10.07 per calendar day from day three (GC C3.13). Most major UK ISPs are in the scheme. This is the rule the provider chose to ignore in the offer.

→ £130.91 — Same scheme on the 17-day outage. £10.07 × 13 chargeable days.

→ £62.38 — £31.19 per missed engineer appointment, twice.

→ Plus journey costs, plus tenant losses, plus a refund of unused monthly charges. All separate from the per-day compensation, all legally required.

The £400 gap between £107 and £505 is what Paybacker exists to find. For a Pro member paying £94.99 a year, this single dispute returns roughly 4× the cost of the subscription.

What that £400 buys you:
• A long weekend in Lisbon
• A whole year of average UK broadband
• 200 flat whites (if you're lucky)
• A year of Pure Gym
• 40 cinema tickets

We're a young UK company. We don't have a million users yet. But we have a daily-updated index of UK consumer law, an engine that drafts letters citing exact statutes in 30 seconds, and every letter cites a specific UK statute traceable to our daily-refreshed index — so you can see exactly where every figure comes from.

If you've been offered "goodwill" recently and quietly wondered if that's all you're owed, you're probably owed more.

paybacker.co.uk — free to try.

#ConsumerRights #UKLaw #FightingForFairness
```

## Edits applied to original

- £99.99/year → £94.99/year (CLAUDE.md confirms £94.99/yr Pro annual)
- "deterministic guarantee that the right citations land in every letter — every time" → "every letter cites a specific UK statute traceable to our daily-refreshed index — so you can see exactly where every figure comes from" (avoids the FTC-style over-claim language post-DoNotPay $193k fine)
- "(If you're lucky..)" → "(if you're lucky)" (typo fix)
- "you probably aren't" → "you're probably owed more" (grammar fix)

## Pre-post checklist (before pasting)

- [ ] Yapily bank-connect verified live on paybacker.co.uk
- [ ] /for-business landing renders cleanly (no DB error like 28 Apr)
- [ ] Statute index responds correctly (smoke test /api/complaints/generate)
- [ ] No procurement-grade outreach commitments yet — this is a soft consumer post, fits the "open conversation" rule
- [ ] No mention of Aveni/Voyc by name — competitor framing stays in DM context only
