# HARO / Qwoted / ResponseSource — Journalist Query Responses

**What this is:** Journalists post source requests on HARO (Help A Reporter Out), Qwoted, and ResponseSource. Responding well, fast, and specifically is the highest-ROI PR channel for early-stage UK startups. One good response = one named quote in a national paper.

**Target:** 3-5 responses per week. One placement per month is a success.

## Principles

- **Speed beats polish.** Most queries close in 24 hours. A 75%-polished reply in 2 hours beats a 100%-polished reply in 6.
- **Answer the actual question.** The #1 reason responses get ignored is the founder answering a different question to show off.
- **One tight quote + background.** Give the journalist a pull-quote they can drop in unchanged. Then supporting context if they want depth.
- **No attachments. No pitch decks.** The email body is everything.
- **Credentials in the signature, not the body.** FCA-authorised, ex-Freshfields/Norton Rose, Founder of Paybacker — goes under the name.

## Response template

**Subject:** Re: [EXACT QUERY SUBJECT LINE, unchanged]

---

Hi [FIRST NAME if available, else "the team"],

In response to your query on [TOPIC]:

> **PULL QUOTE (30-60 words, first person, Paul Airey speaking).** This is the bit the journalist can lift verbatim. Make it punchy, specific, and on-topic. Include one concrete number or citation.

Quick context if useful: [One paragraph, 40-80 words, adding depth. Another specific stat or case, naming a UK legislation or body if relevant.]

If you need a second angle: [One-line alternative angle they can follow up on. Optional but increases reply rate.]

Happy to be quoted as "Paul Airey, Founder of Paybacker (paybacker.co.uk), a UK-registered FCA-authorised AI tool helping consumers dispute unfair bills."

Best,
Paul Airey
Founder, Paybacker — paybacker.co.uk
FCA-authorised via Yapily · ICO registered
[mobile] · aireypaul@googlemail.com

---

## Angle library — pre-written pull quotes

These are the standard angles Paybacker is credible on. Keep them in a file; pull the relevant one when a matching query appears.

### Mid-contract broadband price rises

> "UK broadband providers have been raising prices mid-contract by CPI+3.9% every April and hoping customers don't read the small print. Since the Ofcom rule change in April 2025 requiring fixed-in-pounds notification, anyone still receiving a vague percentage-based hike letter has grounds to exit the contract free of charge. Most households are paying an extra £70-120 a year because nobody told them this."

### Private parking fines (POFA 2012)

> "About 87% of private parking charges that get formally appealed under POFA 2012 Schedule 4 are cancelled. About 100% of parking charges that get paid without appeal are pocketed by the operator. The gap between 'considered appealing' and 'actually writing the letter' is the entire profit model."

### UK261 flight delay compensation

> "UK261 entitles passengers to up to £520 per person for flights over 3 hours late, if the delay was within the airline's control. Airlines deny around 60% of first-time claims even when they're valid — largely because they can, and most claimants give up. A formal letter citing Articles 5 and 7 plus the Sturgeon ruling changes the odds completely."

### Subscription creep

> "The average UK household is paying for around £87 a month of subscriptions, of which roughly a quarter are forgotten. Not fraud — just admin friction. The subscription industry is worth £4.6bn to UK consumer brands, and a meaningful share of that is money people would have cancelled if they'd noticed."

### Energy back-billing

> "Under Ofgem's billing code, suppliers cannot back-bill a domestic customer for energy used more than 12 months ago. Despite this, we regularly see back-bills going 2-3 years deep. A formal response citing the 12-month rule and Standard Licence Condition 21BA is usually enough to get the bill written off. Most people don't know the rule exists."

### Council tax band challenges

> "The Valuation Office Agency upholds about half of challenges when the claimant provides three comparable-band neighbours as evidence. The 'three comparables' rule is the core of a successful challenge and it's not widely known. If your band is higher than a reasonable majority of your street, you probably have a case."

### Access to justice

> "UK consumer law is unusually protective — Consumer Rights Act 2015, Section 75 of the Consumer Credit Act, Ofgem and Ofcom codes — but using it has always required the time, money, or legal knowledge that most working people don't have. The point of building Paybacker is that AI can close that gap in a way solicitors can't."

## Where to monitor queries

| Platform | Free? | Region | Notes |
|---|---|---|---|
| **ResponseSource** | Paid (~£50/mo for basic) | UK | Highest UK journalist density; worth the fee from month 2 |
| **Qwoted** | Free tier + paid | Global, good US+UK | Daily digest email; filter to UK/finance/consumer |
| **HARO** (now Muck Rack Connect) | Free + paid | US-heavy but some UK | 3x daily email; 80% noise but the 20% is gold |
| **Featured.com** | Free basic | Global | Less competitive than HARO; expert-quote marketplace |
| **Twitter #journorequest** | Free | UK/global | Search the hashtag daily; fast-moving |

## Weekly cadence

- **Monday 8:30am:** Scan previous weekend + Monday morning queries across all platforms (15 min).
- **Daily 12:00 + 17:00:** Two 10-min checks for new queries.
- **Saturday:** Off (most journalists off too).

Log every response in `press_outreach` (query_source, query_text, response_sent_at, placed_yes_no, coverage_url). Review hit rate monthly — if a source is 0-for-20, drop it.

## Automation options

- **Claude cron (`cron-journalist-followup.md`):** Daily 9am pull from Qwoted + ResponseSource API (if available on plan), filter to consumer/money/tech queries, draft a response using the angle library + query text, queue in Paul's email for human send. Never auto-send — journalists smell templated responses instantly, and one bad response poisons the relationship.
- **Hunter.io lookup:** Auto-enrich any journalist email that comes back with their publication and beat, to build the press list.
