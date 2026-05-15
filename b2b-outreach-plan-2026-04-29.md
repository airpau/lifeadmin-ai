# Paybacker B2B Outreach Plan — May 2026
**Decision gate:** 28 May 2026 — 10 qualified UK fintech signups (paid pilot or live integration started).
**Plan window:** 30 days, 4 weeks.
**Authored:** 29 April 2026.
**Tone:** soft, "open conversation" until procurement-blockers ship (~12 May). Then procurement-grade.

---

## Why this plan looks the way it does

Three unusual things shape the playbook:

1. **You have a warm network the average bootstrapped fintech founder doesn't.** ~10 years in UK legal IT — law firms, in-house legal teams, banks (Barclays Wealth). KCL CS First. QMUL Law (incomplete). Every cold list below has a "warm path" annotation pointing back at this network.
2. **Live regulatory tailwinds are extreme right now.** Two intersecting events: (a) FCA's Consumer Duty AI guidance lands end-2026 — every regulated firm is scrambling for "RAG-grounded generation or mandatory human-in-the-loop review" cover; (b) the £7.5BN motor finance redress scheme (PS26/3, March 2026) is creating mass-claim pressure across lenders, CMCs, and law firms simultaneously. Paybacker's positioning could not have landed at a better month.
3. **The API has a fixable but currently-blocking 30-second timeout** (see `b2b-api-audit-2026-04-29.md`). This means Week 1-2 outreach must be conversational and demo-soft; procurement-grade pitches only after the streaming fix lands.

---

## The 7 use cases mapped to real UK firms

For each use case: 8-12 named UK targets. Warm = obvious connection to your legal-IT/Barclays/law-firm history. Cold = research-only.

### Use case 1 — FCA Consumer Duty pre-flight on AI-drafted replies (Compliance Officers)

This is the single highest-value pitch right now. Every FCA-regulated firm is being told they need RAG-grounded LLM safeguards before end-2026. Aveni and Voyc grade calls AFTER they happen; Paybacker grounds the reply BEFORE it sends. The `preflight` endpoint is the demo.

