# Master PR Pitch — Cold Email to UK Consumer Journalists

The default pitch sent to UK consumer, money, and tech journalists who don't know Paul. For Katie Morley use the warm reconnection email (`katie-morley-email-v2.md`) instead.

## Principles

- **One sentence, one hook, one ask.** Journalists read the subject and the first 15 words. Everything after has to earn its place.
- **The story is the injustice, not the product.** Lead with what's broken in the UK consumer market; Paybacker is the tool, not the subject.
- **Data + anecdote.** One number (£3bn, £1,000 a household, 87% of private parking appeals succeed if formally challenged), one real user story.
- **Regulatory credibility up front.** FCA-authorised via Yapily, ICO registered. Takes you out of the "another chancer" pile.
- **Offer, don't beg.** Three concrete editorial offers. Never "let's jump on a call."
- **Never pitch the whole product.** One angle per email. Different journalists get different angles.

## The email

**Subject (choose one):**
- UK households losing £1,000+/year to tricks that are technically illegal
- Story idea: the 87% private parking fine success rate that nobody tells you about
- AI is now writing formal legal complaints — and they're working
- Why the Consumer Rights Act 2015 is quietly the best-kept secret in the UK

---

Hi [FIRST NAME],

Quick pitch — one paragraph, feel free to ignore.

[HOOK — one specific, dated, number-led sentence tied to their recent coverage. E.g. "Your piece on Ovo's back-billing last week is exactly why I'm writing." or "The Which? data last month showing £485 average broadband mid-contract hikes has been sitting on my desk."]

I've just launched Paybacker (paybacker.co.uk) — a UK-registered, FCA-authorised tool (Yapily Open Banking, ICO registered) that drafts formal complaint letters citing the exact UK legislation in about 30 seconds. The reason it exists: [ONE-LINE FOUNDER STORY — e.g. "I'd been ripped off three times in a year and realised nobody can afford a solicitor for a £40 dispute, so companies do it on purpose."].

Three things I could offer if any of it fits an editorial angle:

1. **Unlimited press access** — test it live on reader scenarios, write about what happens (good, bad, or ugly).
2. **Case-study pipeline** — [N] beta users recovered a total of £[X] in the last [Y] weeks, all happy to be put in direct contact.
3. **Founder backgrounder** — I spent a decade building legal systems for firms like Freshfields and Norton Rose. Happy to go on-record about what the AI can and can't do, and where it's weak. I'd rather you were honest than flattering.

No pressure either way.

Best,
Paul Airey
Founder, Paybacker
paybacker.co.uk
[mobile]

---

## Variations by journalist type

| Type | Change |
|---|---|
| Consumer champion (Morley, Lewis, Cliff) | Lead with the injustice-at-scale number; offer case studies first |
| Money/finance (Guardian Money, FT Money) | Lead with the legislation angle and the founder-backgrounder offer |
| Tech (Wired UK, TechCrunch UK, Sifted) | Lead with the AI-as-access-to-justice angle, offer an architecture deep-dive |
| Lifestyle/women's (Grazia, Stylist, Red) | Lead with "the annoying admin that costs women £X more than men" framing if supported by data |
| Local/regional (Evening Standard, BBC Radio) | Offer local case studies by region |

## Journalist list (cold batch 1)

Build from a research sprint before sending:

- Martin Lewis — MoneySavingExpert (separate dedicated template)
- Miles Brignall — Guardian Money
- Katie Morley — Telegraph (WARM — use v2 template)
- Harry Brennan — Telegraph Money
- Sam Meadows — Telegraph
- Emma Ann Hughes — What Investment / Which?
- Gareth Shaw — Which?
- Anna Tims — Guardian Your Problems
- Iona Bain — BBC Your Money and Your Life
- Felicity Hannah — BBC Wake Up to Money
- Sarah Coles — Yahoo Finance UK
- Simon Read — Freelance, ex-Independent

Verify each address via Hunter.io before sending. Personalise the hook to their most recent relevant column — no scatter-gun.

## Send cadence

- **Day 1 launch:** Katie Morley (warm email only) + 5 cold pitches to tier-1 consumer journalists.
- **Day 3:** Next 5, different angles, referencing any early coverage.
- **Day 7:** Remaining 10 plus any HARO / Qwoted responses.
- **Day 14:** Follow up once (and only once) on any unanswered tier-1.
- **Never** more than two emails to the same person unless they reply.

## Tracking

Log every send in `press_outreach` table (columns: journalist_name, publication, angle_used, sent_at, replied, coverage_url). Build by adding a migration before launch day.
