# Hacker News — Show HN Draft

**When:** Either same day as Product Hunt (double-pop) OR 2 weeks after PH to avoid cannibalisation. Paul's call. Recommendation: 2 weeks later, because HN punishes "launchiness" — looking coordinated across PH + HN reduces HN's ranking favour.

**Why HN matters for Paybacker:** a well-received Show HN drives 10-40k visitors, gets the product seen by hundreds of UK technical founders, and is one of the few places where "AI tool that does X legal thing" is treated with respect rather than cynicism. Poor HN launches are silent. There's no such thing as "went badly" — it either works or it goes unseen.

## Principles

- **Lead with the technical architecture**, not the consumer-product pitch. HN respects how things are built; they're bored by marketing copy.
- **Be explicit about what the AI does and doesn't do.** HN will grill the implementation. Pre-empt it.
- **Be specific about hallucination handling.** The single biggest criticism will be "how do you stop the AI inventing UK law." Answer it in the submission text.
- **Be honest about the edges.** "Here's where it's still weak" gets upvoted. "It's perfect" gets downvoted.

## Submission title

Test 3 options with 2-3 trusted HN users before posting. Current best guess:

**Show HN: Paybacker – an AI that drafts formal UK consumer-rights complaints**

## Submission URL

`paybacker.co.uk` (not the PH landing page, not a deep link — the homepage).

## Submission text

*HN's text box is the top comment. Write it as a technical explainer with enough consumer-rights context to help non-UK readers understand why it matters.*

---

Hi HN.

Paybacker is an AI tool I've been building that drafts formal UK consumer complaint letters. You type in what happened — a parking fine, a mid-contract broadband hike, a mis-billed energy account — and it drafts a several-page letter citing the exact UK legislation (Consumer Rights Act 2015, Ofgem's billing codes, UK261 for flight delays, POFA 2012 for parking, etc.) in about 30 seconds.

The reason it exists: UK consumer law is actually unusually strong, but using it requires the time, legal knowledge, or money that most working people don't have. Companies know this, so the small-pound disputes (£30-£200) go unfought, which is where a meaningful fraction of household spend leaks.

Architecture, briefly:

**Corpus.** I assembled a RAG index of UK consumer legislation + regulator codes (Ofgem Standard Licence Conditions, Ofcom General Conditions, CAA flight delay guidance) plus CJEU and UK case law where relevant. Indexed with embeddings, chunked per section/paragraph with citation metadata preserved. About 1.1M tokens of source material, ~18k chunks.

**Retrieval.** User describes the problem in plain English. A router classifies it into one of ~30 claim types (parking, broadband mid-contract, energy back-billing, UK261, deposit protection, etc.). Retrieval runs against the claim-type-specific corpus only — not the full law shelf — because cross-corpus retrieval kept dragging irrelevant legislation into letters. Hybrid search (semantic + lexical) with legislation-section boosting.

**Generation.** Claude 3.5 Sonnet as the drafting model. The prompt forces a specific letter structure (reference → facts → legal basis with citation → specific request → deadline → escalation path) and requires every cited clause to appear verbatim in the retrieved context. Unsupported citations fail a post-generation check and the letter regenerates with a smaller claim.

**Hallucination handling.** The post-gen check: every legislation citation in the output has to match a substring in the retrieved context. If it doesn't, the letter is regenerated. If it fails twice, we return a simpler letter with general consumer-rights language and no specific section number. About 2.3% of letters fall through to the simple fallback right now, which is the number I'm most actively trying to reduce.

**Open Banking + email scanning.** Yapily for bank connection (FCA-authorised), Google OAuth (verified) and Microsoft Graph for email. Both run server-side only, scan for recurring charges + overcharge patterns, surface them to the user as "opportunities" — each one a candidate for a complaint letter.

**Stack.** Next.js 15, Supabase (Postgres + Auth + RLS), Vercel Pro, Claude API, Resend, Stripe.

**What it doesn't do:**
- It's not a solicitor, doesn't give legal advice, doesn't represent anyone. It drafts letters; users decide what to send.
- It doesn't cover Scotland / NI differences well yet. English/Welsh law is the primary corpus. Scottish small-claims (< £5k) and NI consumer protections have different frameworks — work in progress.
- It doesn't handle commercial (B2B) disputes. Only UK-resident consumer law.

**What it's free:** 3 letters/month forever, no card. Paid is £4.99/mo for unlimited.

Happy to answer anything — particularly the "how do you stop it inventing law" question in more detail, or the corpus-assembly process, or why I didn't use a pre-built legal AI (TL;DR: none are UK-consumer-focused and they're all enterprise-priced).

— Paul

---

## Comment-reply preparation

Pre-draft answers to the top 6 questions you'll get. When the Show HN goes live, answer every comment within 20 minutes for the first 4 hours.

**Q: How do you handle hallucinations / making up case law?**
"Post-generation check: every cited clause has to match the retrieved context verbatim. If it doesn't, regenerate with a simpler claim. If that fails too, fall back to a generic consumer-rights letter with no section numbers. ~2.3% of letters hit the fallback now. The adversarial pattern I'm most worried about is legislation that exists but that the model misapplies — retrieval usually catches that, but I'm building a second check using a smaller separate model to verify the legal argument makes sense before letter is returned."

**Q: What stops this from being used for scam claims / harassment?**
"Four things. Rate-limiting (free tier is 3/month, hard-coded). The input classifier filters out claims that don't map to a real UK consumer-law framework — you can't ask it to draft a harassment letter to your neighbour. Every draft includes a disclaimer that it's AI-generated and the user's responsibility to send. And we log every letter with the user identity (Supabase RLS) so systemic abuse is traceable. It's not perfect but it's not DoNotPay either."

**Q: Why isn't this just a wrapper around ChatGPT / Claude?**
"It partly is. The moat isn't the base model — it's the UK-specific legal corpus, the claim-type router, the hallucination post-check, and the data we've built from real dispute outcomes. Also: the UX matters enormously for an audience that isn't technical. ChatGPT is a blank box. Paybacker is a tool that asks you three questions and produces a PDF you can send."

**Q: Is this FCA-regulated? Legal?**
"FCA-authorised for the Open Banking connection (via Yapily, which holds the AISP authorisation we pay into). ICO registered for data processing. We're not a law firm and don't give legal advice — we draft template letters based on publicly-available UK legislation. That's explicitly not regulated activity under the Legal Services Act 2007."

**Q: What's the accuracy vs a solicitor?**
"A good consumer-rights solicitor beats it on complex disputes (contested contract law, regulated activities, anything going to tribunal). Paybacker beats the solicitor on simple disputes that are not economically viable at £200-400/hour. So it's not replacement, it's access. The market is the disputes that currently get paid not because they're owed but because the consumer has no viable way to fight them."

**Q: Revenue model / sustainability?**
"Freemium + subscription. Free is 3 letters/month forever (a meaningful throttle). Paid is £4.99-9.99/month. No success-fee model on the legal side because we don't want to be incentive-aligned with outcomes (too easy to push toward letters that maximise our fee vs the user's actual interest). Eventually: affiliate revenue from utility switching once the subscription-audit feature is proven."

## Do NOT do

- Don't link to the PH page — HN hates the stacking.
- Don't mass-notify HN friends to upvote — HN's filter is aggressive on this.
- Don't edit the post after submission to add something — regenerates the "new" flag, is detected, ranking penalty.
- Don't respond defensively. Assume every question is good faith, even the snarky ones.

## If it hits front page

Paul should clear 4 hours of calendar. Comments keep coming for 12-18 hours. Every reply matters for ranking.