| Firm | Why-fit | Buyer title | Warm/cold | Recent signal |
|---|---|---|---|---|
| **Aviva** | Amanda Blanc publicly committed (5 Mar 2026 results) to AI virtual agent handling 90% of simple claims by summer 2026 — pre-flight grounding is exactly the Consumer Duty cover they'll need. | Head of Conduct Risk; Chief Compliance Officer; SMF24 (Chief Operations) | **Cold** | [Aviva AI virtual agent announcement, Insurance Times](https://www.insurancetimes.co.uk/news/aviva-to-introduce-virtual-agent-that-can-handle-claims-phone-calls/1457955.article) |
| **Direct Line Group** | Top-5 most-complained-about UK general insurer 2H 2024 — visible Consumer Duty pressure. | Head of Customer Operations; Chief Risk Officer | Cold | [Most complained about general insurers, Insurance Post](https://www.postonline.co.uk/personal/7957684/most-complained-about-general-insurers-revealed) |
| **Admiral Group** | Same complaints list — Top-5. Engineering-led culture, fastest UK adopter of contact-centre AI. | Head of Customer Operations; AI / Digital Transformation Lead | Cold | Same source |
| **AXA UK** | Same complaints list. EU parent's Group AI policy creates UK-specific Consumer Duty gap. | Head of Compliance UK; Conduct Risk | Cold | Same source |
| **Lloyds Banking Group** | Largest motor finance lender in the redress scheme (Black Horse). MBNA = credit card s.75 disputes at scale. | Head of Customer Complaints; SMF4 Chief Risk; Group Conduct | Cold but: legal-IT vendor relationships into Lloyds are common. **Probable warm path via your network.** | [PS26/3 Motor finance redress, FCA](https://www.fca.org.uk/publications/policy-statements/ps26-3-motor-finance-consumer-redress-scheme) |
| **Barclays UK** | s.75 chargeback volume + your direct Barclays Wealth history. | Head of Conduct UK Personal Banking; Wealth Conduct lead | **WARM** — this is your former employer ecosystem. Highest-priority intro. | FCA Consumer Duty pressure across all UK retail banks |
| **NatWest Group / RBS** | s.75 + SME conduct exposure post-Project Shield. | Head of Customer Complaints | Cold | Routine FCA scrutiny |
| **Santander UK** | Motor finance lender (Santander Consumer Finance) — directly inside the £7.5BN scheme. | UK Conduct Risk Lead; Motor Finance Compliance Director | Cold but: PRA Group relationship via legal-IT possible | [FCA confirms motor finance redress](https://www.fca.org.uk/news/statements/fca-confirms-motor-finance-redress-scheme) |
| **Close Brothers** | Motor finance lender — small enough that a single Compliance Officer can champion. | Head of Compliance Motor Finance; CRO | Cold | Inside the redress scheme |
| **Volkswagen Financial Services UK** | Motor finance — same redress exposure. | UK Compliance Director | Cold | Same |
| **Monzo / Starling** | Challenger banks with public AI roadmaps + DEEP Consumer Duty paranoia after FCA scrutiny on financial-promotions. | Head of Compliance; Head of Customer Operations | Cold but reachable — both have public, founder-friendly cultures | UK fintech AI compliance pressure |
| **OakNorth** | Lender, smaller team, technically-led — easier to pilot. | Head of Customer Operations | Cold | Same |

### Use case 2 — Real-time dispute scoring inside fintech / insurer / travel CX (Head of CX / Disputes)

Different buyer, same firms partly. The pitch here is "score the dispute in your CRM the moment it lands — does it have legal merit, what's the entitlement range, what's the time pressure?"

| Firm | Why-fit | Buyer title | Warm/cold |
|---|---|---|---|
| **Revolut** | Highest dispute volume per customer in UK fintech; well-resourced ops org. | Head of Customer Operations; Disputes Lead | Cold |
| **Wise** | Cross-border payment disputes, EU + UK exposure. | Head of Operations; Chargeback Lead | Cold |
| **Klarna UK** | BNPL — s.75 exposure on Pay-in-3 and Financing variants. | UK Compliance Lead; Customer Operations | Cold |
| **Allianz UK / Allianz Partners** | Travel insurance + UK261 cross-pitch. | Head of Disputes; UK Operations | Cold |
| **Loveholidays / On the Beach** | Package Travel Regs 2018 exposure + Section 75 cross-merchant disputes. | Head of Customer Care; UK Compliance | Cold |
| **Booking.com UK** | High dispute volume, EU-led but UK-specific Package Travel exposure. | UK Customer Care Lead | Cold |
| **Expedia Group UK** | Same. | UK Customer Care; Disputes | Cold |
| **Trainline** | Delay Repay routing across 20+ TOCs — single integration would cover the lot. | Head of Customer Operations; Product VP | Cold but: Trainline is famously API-friendly |

### Use case 3 — Voice / IVR grounding (Head of Voice / Conversational AI)

Aviva is the obvious anchor here. Add the contact-centre platform vendors who could OEM the API.

| Firm | Why-fit | Buyer title | Warm/cold |
|---|---|---|---|
| **Aviva** | Already covered above — virtual claims agent rolling out summer 2026. Grounding the IVR's spoken statements is the offer. | Head of Voice / Conversational AI; CTO Claims | Cold |
| **Sky / Sky UK** | High-volume contact centre, broadband-disputes lane is bread-and-butter. | Head of Customer Voice; Director of Customer Operations | Cold |
| **BT Group** | Same — Ofcom General Conditions C4.2 (mid-contract price rises) is a daily IVR conversation. | Head of Voice Tech; Customer Ops Director | Cold |
| **Virgin Media O2** | Same broadband + mobile crossover. | Head of Customer Tech | Cold |
| **British Gas (Centrica)** | Energy back-billing IVR — Ofgem SLC 21B grounding is the demo. | Head of Customer Voice; Director Customer Operations | Cold |
| **Octopus Energy** | Most public AI-positive energy retailer; UK CTO is publicly active on LinkedIn. | CTO; VP Customer Operations | Cold but: founder-friendly, public-facing leadership |
| **Genesys (UK)** | Contact-centre platform — could OEM the API for any Genesys customer. | UK Strategic Partnerships; Compliance Solutions Lead | Cold |
| **NICE (UK)** | Same — adjacent to Aveni / Voyc themselves. | UK Partnerships; Compliance Product | Cold |

### Use case 4 — Pre-litigation triage (Ops at CMCs and litigation funders)

The motor finance redress scheme is the live pressure. CMCs need to handle claims correctly — the FCA/SRA/ASA/ICO joint taskforce has already removed 800+ misleading adverts. CMCs that handle correctly get to keep operating.

| Firm | Why-fit | Buyer title | Warm/cold |
|---|---|---|---|
| **Bott & Co** | UK-leading flight delay + Section 75 firm. Letters at volume = engine fits perfectly. | Head of Operations; Managing Director | Cold but: visible legal-tech-friendly stance |
| **AirHelp UK** | EU/UK261 at scale. Voice='consumer_to_merchant' is built for them. | UK Country Manager; Head of Operations | Cold |
| **MyJar / Sentinel Legal** | Motor finance commission claims at volume. | Operations Director; Compliance Director | Cold |
| **Slater & Gordon UK** | Mass redress group actions — mortgage-mis-selling, pension. | Group Operations Director | Cold but: legal-IT vendor relationships likely. **Probable warm path.** |
| **Pogust Goodhead** | Group litigation specialists (Mariana / Brazil). UK consumer-credit angle still relevant. | Head of UK Operations | Cold |
| **Therium Capital / Bench Walk** | Litigation funders evaluating consumer-rights cases at volume. | UK Investment Manager | Cold |
| **Burford Capital UK** | Same — UK consumer-rights case selection. | UK Investment Manager | Cold |
| **StepChange Debt Charity** | Charity, but processes hundreds of thousands of cases — would adopt for free, become reference customer. | Head of Operations; Head of Digital | Cold |

### Use case 5 — White-label dispute portals (Head of Digital at credit unions / building societies)

Smaller buyers, smaller deals, but easier procurement and faster reference customers.

| Firm | Why-fit | Buyer title | Warm/cold |
|---|---|---|---|
| **Nationwide Building Society** | UK's largest mutual — pioneers digital member experience. Public commitment to "Branch Promise" + Consumer Duty. | Head of Digital Member Experience; Head of Conduct | Cold but: Nationwide regularly engages legal-IT vendors |
| **Yorkshire Building Society** | Mid-tier mutual, modernising stack. | Head of Digital | Cold |
| **Coventry Building Society** | Same. | Head of Digital | Cold |
| **Skipton Building Society** | Same. | Head of Digital | Cold |
| **Leeds Building Society** | Same. | Head of Digital | Cold |
| **Beehive Money / Newcastle BS** | Smaller, AI-curious. | Head of Digital | Cold |
| **Police Credit Union UK** | Largest UK credit union. | CEO / Head of Operations | Cold |
| **Voyager Alliance Credit Union** | Tier-2 UK CU. | CEO | Cold |
| **Fairshare Credit Union** | London-based, small but tech-curious. | CEO | Cold |
| **Association of British Credit Unions (ABCUL)** | Trade body — one win = referrals across membership. | Head of Member Services / Innovation Lead | Cold |
| **Building Societies Association (BSA)** | Trade body — same dynamic. | Head of Innovation / Policy | Cold but: BSA hosts annual conf — speaking slot route. |

### Use case 6 — CCA s.77 / s.78 lawful response workflows (Heads of Customer Service at debt purchasers)

Active live pain. Joanna Connolly Solicitors notable cases include `Intrum UK Limited v Freeman` where a CCA s.77/A77A/s.87 unenforceability claim killed enforcement. Every UK debt purchaser has the same exposure — incoming s.77/s.78 requests need a compliant response inside 12 working days.

| Firm | Why-fit | Buyer title | Warm/cold |
|---|---|---|---|
| **Lowell Group** | Largest UK debt purchaser. CONC 7.3 + CCA s.77-79 daily reality. | Head of Customer Service; Head of Compliance UK | Cold |
| **Cabot Credit Management** | Second-largest. Same exposure. | Head of Customer Service; Compliance Director | Cold |
| **Intrum UK** | Lost an FCA appeal in 2022 over authorisation — extra Consumer Duty scrutiny. | Head of Operations; Compliance Director | Cold |
| **PRA Group UK** | Mid-tier — same workflow, smaller buyer's committee. | Head of Customer Operations | Cold |
| **Arrow Global** | Manchester-based, listed. | Head of UK Operations | Cold |
| **Capquest** (Arrow) | Brand-level operations. | Head of Customer Service | Cold |
| **TDX Group** (Equifax) | Mass-volume processor. | Head of Operations | Cold |
| **Hoist Finance UK** | Smaller but adjacent. | UK Country Head | Cold |

### Use case 7 — Internal training generation (support / claims / ops leads)

Lower-priority — buyers and budgets are typically "L&D" not "Compliance" and the deal sizes are smaller. Treat this as opportunistic upsell within accounts already won under use cases 1-6, not as primary lead-gen.

---

## The other priority lane — UK law firms doing consumer credit / disputes / mass-claim work

This wasn't in the original 7 use cases but it's a perfect Paybacker fit and your network reaches it directly. The pitch is "draft 100 cited s.75 / motor-finance-commission letters in the morning, not 5".

**Top 12 to approach by name:**

1. **Slater & Gordon UK** — group-action specialists (mortgage, pension, motor finance).
2. **Bott & Co** — flight delay + s.75 specialist.
3. **Joanna Connolly Solicitors** — CCA unenforceability — has actual published case wins on s.77 / s.78 / s.87.
4. **Hodge Jones & Allen** — group actions.
5. **Leigh Day** — class actions.
6. **Pogust Goodhead** — group litigation.
7. **Stewarts Law** — high-value commercial disputes; mass-claim arm.
8. **DAC Beachcroft** — insurer-side; could OEM for clients.
9. **Kennedys** — insurer-side; published explicitly on FCA AI considerations.
10. **CMS UK** — financial services regulatory; AI advisory practice.
11. **Linklaters / Clifford Chance / Allen & Overy** — financial services regulatory practices (low-conversion but high-credibility logos if won).
12. **TLT LLP** — financial services litigation.

**Warm path: every single one of these firms has a legal-IT/document-management vendor relationship.** That's your network. Lead with iManage / NetDocuments / HighQ / Kira / Litera context.

---

## UK legal-tech vendors that could OEM the API

Different motion — partnership not direct sale. Each one has a customer base of regulated firms or law firms who'd benefit, and integrating the API is faster than building it.

1. **iManage** — document management at most UK law firms; "iManage Insight" is the AI brand.
2. **NetDocuments** — same market, same fit.
3. **Litera** — legal drafting AI; perfect tech fit.
4. **HighQ** (Thomson Reuters) — legal workflow + client portals.
5. **Kira Systems** (now Litera) — contract analysis; could fold disputes in.
6. **Clio UK** — practice management for smaller firms.
7. **Lupl** — collaboration; CMS-backed.
8. **DraftWise** — newer drafting AI.
9. **Robin AI** — UK-based contract AI; warmer tech fit.
10. **Lexis+ AI / Westlaw Edge UK** — incumbent legal research; integration-as-feature.

**Warm path: most of these were your customers, vendors, or peers in the legal IT decade.** Lead every DM with that.

---

# 4-Week outreach calendar

**Cadence rule:** every weekday, exactly **5 high-quality touches** — quality over volume. Mix warm-introduction asks with cold-research opens. Pause Saturdays. Sundays = the existing 17:00 UTC LinkedIn cron drafts a post for Monday.

**Channel mix per week:**
- Mon-Wed: LinkedIn DMs (3-4) + 1 email
- Thu: 2 LinkedIn DMs + 3 emails
- Fri: 1 follow-up cycle + 4 new opens
- Block 4-6pm UK each weekday for replies (the 4-hour comment-reply rule applies to inbound).

---

## Week 1 (Mon 4 May – Fri 8 May): warm network only

The API timeout isn't fixed yet. **Don't pitch procurement.** Just open conversations.

**Daily target: 3 LinkedIn DMs to your 1st/2nd-degree connections + 2 emails to former colleagues.**

**Source the contact list:**
- LinkedIn search: filters → 1st-degree, locations = UK, industries = Banks, Insurance, Legal Services. Save the list.
- Same search but 2nd-degree, sorted by mutual connections.
- Pull from your address book / iManage past-customer records: Barclays Wealth, KCL alumni, QMUL law alumni who went into legal-IT.

**Pre-launch calendar (Mon 4 May = LinkedIn launch post day per Task 23). Outreach starts Tuesday 5 May once the post is live.**

| Day | What | Sample DM template |
|---|---|---|
| **Tue 5 May** | 5 warm-network opens — old Barclays Wealth contacts now in compliance / conduct roles at any UK FCA-regulated firm. | "Hi {name}, saw your move to {firm} a few years back — congrats. I left the legal IT world a couple of years ago to build Paybacker (paybacker.co.uk/for-business — UK consumer law as an API for FCA-regulated firms). Given the FCA's late-2026 AI guidance lands hard on RAG-grounded LLM cover for customer comms, would you be up for a 15-min chat next week to compare notes? No pitch — just want to understand how {firm}'s thinking about it." |
| **Wed 6 May** | 5 warm — KCL CS alumni now in compliance/CX product roles; QMUL Law alumni in fintech compliance. | Same template, with "we overlapped at KCL" / "we both came through QMUL Law" as the open. |
| **Thu 7 May** | 5 warm — former iManage/NetDocuments/HighQ peers now at UK law firms doing consumer credit work. | Lead with your shared legal-IT history. "Curious whether the firms you're at are seeing volume on motor finance commission claims — we built something that might be relevant if so." |
| **Fri 8 May** | 5 warm-introduction asks: DM 5 of your 1st-degree at any UK fintech / insurer / debt purchaser, asking for an introduction to the relevant Compliance Officer or Head of CX. | "Hi {name}, hope you're well. Quick ask — if it's not awkward, would you be open to introducing me to {target person} at {firm}? I'm running an open conversation cycle this month with UK Compliance leads about how the FCA's 2026 AI guidance is going to land in practice. Happy to send you a short brief in advance so you can vet it." |

**Goal Week 1: 25 first DMs sent, 5-10 replies, 3-5 calls booked for Week 2.**

---

## Week 2 (Mon 11 May – Fri 15 May): broaden cold + start email campaign

API streaming fix should land mid-week (per audit). Start adding cold prospects to the LinkedIn cycle, and launch the first email campaign.

**Daily target: 3 LinkedIn DMs (mix warm + cold) + 5 emails (cold).**

| Day | What |
|---|---|
| **Mon 11 May** | LinkedIn launch post comments still being replied to (4-hour rule, first 30 days). 3 DMs + 5 emails. Focus emails on **debt purchasers** — Lowell, Cabot, Intrum, PRA, Arrow, Capquest, TDX, Hoist. Email Use Case 6 pitch (CCA s.77/78 workflow). |
| **Tue 12 May** | Same volume. Emails to **motor finance lenders** — Lloyds Black Horse, Santander Consumer Finance, Close Brothers, VW Financial Services UK, FirstRand, MotoNovo. Use Case 1 pitch (Consumer Duty pre-flight). |
| **Wed 13 May** | LinkedIn DMs to **Aviva, Direct Line, Admiral, AXA UK** Compliance leads. Lead with their public 2H 2024 complaint position + Consumer Duty 2026 guidance imminent. |
| **Thu 14 May** | Emails to **CMCs and litigation funders** — Bott, AirHelp UK, Slater & Gordon, Pogust Goodhead, Therium, Burford. Use Case 4 pitch + the `voice='consumer_to_merchant'` capability. |
| **Fri 15 May** | First-week follow-ups to non-replies from Week 1. One nudge only. |

**Goal Week 2: 40 new touches, 5-10 calls booked. First paid pilot or LOI from a tier-2 fintech (Monzo, Starling, OakNorth, Klarna UK).**

---

## Week 3 (Mon 18 May – Fri 22 May): law firms + legal-tech vendors

**Daily target: 3 LinkedIn DMs + 5 emails.**

| Day | What |
|---|---|
| **Mon 18 May** | LinkedIn DMs to **legal-tech OEM partnership targets** — iManage, NetDocuments, Litera, HighQ, Robin AI, DraftWise. Pitch: "Letter-drafting AI fits in your stack — let's white-label." |
| **Tue 19 May** | Emails to **mass-claim law firms** — Slater & Gordon, Bott, Joanna Connolly, Hodge Jones & Allen, Leigh Day, Pogust Goodhead. |
| **Wed 20 May** | LinkedIn DMs to **building societies and credit unions** — Nationwide, Yorkshire BS, Coventry BS, Skipton BS, Police Credit Union, ABCUL, BSA. Use Case 5 pitch. |
| **Thu 21 May** | Emails to **insurer-side law firms** — Kennedys, DAC Beachcroft, Clyde & Co. Different angle: their clients (insurers) need this. |
| **Fri 22 May** | Reply cycle + warm-network nudges. |

**Goal Week 3: 40 new touches, 1 OEM partnership conversation booked, 1 mass-claim law firm pilot in progress.**

---

## Week 4 (Mon 25 May – Thu 28 May): closing push to decision gate

The 28 May decision gate is **Thursday this week**. The 10-qualified-signups bar is binary.

| Day | What |
|---|---|
| **Mon 25 May** | Spring Bank Holiday — quiet day. Use it to draft the May results post for next Sunday's cron. |
| **Tue 26 May** | Final-round nudges to every conversation booked but not closed. Frame as "tying up before our 28 May review point". |
| **Wed 27 May** | Demo day — try to run 3-4 live demos in a single block. The streaming fix needs to be 100% solid. |
| **Thu 28 May — Decision gate** | Tally qualified signups. ≥10 = green-light deeper B2B build. <10 = narrow per the kill criterion: drop broadband/energy, focus on fintechs + insurers + CMCs only. |

---

## DM and email templates

### LinkedIn DM — warm, ex-colleague
> Hi {name}, hope you're well. I left the legal IT world a couple of years ago to build Paybacker — UK consumer law as an API for FCA-regulated firms (paybacker.co.uk/for-business). Given the FCA's 2026 AI guidance lands hard on RAG-grounded grounding for customer-facing LLM use, I wondered if you'd be up for a 15-min open conversation in the next two weeks — no pitch, just want to understand how {firm}'s thinking about pre-flight for AI-drafted customer comms.

### LinkedIn DM — warm, KCL/QMUL alum
> Hi {name}, KCL Comp Sci First-Class alum here (briefly QMUL Law before that — couldn't decide). I'm running Paybacker now — UK consumer law engine, exposed as an API for FCA-regulated firms (paybacker.co.uk/for-business). Curious whether you've seen Aveni / Voyc come across the desk at {firm} — we sit on the upstream side of that conversation. Any chance of a 15-min next week?

### LinkedIn DM — cold, Compliance Officer
> Hi {name}, came across your work on Consumer Duty implementation at {firm}. We've built Paybacker — a UK statute citation API that grounds AI-drafted customer responses in real legislation.gov.uk references with a deterministic pre-flight check. Most Consumer Duty AI vendors grade calls AFTER they happen; we run BEFORE the reply leaves the stack. With FCA AI guidance landing late 2026, would 15 mins next week to compare notes be useful?

### Cold email — debt purchaser Head of Customer Service
> **Subject:** CCA s.77/78 response workflow — UK statute API
>
> Hi {name},
>
> {Firm} processes a meaningful volume of CCA s.77 / s.78 information requests every month. The response window is 12 working days, the consequences of getting it wrong are increasingly visible (Intrum v Freeman, Connolly cases), and most firms are still drafting these letters by hand or with templates that don't track FCA CONC 7.3 / Limitation Act 1980 case law.
>
> We've built Paybacker — a UK consumer law API that returns a cited s.77/78-compliant response with statute citation, customer entitlement summary, and draft letter, in 2-4 seconds. The same engine validates daily against a live consumer product, so you can't get a fabricated section number.
>
> Would a 20-min walkthrough next week be useful? Happy to start with a free 1,000-call pilot if so.
>
> Best,
> Paul Airey
> Founder, Paybacker
> paybacker.co.uk/for-business
> Ex-legal IT (10 yr at law firms / Barclays Wealth) · KCL CS First

### Cold email — motor finance lender / insurer Compliance Officer
> **Subject:** RAG-grounded Consumer Duty pre-flight — 1,000-call free pilot
>
> Hi {name},
>
> The FCA's 2026 AI guidance lands hard on one specific pattern: RAG-grounded generation OR mandatory human-in-the-loop for any LLM customer-facing communication. Aveni and Voyc grade calls AFTER they ship; Paybacker grounds replies BEFORE they leave the stack.
>
> Our `POST /v1/disputes` endpoint takes a CX agent's draft reply and returns:
> - the primary UK statute the customer's entitlement is grounded in (looked up from a daily-verified `legal_references` index, not LLM-synth)
> - missing citations the agent's draft fails to mention
> - a recommended addition to bring the draft up to compliant
>
> 2-4 second response. Idempotent. Free 1,000-call pilot, no card required.
>
> Worth a 20-min walkthrough?
>
> Paul Airey
> Founder, Paybacker
> paybacker.co.uk/for-business
> Ex-legal IT · KCL CS First-Class · ICO registered, UK GDPR compliant

### Cold email — mass-claim law firm Head of Operations
> **Subject:** Drafting motor finance / s.75 / UK261 letters at volume
>
> Hi {name},
>
> The £7.5BN motor finance redress scheme (PS26/3, March 2026) means {firm} is processing more claim letters per month than ever before. Same picture for s.75, UK261, and CCA s.77/78 work.
>
> Paybacker is a UK consumer law API that drafts a cited letter in 2-4 seconds — every letter grounded in a daily-verified `legal_references` index of UK statute and FCA Handbook citations. Real DB-backed grounding, not LLM hallucination.
>
> Particularly relevant for {firm}: (a) volume of motor finance commission letters, (b) s.75 mass claims where pre-screening triage adds up, (c) consumer's-name drafting is fully supported (`voice='consumer_to_merchant'`).
>
> Free 1,000-call pilot. Happy to do a 30-min walkthrough next week.
>
> Paul Airey, Founder
> paybacker.co.uk/for-business
> Ex-legal IT (iManage / NetDocuments / HighQ era) · KCL CS First

---

## Tracking

Use the existing **Paybacker LinkedIn Tracker Sheet** ([https://docs.google.com/spreadsheets/d/1_eUbuspUzqYAQ3pU6mcWPMKdQO4ePStq0yWZXu11lKA/edit](https://docs.google.com/spreadsheets/d/1_eUbuspUzqYAQ3pU6mcWPMKdQO4ePStq0yWZXu11lKA/edit)) for LinkedIn-side metrics. Add a second tab `B2B Outreach Log` with columns:

| Date | Channel | Firm | Buyer name | Buyer title | Use case | Warm/cold | Status | Reply received | Call booked | Pilot started | Notes |

Fill it daily. Friday review block: count replies, calls booked, pilots in progress. Anything below 25% reply rate on cold emails = templates need a rewrite.

---

## Procurement-grade gates — DO NOT push the following until shipped

1. **Streaming fix on `/v1/disputes`** — fixes the 30-second timeout. ETA mid-Week 2 (~12 May).
2. **OpenAPI spec + Postman collection + TypeScript SDK** — needed for any procurement-grade conversation.
3. **`/for-business/legal` page** — DPA, SCCs, UK-only data residency statement, ICO registration number.

Until those land, **all outreach copy must be soft** — "open conversation", "free 1,000-call pilot", "compare notes". The moment a buyer asks for an MSA, security questionnaire, or DPA, the answer is: "We're publishing those next week — happy to schedule the procurement conversation for {date}."

---

## What "qualified signup" means for the 28 May gate

From the existing memory: **paid pilot OR live integration started**. Specifically:
- Stripe checkout completed at the Growth £499/mo or Enterprise £4,999/mo tier, OR
- Free pilot key minted AND ≥1 successful `POST /v1/disputes` call from the customer's IP, OR
- Signed LOI / MSA in `business@paybacker.co.uk`.

Don't lower the bar. <10 by 28 May = narrow focus per the kill criterion (drop broadband/energy, retain fintechs + insurers + CMCs).
