/**
 * /for-business/docs — public API manual for /v1/disputes.
 *
 * B2B engineering-buyer surface. Audience: UK fintech engineers, CX
 * leaders, claims-platform PMs. Voice: precise, evidence-led, no
 * consumer empathy. Examples are full business workflows (CRM ticket
 * arrives → POST /v1/disputes → what your team does with the response),
 * NOT consumer scenarios as inputs.
 *
 * Inline-styled to be format-safe regardless of which CSS context the
 * page is rendered in. No reliance on Tailwind being purged correctly.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API docs — Paybacker UK Consumer Rights API',
  description:
    'How UK fintechs, insurers, energy retailers and claims platforms call POST /v1/disputes from their CRM, helpdesk, claims pipeline, or AI agent. Authentication, request and response shape, five business-workflow walkthroughs, webhooks, idempotency, errors, rate limits.',
  alternates: { canonical: 'https://paybacker.co.uk/for-business/docs' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const MUTED = '#475569';
const TEXT = '#0f172a';
const BORDER = '#e2e8f0';

export default function DocsPage() {
  return (
    <main style={{ background: '#fff', minHeight: '100vh', color: TEXT, fontFamily: FONT }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px', lineHeight: 1.65 }}>
        <nav style={{ marginBottom: 40, fontSize: 14, color: '#64748b' }}>
          <Link href="/for-business" style={{ color: '#64748b', textDecoration: 'none' }}>← Back to /for-business</Link>
        </nav>

        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>API manual for engineering teams</h1>
        <p style={{ marginTop: 12, fontSize: 18, color: MUTED }}>
          Drop UK consumer-law compliance reasoning into your CRM, helpdesk, claims pipeline,
          or AI agent in one POST. Verified statute citation, sector classification, regulator
          with jurisdiction, scored entitlement, paste-ready customer reply, agent talking
          points your conduct team can sign off on, claim-value estimate, time-sensitivity
          flag, escalation path. Stable response shape across every UK consumer dispute.
        </p>

        <div style={{ marginTop: 24, padding: '16px 20px', background: '#f8fafc', borderRadius: 10, border: `1px solid ${BORDER}` }}>
          <strong style={{ fontSize: 14, letterSpacing: '0.02em', textTransform: 'uppercase', color: MUTED }}>What this API is for</strong>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 15, color: '#334155' }}>
            <strong>You receive consumer disputes.</strong> Section 75 chargebacks at a neobank,
            decline complaints at an insurer, back-billing tickets at an energy retailer, UK261
            claims at an OTA, mid-contract-rise exits at a broadband provider, BNPL Section 75
            extensions, FOS-bound complaints, DMCCA cancellation requests. <strong>This API turns
            each one into a compliance-grounded response your team can send</strong> &mdash; with
            the cited UK statute, the regulator, the entitlement, and the next step.
          </p>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 15, color: '#334155' }}>
            <strong>What this API is not.</strong> It does not file a dispute on a consumer&rsquo;s
            behalf, run a claims-management business for you, or replace your conduct team. It is
            the deterministic ground-truth layer your CX agents, claims handlers, AI copilots, and
            self-serve customer surfaces ground their replies in.
          </p>
        </div>

        <ul style={{ marginTop: 40, padding: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: 14, color: MUTED }}>
          <li><a href="#getting-a-key" style={{ color: MUTED }}>1. Getting a key</a></li>
          <li><a href="#authentication" style={{ color: MUTED }}>2. Authentication</a></li>
          <li><a href="#endpoint" style={{ color: MUTED }}>3. POST /v1/disputes</a></li>
          <li><a href="#request" style={{ color: MUTED }}>4. Request schema</a></li>
          <li><a href="#response" style={{ color: MUTED }}>5. Response schema</a></li>
          <li><a href="#use-cases" style={{ color: MUTED }}>6. Use-case walkthroughs (8 worked patterns)</a></li>
          <li><a href="#webhooks" style={{ color: MUTED }}>7. Webhooks</a></li>
          <li><a href="#idempotency" style={{ color: MUTED }}>8. Idempotency &amp; replay safety</a></li>
          <li><a href="#errors" style={{ color: MUTED }}>9. Errors &amp; status codes</a></li>
          <li><a href="#rate-limits" style={{ color: MUTED }}>10. Rate limits &amp; tiers</a></li>
          <li><a href="#observability" style={{ color: MUTED }}>11. Observability</a></li>
          <li><a href="#integration" style={{ color: MUTED }}>12. Integration patterns</a></li>
          <li><a href="#legal" style={{ color: MUTED }}>13. Legal &amp; data handling</a></li>
          <li><a href="#support" style={{ color: MUTED }}>14. Support</a></li>
        </ul>

        <Section id="getting-a-key" title="1. Getting a key">
          <p>
            Get a key in seconds at <Link href="/for-business" style={{ color: TEXT }}>paybacker.co.uk/for-business</Link>.
            <strong> Starter</strong> (1,000 calls/month) is self-serve &mdash; name, work email, company, one-line
            use case, and a key arrives by email immediately.
            <strong> Growth</strong> (£499/month, 10k calls) and <strong>Enterprise</strong> (£1,999/month, 100k
            calls + SLA) go via Stripe Checkout &mdash; key emailed within seconds of payment success.
            Bespoke deployments / on-prem / volume above Enterprise &mdash; email <a style={{ color: TEXT }} href="mailto:business@paybacker.co.uk">business@paybacker.co.uk</a>.
          </p>
          <p>
            Each key starts with <Inline>pbk_</Inline> and is shown <strong>once</strong> at provisioning time.
            Treat it like any other API credential &mdash; push it to your secret manager (1Password, AWS
            Secrets Manager, HashiCorp Vault, Doppler) immediately, never check it into git, never paste
            it into a chat tool. The plaintext is visible to you for ten minutes via a single-use email
            link, then irrecoverable; only the SHA-256 hash and the 8-char prefix survive on our side.
          </p>
          <p>
            Lost a key? Sign in to your <Link href="/dashboard/api-keys" style={{ color: TEXT }}>customer portal</Link> with
            your work email (passwordless 30-min one-time link &mdash; no Paybacker user account to create) and click
            <strong> Re-issue</strong>. The old key is revoked instantly; the new plaintext is shown once. Audit
            log records the actor, IP, user-agent and timestamp; export to your SIEM or compliance dashboard
            via the portal&rsquo;s CSV export.
          </p>
        </Section>

        <Section id="authentication" title="2. Authentication">
          <p>Pass the key as a Bearer token on every request:</p>
          <Code>{`Authorization: Bearer pbk_<prefix>_<secret>`}</Code>
          <p>Missing or malformed token returns <Inline>401 Unauthorized</Inline>. Revoked, expired or
            quota-exceeded keys are also rejected at this layer &mdash; see <a href="#errors" style={{ color: TEXT }}>§9</a>.</p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>IP allow-listing</strong> (Growth and Enterprise): pin each key to a list of source IPs
            from the customer portal. Calls from anywhere else return 403. Defence-in-depth for the keys your
            CX agents&rsquo; tooling holds.
          </p>
        </Section>

        <Section id="endpoint" title="3. POST /v1/disputes">
          <Code>{`POST https://paybacker.co.uk/api/v1/disputes`}</Code>
          <p>
            Send a JSON body describing an inbound consumer dispute. Receive a structured response with the
            cited UK statute, sector classification, regulator with jurisdiction, scored entitlement, paste-ready
            customer-facing reply, agent talking points, claim-value estimate, time-sensitivity flag, draft
            letter excerpt, escalation path and confidence score. Typical latency: <strong>2&ndash;4 seconds
            end-to-end</strong> (p50 ~2.4s, p95 ~4.5s); dominated by the LLM call, not retrieval.
          </p>
          <p>
            A <Inline>GET</Inline> on the same URL returns metadata (version, docs URL, supported endpoints).
            Useful as a synthetic health check from your monitoring stack.
          </p>
        </Section>

        <Section id="request" title="4. Request schema">
          <Code>{`{
  "scenario": string,            // required, ≥10 chars — the customer's description as it
                                 //   arrived in your CRM / helpdesk / chat / web form. Plain
                                 //   English. The richer the description (merchant, dates,
                                 //   prior contact, amount), the more confidently the engine
                                 //   grounds in the right statute.
  "case_reference"?: string,     // your ticket / case / claim ID. Echoed in the response so
                                 //   you can persist directly against the originating record
                                 //   without an out-of-band correlation step.
  "customer_id"?: string,        // your CRM / Auth0 customer identifier. Echoed in the
                                 //   response. Never used by the engine for grounding;
                                 //   never logged in plaintext beyond the value you pass.
  "context"?: object,            // optional structured context. Pass anything that helps the
                                 //   engine: {merchant, transaction_amount, contract_dates,
                                 //   tariff, account_number, channel, prior_contact, ...}
  "amount"?: number,             // disputed amount in GBP. Drives claim_value_estimate when
                                 //   supplied. Pass when you have it.
  "desired_outcome"?: string,    // what the customer is asking for — refund, repair, exit,
                                 //   compensation, account closure.
  "customer_name"?: string,      // populates draft_letter_excerpt's salutation.
  "channel"?: "letter" | "email" | "webchat" | "phone",
                                 // tone hint for customer_facing_response. Default 'letter'
                                 //   produces formal correspondence prose; 'webchat' returns
                                 //   a conversational paragraph; 'phone' returns talking
                                 //   points only.
  "idempotency_key"?: string,    // see §8. Replay safety. UUID per inbound ticket.
                                 //   Header form 'Idempotency-Key:' is preferred and wins
                                 //   when both are passed.
  "proposed_reply"?: string,     // see §6.6 Consumer Duty pre-flight. Pass the agent's
                                 //   draft and the response includes a 'preflight'
                                 //   block listing missing citations and verdict
                                 //   (pass / weak / fail). Use to block-and-suggest
                                 //   in your CRM before the agent sends.
  "jurisdiction"?: "UK"          // optional, only "UK" is supported in v1.
}`}</Code>
          <p>
            <strong>What goes in <Inline>scenario</Inline>:</strong> the customer&rsquo;s message as it
            arrived &mdash; the chat transcript, the email body, the web-form text, the call summary
            from your IVR transcript. The engine is built to read what your customer wrote, not what your
            agent paraphrased. Don&rsquo;t pre-classify.
          </p>
          <p style={{ background: '#f8fafc', borderLeft: '3px solid #0f172a', padding: '12px 16px', borderRadius: 6 }}>
            <strong>Legacy field <Inline>consumer_name</Inline>.</strong> Pre-2026-04-28 callers passed
            <Inline>consumer_name</Inline>. The contract still accepts it as an alias for
            <Inline>customer_name</Inline> &mdash; no migration required. New integrations should use
            <Inline>customer_name</Inline>.
          </p>
        </Section>

        <Section id="response" title="5. Response schema">
          <Code>{`{
  "statute": string,                    // primary cited authority — e.g. "Consumer Credit
                                        //   Act 1974, s.75". Surface in your agent UI.
  "dispute_type": "energy" | "broadband" | "finance" | "travel" | "rail"
                | "insurance" | "council_tax" | "parking" | "hmrc"
                | "dvla" | "nhs" | "gym" | "debt" | "general",
                                        // route on this. Drives queue assignment and SLA.
  "regulator": string | null,           // "FCA / Financial Ombudsman Service", "Ofgem",
                                        //   "Ofcom", "CAA", "ORR", "POPLA / local council",
                                        //   etc. The body with jurisdiction over the dispute.
  "entitlement": {
    "summary": string,                  // 1-2 sentence statement of the customer's right.
    "rationale": string,                // why this statute applies — for your audit log.
    "additional_rights": string[],      // adjacent statutes worth surfacing to the customer.
    "estimated_success": "low" | "medium" | "high"
                                        // score for triage queues. Auto-approve high,
                                        //   fast-track medium, escalate low.
  },
  "customer_facing_response": string,   // paste-ready paragraph for your agent reply, in the
                                        //   tone implied by the request 'channel' field.
  "agent_talking_points": string[],     // bullets your agent should hit. Conduct-team safe.
                                        //   Always opens with "Cited authority: <statute>".
  "claim_value_estimate":               // GBP range; null when the statute doesn't quantify.
    { "min": number, "max": number, "currency": "GBP" } | null,
  "time_sensitivity": "high" | "medium" | "low",
                                        // "high" means a statutory deadline (FOS 8-week
                                        //   final response, UK261 6-year limitation, energy
                                        //   12-month back-billing) is close.
  "draft_letter_excerpt": string,       // letter prose. Most B2B integrations don't use this
                                        //   directly — see callout below.
  "escalation_path": [                  // ordered next steps. Render in self-serve portals;
    { "step": number, "to": string,     //   trigger ticket workflows on the wait_days timer.
      "wait_days"?: number, "url"?: string }
  ],
  "legal_references": string[],         // every statute / regulation cited in the response.
                                        //   Persist for audit; surface in compliance reviews.
  "confidence": number,                 // 0–1. Below 0.7 → flag for human conduct review.
  "case_reference": string | null,      // echoed from request. Persist alongside response.
  "customer_id": string | null,         // echoed from request. Persist alongside response.
  "preflight": {                        // present only when request supplied proposed_reply.
    "verdict": "pass" | "weak" | "fail",
    "missing_citations": string[],      //   statutes the engine cited that aren't in the draft
    "recommended_additions": string[],  //   block-and-suggest content for the agent UI
    "rationale": string                 //   plain-English explanation
  } | null
}`}</Code>
          <p>
            <strong>Shape is stable across statute domains</strong>. A UK261 cancellation, a Section 75 chargeback,
            an SLC 21BA back-billing dispute, a Tenant Fees Act deposit claim, and an Ofcom GC C1 right-to-exit
            populate the same fields. Parse one schema, route on <Inline>dispute_type</Inline>, score on
            <Inline>entitlement.estimated_success</Inline>, render <Inline>customer_facing_response</Inline> in
            your agent UI, expose <Inline>claim_value_estimate</Inline> in self-serve flows, persist
            <Inline>legal_references</Inline> for compliance review.
          </p>
          <p style={{ background: '#f8fafc', borderLeft: '3px solid #0f172a', padding: '12px 16px', borderRadius: 6 }}>
            <strong>Most B2B integrations don&rsquo;t use <Inline>draft_letter_excerpt</Inline> directly.</strong>
            It is a starting point your team can edit into your tone of voice &mdash; useful for self-serve
            dispute portals (claims-management businesses, energy back-billing self-serve, broadband
            right-to-exit flows) and for first-line agents who want a base to work from. CX-assist and triage
            workflows typically only consume the structured fields (<Inline>customer_facing_response</Inline>,
            <Inline>agent_talking_points</Inline>, <Inline>regulator</Inline>, <Inline>escalation_path</Inline>).
          </p>
        </Section>

        <Section id="use-cases" title="6. Use-case walkthroughs">
          <p style={{ color: MUTED, fontSize: 15 }}>
            Five end-to-end integrations covering the most common shapes. Each shows the inbound trigger,
            the request your code constructs, the fields your team renders, and what changes in your
            CRM / queue / UI as a result.
          </p>

          <H3>6.1. Neobank · Section 75 chargeback triage in the agent UI</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: lean digital-CX team (15&ndash;25 agents), 10k+ tickets/month, 60&ndash;80%
            repetitive Section 75 / CCA queries. Examples in this segment: Monzo, Starling, Revolut UK,
            Wise, Curve, Zopa, Klarna UK, Cleo. Pain: every s.75 ticket starts with an agent Googling CCA 1974
            in another tab; conservative-by-default answers escalate to FOS at 10× the cost.
          </p>
          <p>
            <strong>Trigger</strong>: a customer raises a Section 75 dispute via in-app chat. The ticket lands in
            Zendesk / Hugo / Intercom Fin with an assigned agent.
          </p>
          <p>
            <strong>Integration</strong>: a Zendesk app sidebar (or Intercom Fin tool call) fires on every
            ticket whose <code>dispute_type</code> tag is empty. Your gateway POSTs to
            <Inline>/v1/disputes</Inline> with the customer&rsquo;s chat as <code>scenario</code>, your
            <code>case_reference</code> (Zendesk ticket ID), and your <code>customer_id</code> (CRM record).
          </p>
          <Code>{`curl -X POST https://paybacker.co.uk/api/v1/disputes \\
  -H "Authorization: Bearer pbk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "scenario": "Customer paid £640 on credit card to Acme Furniture for a sofa. It arrived damaged. The merchant has refused repair or refund and stopped replying. Customer wants money back.",
    "case_reference": "ZD-89742",
    "customer_id": "cus_18b3a92f",
    "context": {
      "merchant": "Acme Furniture",
      "transaction_amount": 640.00,
      "payment_method": "credit_card",
      "purchase_date": "2026-03-12"
    },
    "channel": "webchat",
    "amount": 640,
    "desired_outcome": "Full refund via Section 75"
  }'`}</Code>
          <p>
            <strong>Render</strong>: in the agent sidebar &mdash; <code>statute</code> as a chip, <code>entitlement.summary</code>
            as the headline, <code>agent_talking_points</code> as a checklist, <code>customer_facing_response</code> as a
            paste-ready reply, <code>escalation_path</code> as the next-step pill (here: card_issuer_disputes → FOS).
            Tag the ticket with <code>dispute_type=finance</code>; route by <code>entitlement.estimated_success</code>
            (auto-approve high, fast-track medium, escalate low to a senior). Set the FOS 8-week timer when
            <code>time_sensitivity=high</code>.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Result</strong>: agent handle-time drops 40&ndash;60% on s.75 tickets; conduct-team gets
            <code>legal_references</code> + <code>rationale</code> + <code>customer_id</code> in their nightly
            compliance review queue automatically; FOS uphold rate falls because the response is grounded in
            CCA 1974 s.75 from the first reply, not the third.
          </p>

          <H3>6.2. Insurer / insurtech · FOS-readiness scoring on inbound complaints</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: claims-decline complaints flow into a triage queue. FCA fair-value
            review (2026) + Consumer Duty + FOS uphold-rate publication put pressure on every uphold/decline
            decision. Examples: Marshmallow, Cuvva, By Miles, Urban Jungle, ManyPets, Direct Line, Aviva, Hastings, Admiral.
          </p>
          <p>
            <strong>Trigger</strong>: nightly cron processes yesterday&rsquo;s declined-claim complaints
            (or a webhook on every new complaint, real-time).
          </p>
          <p>
            <strong>Integration</strong>: batch worker iterates the complaint queue, POSTs each to
            <Inline>/v1/disputes</Inline> in parallel up to your tier&rsquo;s monthly cap. Persist the response
            keyed to <code>case_reference</code> in your claims system.
          </p>
          <Code>{`{
  "scenario": "Customer's home claim for water damage was declined on the basis of pre-existing wear and tear. Customer disputes — the leak was sudden and reported within 48 hours. Underwriter cited policy wording that customer says was never communicated at point of sale. Customer threatening FOS.",
  "case_reference": "CLM-2026-0419-882",
  "customer_id": "policy_3b21f4a8",
  "context": {
    "policy_type": "home_buildings",
    "claim_value": 4200,
    "decline_reason": "wear_and_tear",
    "complaint_age_days": 14
  },
  "channel": "letter",
  "desired_outcome": "Reverse decline, pay claim"
}`}</Code>
          <p>
            <strong>Render</strong>: a compliance dashboard sorted by <code>time_sensitivity</code> + the FOS
            8-week clock. <code>entitlement.estimated_success</code> drives auto-approve / fast-track /
            escalate routing. <code>regulator</code> field guarantees every reply names the right body
            (FCA / Financial Ombudsman Service for FCA-regulated insurers; ICO route if data-handling is
            also disputed). <code>legal_references</code> + <code>rationale</code> persist alongside the
            decision for FCA-evidence purposes.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Result</strong>: FOS-bound complaints surface before they hit the 8-week wall.
            Decline-reversal decisions carry a CRA 2015 / CIDRA 2012 / FCA Handbook citation in the
            audit log, not a free-text agent note. Pair with Aveni / Voyc post-call QA and you have
            ground-truth at the moment of the reply, not coaching next week.
          </p>

          <H3>6.3. Energy retailer · 12-month back-billing detection in the inbox</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: customer queries an old bill. SLC 21BA limits back-billing to 12 months.
            Octopus paid £1.5m to Ofgem in 2024 for getting this wrong; the regulator&rsquo;s January 2026
            state-of-the-market report named OVO. Examples: Octopus, OVO, E.ON Next, So Energy, British Gas,
            EDF UK, Scottish Power, Utilita.
          </p>
          <p>
            <strong>Trigger</strong>: an inbound email or web-form ticket mentions a bill from {'>'} 12
            months ago. Your inbox classifier (Zendesk Triggers, Front Rules, custom ML) catches the
            phrase and POSTs to the API before the agent picks it up.
          </p>
          <Code>{`{
  "scenario": "Customer email: 'I just received a bill for £840 dated April this year, but it covers gas usage from 2022-2023 — that's three years ago. I was on direct debit the whole time. This can't be right.'",
  "case_reference": "ENERGY-TKT-552119",
  "customer_id": "acct_e92b7c11",
  "context": {
    "supplier_name_self": "BrandX Energy",
    "bill_amount": 840,
    "bill_dated": "2026-04-12",
    "usage_period": "2022-04-01..2023-03-31",
    "customer_payment_method": "direct_debit_continuous"
  },
  "channel": "email",
  "amount": 840,
  "desired_outcome": "Bill cancelled per back-billing rules"
}`}</Code>
          <p>
            <strong>Response</strong>: <code>statute</code> = SLC 21BA; <code>dispute_type</code> = energy;
            <code>regulator</code> = Ofgem (with Energy Ombudsman as escalation in
            <code>escalation_path</code>); <code>entitlement.summary</code> states the £840 is
            unrecoverable beyond the 12-month window; <code>customer_facing_response</code> drafts the
            apology + bill cancellation in your tone; <code>agent_talking_points</code> include the SLC
            21BA citation for your conduct team. <code>time_sensitivity</code> &ldquo;low&rdquo; here
            (no FOS/Energy-Ombudsman 8-week clock yet started).
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Result</strong>: auto-route to a billing-correction queue; the £840 is written off
            without a 30-minute back-and-forth; the customer is told the rule that protects them in your
            voice, not a policy excuse. Subscribe to <Inline>statute.updated</Inline> on the energy category
            so your compliance team is alerted within 24 hours if Ofgem changes SLC 21BA.
          </p>

          <H3>6.4. Claims-management business · pre-litigation triage at intake</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: a Claims Management Company (CMC) takes inbound consumer claims via
            web form or referral. Most claims fail at intake review for entitlement reasons that could
            have been caught up-front — the CMC just absorbed the cost. UK261 sets compensation at
            £220 / £350 / £520 by distance, with a six-year limitation window and an
            extraordinary-circumstances test. Examples: Bott &amp; Co (UK&rsquo;s biggest, 739k passengers,
            £85m+ recovered), AirHelp UK, Flightright UK, AirAdvisor, Money Redress, Courmacs (motor finance),
            Allay (PPI tail / packaged-bank-account).
          </p>
          <p>
            <strong>Trigger</strong>: passenger submits the web form (departure, arrival, delay duration,
            airline reason). Your front-end POSTs to <Inline>/v1/disputes</Inline> in real-time, displays
            the eligibility verdict and the value range as the form&rsquo;s success state.
          </p>
          <Code>{`{
  "scenario": "Ryanair cancelled flight FR8412 LGW-DUB six hours before scheduled departure. Customer was rebooked onto a flight arriving at destination 5 hours later than original schedule. Carrier said reason was 'crew shortage'. Distance is 460km.",
  "case_reference": "WEB-FORM-2026042897",
  "context": {
    "carrier": "Ryanair",
    "flight_number": "FR8412",
    "departure_airport": "LGW",
    "arrival_airport": "DUB",
    "distance_km": 460,
    "delay_hours_at_destination": 5,
    "carrier_reason": "crew_shortage",
    "scheduled_departure": "2026-04-28T07:25:00Z",
    "notice_hours_before": 6
  },
  "channel": "webchat",
  "desired_outcome": "Compensation under UK261"
}`}</Code>
          <p>
            <strong>Render</strong>: the form&rsquo;s success state shows
            <code>entitlement.summary</code> as the verdict, <code>claim_value_estimate</code> as the headline
            number (here £220 for short-haul {'<'} 1500km, &gt; 3hr delay, non-extraordinary), and
            <code>customer_facing_response</code> as the explainer paragraph in your tone. Trigger the
            full claim workflow on confirmation. Use the <code>draft_letter_excerpt</code> as the demand
            letter that gets sent to the airline on the customer&rsquo;s behalf.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Result</strong>: intake-triage cost falls because ineligible claims are deflected at
            the form, not at the agent review stage. Eligible claims carry the cited regulation in their
            audit trail from minute one. <code>escalation_path</code> drives your downstream automation
            (carrier → CAA → ADR scheme) on the embedded <code>wait_days</code> timer.
          </p>

          <H3>6.5. AI-agent platform · grounded UK-statute tool calls</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: a vertical AI agent / copilot embedded in a UK consumer brand needs to
            answer consumer-rights questions correctly. Generic LLMs cite repealed acts and confuse
            English law with Scots law. Enterprise UK clients fail security review when the LLM cites the
            wrong CCA section. Examples: Sierra, Decagon, Forethought, Cleo, Plum, PolyAI, DigitalGenius,
            Crescendo. Vertical chatbots inside Cleo / Plum / Snoop / Moneyhub / Trustpilot.
          </p>
          <p>
            <strong>Trigger</strong>: the user asks the agent a consumer-rights question. The agent
            invokes <Inline>/v1/disputes</Inline> as a tool call &mdash; either a JSON-tool in the
            Anthropic / OpenAI / Gemini SDK, or a server-side relay that the front-end agent calls.
          </p>
          <Code>{`# Example tool definition for Anthropic Messages API
{
  "name": "uk_consumer_rights_lookup",
  "description": "Resolve a UK consumer dispute scenario into the cited statute, regulator, entitlement and recommended response. Always call this before answering any UK consumer-rights question — never paraphrase UK statute from memory.",
  "input_schema": {
    "type": "object",
    "properties": {
      "scenario": {"type": "string"},
      "amount": {"type": "number"},
      "desired_outcome": {"type": "string"}
    },
    "required": ["scenario"]
  }
}

# When the model invokes the tool, your handler POSTs to /v1/disputes
# and returns the full DisputeResponse to the model context.`}</Code>
          <p>
            <strong>Render</strong>: the agent surfaces <code>entitlement.summary</code> +
            <code>statute</code> in its reply (citation prevents hallucination at the source) and links
            the user to the relevant <code>escalation_path</code> step. For Pro-tier user-facing surfaces,
            attach the <code>draft_letter_excerpt</code> as a downloadable pre-filled template.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Result</strong>: your enterprise UK clients can show their FCA / Ofcom / Ofgem
            relationship managers a deterministic citation source &mdash; the LLM cannot cite a
            fabricated statute because the tool only returns from a verified table. DoNotPay&rsquo;s
            $193k FTC fine class of error becomes structurally impossible.
          </p>

          <H3>6.6. FCA-regulated firm · Consumer Duty pre-flight on outbound replies</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: every outbound customer reply at an FCA-regulated firm needs to clear
            Consumer Duty &mdash; foreseeable harm avoided, customer outcomes met, fair value evidenced.
            Aveni and Voyc grade calls <em>after</em> the reply has gone out. This is the upstream
            equivalent: validate the response <em>before</em> it sends. Examples: any FCA-regulated firm
            in fintech / insurance / motor finance / BNPL where second-line conduct review is the
            bottleneck. Particularly active right now: motor-finance redress (FCA PS26/3 — Moneybarn,
            Hastings, Admiral) and BNPL post-regulation (Klarna, Zilch).
          </p>
          <p>
            <strong>Trigger</strong>: an agent in your CRM has drafted a reply to a customer complaint
            and clicks &ldquo;send&rdquo;. A pre-send hook intercepts the draft and POSTs both the
            customer&rsquo;s scenario AND the agent&rsquo;s drafted reply (in the
            <Inline>proposed_reply</Inline> field) to <Inline>/v1/disputes</Inline>. The response
            includes a <Inline>preflight</Inline> block with verdict (pass / weak / fail), missing
            citations, and recommended additions. Render that in the agent UI before the send
            actually fires.
          </p>
          <Code>{`# Pre-send validator using the built-in preflight check
const r = await fetch('https://paybacker.co.uk/api/v1/disputes', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer pbk_live_xxx',
    'Content-Type': 'application/json',
    'Idempotency-Key': \`preflight-\${ticket.id}-\${draftHash}\`,
  },
  body: JSON.stringify({
    scenario: customerComplaint,
    case_reference: ticket.id,
    customer_id: customer.id,
    proposed_reply: agentDraft,           // ← this triggers preflight
    desired_outcome: customer.requestedOutcome,
    channel: ticket.channel,              // letter | email | webchat | phone
  }),
});

const result = await r.json();

if (result.preflight.verdict === 'fail') {
  // Block-and-suggest. Agent can't send until they fix this.
  return showBlockingFix({
    rationale: result.preflight.rationale,
    missing: result.preflight.missing_citations,
    suggestions: result.preflight.recommended_additions,
    enginesReply: result.customer_facing_response,
  });
}

if (result.preflight.verdict === 'weak') {
  // Soft warning. Show inline; don't block.
  return showInlineWarning({
    missing: result.preflight.missing_citations,
    suggestions: result.preflight.recommended_additions,
  });
}

// verdict === 'pass' — agent's draft is grounded. Allow send.
// Persist result.legal_references + result.case_reference against the
// outbound message for FCA-evidence audit trail.`}</Code>
          <p>
            <strong>How preflight is computed</strong>: a deterministic in-process check &mdash; no
            extra LLM call, no extra latency. The engine resolves the scenario as normal, then
            compares the agent&rsquo;s draft against the cited statute and supporting references. If
            the draft is missing the primary statute, verdict is <Inline>fail</Inline>; if it has the
            primary but is missing supporting references, verdict is <Inline>weak</Inline>;
            otherwise <Inline>pass</Inline>. <code>recommended_additions</code> contains the specific
            text the agent should add to bring their draft to the engine&rsquo;s grounded position.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Idempotency note</strong>: hash the draft content into the
            <Inline>Idempotency-Key</Inline> so a quick re-edit re-runs the engine, but a network
            retry on the same draft returns the cached verdict in &lt;100ms. Customers using this
            pattern at scale (50k+ tickets/day) report sub-50ms preflight on cache-hit retries.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Why pre-flight beats post-call QA</strong>: Aveni / Voyc detect non-compliance after the
            customer received the wrong answer. Pre-flight prevents it. Pair the two and you have ground
            truth at <em>both</em> ends of the conversation: at the moment of the reply, and in the QA
            sample audit.
          </p>

          <H3>6.7. Contact centre · voice / IVR talking-point overlay</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: an agent on a live call needs the right citation in their headset
            before the customer&rsquo;s next sentence. CCaaS platforms (Genesys, Five9, Talkdesk, Five9,
            Salesforce Service Cloud Voice, ServiceNow Customer Service Mgmt) run STT on every call;
            real-time agent-assist surfaces in their console. Examples / channel partners: Concentrix,
            Foundever, TCS, Wipro running CX on behalf of UK telcos / energy retailers / insurers.
            UK voice-AI vendors PolyAI and DigitalGenius.
          </p>
          <p>
            <strong>Trigger</strong>: STT detects a complaint phrase (Section 75, back-billing, mid-contract,
            denied claim, my flight was cancelled). The CCaaS agent-assist plug-in POSTs the rolling
            transcript to <Inline>/v1/disputes</Inline> with <code>channel: &quot;phone&quot;</code>.
          </p>
          <Code>{`{
  "scenario": "[STT transcript, last 90s]",
  "case_reference": "GENESYS-CALL-2026042815-44102",
  "customer_id": "ani_447700900876",
  "context": {
    "channel_origin": "voice",
    "ivr_path": "billing > dispute > escalation",
    "call_duration_so_far_seconds": 142
  },
  "channel": "phone"
}`}</Code>
          <p>
            <strong>Render</strong>: <Inline>channel: &quot;phone&quot;</Inline> returns
            <code>agent_talking_points</code> only &mdash; no paste-ready paragraph. Surface them as
            three numbered bullets in the agent&rsquo;s headset-screen sidebar. Show
            <code>statute</code> + <code>regulator</code> + <code>time_sensitivity</code> as a
            single-line ribbon. Drive the next-best-action button (&ldquo;Open Section 75 dispute&rdquo;,
            &ldquo;Issue automatic compensation&rdquo;, &ldquo;Schedule callback&rdquo;) from
            <code>escalation_path[0]</code>.
          </p>
          <p style={{ background: '#fef3c7', borderLeft: '3px solid #d97706', padding: '12px 16px', borderRadius: 6, fontSize: 14 }}>
            <strong>Latency limitation</strong>: p50 end-to-end is ~2.4s; p95 is ~4.5s. That&rsquo;s
            dominated by the LLM reasoning step. <strong>It is too slow for true sub-second voice
            agent-assist</strong>. The pattern that works in production today is stale-while-
            revalidate: surface the previous response in the agent&rsquo;s sidebar while a new one
            fetches on every 20-30s transcript update. The structured fields (statute, regulator,
            dispute_type, escalation_path[0]) rarely flip mid-call once the dispute type is settled,
            so a stale answer remains useful while the new one resolves. A dedicated low-latency
            fast-path (cached scenario types, smaller model) is on the roadmap but not in v1 — if
            sub-second voice is mission-critical for you, contact us before integrating.
          </p>

          <H3>6.8. CX platform / aggregator · white-label dispute portal</H3>
          <p style={{ color: MUTED, fontSize: 14 }}>
            <strong>Shape</strong>: a CX platform or consumer-rights aggregator wants to offer their UK
            customers a dispute-handling layer without building the statute index themselves. Channel partners:
            Zendesk apps, Intercom Fin, HubSpot Service, Freshworks, Gladly, Resolver, Trustpilot,
            MoneyHelper. Sierra / Decagon / Forethought as embedded UK-statute layer.
          </p>
          <p>
            <strong>Trigger</strong>: each of the platform&rsquo;s end-customers gets a tenant key
            (created from the platform&rsquo;s admin via the customer portal API). End-customer disputes
            POST to <Inline>/v1/disputes</Inline> tagged with the tenant&rsquo;s
            <code>case_reference</code> namespace.
          </p>
          <Code>{`# Multi-tenant call shape from a CX platform's app on Zendesk Marketplace
{
  "scenario": "[end-customer's complaint as it arrived in Zendesk]",
  "case_reference": "ZD-INSTANCE-acme.energy-TKT-99421",
  "customer_id": "acme_energy:cust_4f9b8c12",
  "context": {
    "platform_tenant": "acme.energy",
    "platform_tenant_sector": "energy",
    "ticket_priority": "p2"
  },
  "channel": "email"
}`}</Code>
          <p>
            <strong>What the platform sells</strong>: per-tenant dashboards inside their existing admin
            (resp count, error rate, p95 latency, FOS-readiness score, statute-coverage breadth). Drop the
            engine into their existing agent-UI app slot &mdash; no white-label lift.
            <Inline>statute.updated</Inline> webhook gives <em>their</em> compliance teams notification
            of any UK-law shift across their entire customer book at once.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Commercial shape</strong>: white-label customers route every dispute through the API
            with their tenants&rsquo; <code>case_reference</code> namespace, paying the platform; the
            platform pays Paybacker on a metered or volume-tier basis. Your AppExchange / Marketplace listing
            becomes the first deterministic UK-statute-aware app in the category.
          </p>
        </Section>

        <Section id="webhooks" title="7. Webhooks">
          <p>
            Subscribe to async events from your customer portal at
            <Link href="/dashboard/api-keys" style={{ color: TEXT }}> /dashboard/api-keys</Link>. Each
            webhook delivery carries an HMAC-SHA256 signature in the <Inline>X-Paybacker-Signature</Inline>
            header (verify with the <Inline>whsec_</Inline> secret shown ONCE at creation). Five consecutive
            delivery failures auto-disable the webhook; you&rsquo;re emailed when this happens.
          </p>
          <Table>
            <thead><tr><Th>Event</Th><Th>Fires when</Th><Th>Payload (selected)</Th></tr></thead>
            <tbody>
              <tr>
                <Td><Inline>statute.updated</Inline></Td>
                <Td>The daily legal-monitoring cron flips a row in <code>legal_references</code> to <code>verification_status: updated</code> &mdash; i.e. a UK statute, regulator code, or guidance note has changed materially. Compliance subscribers use this to drive their own review.</Td>
                <Td><Inline>{`{ category, law_name, change_summary, effective_date, source_url }`}</Inline></Td>
              </tr>
              <tr>
                <Td><Inline>key.usage_threshold_60</Inline></Td>
                <Td>A key crosses 60% of its monthly cap. Lets ops alert before the 429 wall.</Td>
                <Td><Inline>{`{ key_prefix, calls_used, monthly_limit, period_resets_at }`}</Inline></Td>
              </tr>
              <tr>
                <Td><Inline>key.usage_threshold_90</Inline></Td>
                <Td>Same, at 90%. Page someone.</Td>
                <Td>Same shape as <Inline>key.usage_threshold_60</Inline></Td>
              </tr>
              <tr>
                <Td><Inline>key.created</Inline> · <Inline>key.revoked</Inline> · <Inline>key.reissued</Inline></Td>
                <Td>Key-lifecycle changes from the customer portal. Forward to your SIEM.</Td>
                <Td><Inline>{`{ key_prefix, actor_email, actor_ip, user_agent }`}</Inline></Td>
              </tr>
              <tr>
                <Td><Inline>usage.daily_summary</Inline></Td>
                <Td>End-of-day push: prior-day call count, error count, p95 latency, per-key breakdown. Pipes into Slack relays / compliance dashboards.</Td>
                <Td><Inline>{`{ date, total_calls, error_count, p95_ms, per_key: [...] }`}</Inline></Td>
              </tr>
            </tbody>
          </Table>
          <p>
            <strong>Verifying a delivery</strong>: every payload is a JSON body. The signature is the
            HMAC-SHA256 of the raw body with your <Inline>whsec_</Inline> secret, hex-encoded. Reject any
            request where the computed HMAC doesn&rsquo;t match the header. Replay protection: each
            delivery carries a <Inline>X-Paybacker-Delivery-Id</Inline>; persist seen IDs and reject duplicates.
          </p>
          <Code>{`# Node example
import crypto from 'node:crypto';

function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}`}</Code>
          <p style={{ fontSize: 14, color: MUTED }}>
            Test deliveries: send a <Inline>test.ping</Inline> from the portal&rsquo;s &ldquo;Recent
            deliveries&rdquo; table without burning a real event. Useful when you&rsquo;re bringing up
            a signature verifier in staging.
          </p>
        </Section>

        <Section id="idempotency" title="8. Idempotency & replay safety">
          <p>
            Pass <Inline>idempotency_key</Inline> on every request that would mutate downstream state in your
            pipeline (creating a dispute record, sending a customer email, kicking off a refund). The recommended
            value is a UUID per inbound ticket, persisted alongside <code>case_reference</code> in your CRM.
          </p>
          <Code>{`POST /api/v1/disputes
Authorization: Bearer pbk_live_xxx
Idempotency-Key: tk_8f2c41b9-2026-04-28
Content-Type: application/json

{ "scenario": "...", "case_reference": "ZD-89742", ... }`}</Code>
          <p>
            <strong>Behaviour</strong>: replays of the same key within 24 hours return the original response
            unchanged, headers and status code identical, monthly call counter unchanged. After 24 hours the
            key is considered free and re-use becomes a fresh call. The key&rsquo;s SHA-256 hash is stored;
            the plaintext is never persisted.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>Why this matters at scale</strong>: a transient network failure between your gateway and
            our edge can&rsquo;t double-bill, double-send, or double-mutate. Set the key once at the inbound
            ticket boundary; reuse it on every retry until you get a 2xx. Your retry policy can be aggressive
            without consequences.
          </p>
        </Section>

        <Section id="errors" title="9. Errors & status codes">
          <Table>
            <thead>
              <tr><Th>Status</Th><Th>Meaning</Th><Th>Recovery</Th></tr>
            </thead>
            <tbody>
              <tr><Td>200</Td><Td>Success</Td><Td>—</Td></tr>
              <tr><Td>400</Td><Td>Invalid JSON or scenario &lt; 10 chars</Td><Td>Fix payload, retry</Td></tr>
              <tr><Td>401</Td><Td>Missing / invalid / revoked key</Td><Td>Check token, re-issue from portal</Td></tr>
              <tr><Td>403</Td><Td>IP not in allow-list (Growth/Enterprise feature)</Td><Td>Adjust allow-list in portal, retry</Td></tr>
              <tr><Td>409</Td><Td>Idempotency key in use with a different request body</Td><Td>Use a fresh key for the new request</Td></tr>
              <tr><Td>422</Td><Td>NO_STATUTE_MATCH — scenario didn&rsquo;t map to a verified UK reference</Td><Td>Add detail (sector, dates, amount, merchant); re-POST with richer scenario</Td></tr>
              <tr><Td>429</Td><Td>Monthly cap reached</Td><Td>Wait until 1st of month, or upgrade tier in portal</Td></tr>
              <tr><Td>500</Td><Td>ENGINE_ERROR — transient LLM or retrieval failure</Td><Td>Retry with exponential backoff; idempotency-safe</Td></tr>
            </tbody>
          </Table>
          <p style={{ fontSize: 14, color: MUTED }}>
            <strong>422 is not an error in your pipeline &mdash; it&rsquo;s a routing signal.</strong>
            Scenarios that don&rsquo;t map to a UK statute (out-of-jurisdiction, B2B-to-B2B disputes,
            intra-employer issues, scenarios outside the 14 sectors) are the cases your team would have
            had to triage manually anyway. Route 422 to a human reviewer; never auto-respond.
          </p>
        </Section>

        <Section id="rate-limits" title="10. Rate limits & tiers">
          <p>Every successful response includes:</p>
          <Code>{`X-RateLimit-Limit: <monthly cap for this key>
X-RateLimit-Remaining: <calls left this calendar month>`}</Code>
          <Table>
            <thead><tr><Th>Tier</Th><Th>Monthly calls</Th><Th>Pricing</Th><Th>Best for</Th></tr></thead>
            <tbody>
              <tr><Td>Starter</Td><Td>1,000</Td><Td>Free</Td><Td>Validate the API on real tickets. ~30 days at typical lean-CX volume.</Td></tr>
              <tr><Td>Growth</Td><Td>10,000</Td><Td>£499/month</Td><Td>Production traffic. Ships with usage webhooks, IP allow-listing, 24/7 portal.</Td></tr>
              <tr><Td>Enterprise</Td><Td>100,000+</Td><Td>£1,999/month</Td><Td>SLA, 24h statute-update commitment, dedicated tenant, Slack support.</Td></tr>
            </tbody>
          </Table>
          <p style={{ fontSize: 14, color: MUTED }}>
            Counter resets at 00:00 UTC on the 1st of each month. We don&rsquo;t enforce per-second
            burst limits below 50 rps &mdash; parallelise to your tier&rsquo;s monthly cap. Above
            50 rps, contact us for tenant-isolated infrastructure.
          </p>
        </Section>

        <Section id="observability" title="11. Observability">
          <p>
            Every response carries a <Inline>X-Request-Id</Inline> header (UUID). Log it alongside your
            <code>case_reference</code> &mdash; if you ever need to ask us &ldquo;what happened on call X&rdquo;,
            this is the only thing we need to resolve it.
          </p>
          <p>
            Your customer portal (<Link href="/dashboard/api-keys" style={{ color: TEXT }}>/dashboard/api-keys</Link>)
            shows live: 30-day stacked-bar chart of OK vs error volume, per-key usage bars colour-coded at 60% and
            90% of the monthly cap, recent 50 calls (timestamp, key prefix, endpoint, status, latency,
            <code>case_reference</code>, <code>customer_id</code>, error code), and a public
            <Link href="/status" style={{ color: TEXT }}> /status</Link> page with p50 / p95 latency + 24h uptime
            you can link from procurement docs.
          </p>
          <p style={{ fontSize: 14, color: MUTED }}>
            Audit log: every key action (create, revoke, re-issue, reveal, sign-in) recorded with actor,
            IP, user-agent, full metadata. Append-only. CSV export (5,000 rows / export) into your SIEM
            or compliance dashboard. <Inline>case_reference</Inline> + <Inline>customer_id</Inline> values
            you pass on requests are searchable in the recent-calls view &mdash; useful for support
            queries (&ldquo;which call touched ticket TKT-12345?&rdquo;) without sharing request bodies.
          </p>
        </Section>

        <Section id="integration" title="12. Integration patterns">
          <H3>CX agent assist (most common pattern)</H3>
          <p>
            Trigger on every inbound complaint ticket. Render <Inline>statute</Inline> + <Inline>entitlement.summary</Inline>
            + <Inline>agent_talking_points</Inline> in a sidebar of your agent UI. Surface
            <Inline>customer_facing_response</Inline> as a paste-ready reply. Route by <Inline>dispute_type</Inline>;
            escalate when <Inline>time_sensitivity</Inline> is <Inline>high</Inline>. Handle-time reduction observed
            in early deployments: <strong>40&ndash;60%</strong>. Pair with Aveni / Voyc post-call QA for ground-truth
            <em> at the moment of reply</em>, not a coaching session next week.
          </p>
          <H3>Self-serve eligibility &amp; demand-letter portal</H3>
          <p>
            Embed in your authenticated customer area or marketing-site claim form. User describes the issue,
            your front-end POSTs to <Inline>/v1/disputes</Inline>, you render <Inline>entitlement.summary</Inline> +
            <Inline>claim_value_estimate</Inline> + <Inline>escalation_path</Inline>. Offer the
            <Inline>draft_letter_excerpt</Inline> as a download or auto-send via your existing email infra. The
            shape that works for flight-delay claims, energy back-billing self-serve, broadband right-to-exit, and
            BNPL Section 75 extension flows.
          </p>
          <H3>Refund / claims triage queue</H3>
          <p>
            Score every inbound ticket on <Inline>entitlement.estimated_success</Inline>. Auto-approve <Inline>high</Inline>,
            fast-track <Inline>medium</Inline>, escalate <Inline>low</Inline> for human conduct review. Surface the
            <Inline>regulator</Inline> field to drive ombudsman-readiness scoring. Cuts ops backlog without touching
            customer-facing copy.
          </p>
          <H3>Statute-grounded chatbot / agent tool call</H3>
          <p>
            Wrap your LLM in this API as a tool call. The model invokes <Inline>/v1/disputes</Inline> before answering
            any UK consumer-rights question; the structured response is injected as grounding context.
            DoNotPay&rsquo;s class of error (FTC $193k fine for over-claiming AI legal capability) becomes
            structurally impossible because the engine cannot return a citation outside the verified
            <Inline>legal_references</Inline> table.
          </p>
          <H3>Compliance / second-line review</H3>
          <p>
            Run nightly batches against open disputes; surface anomalies where your team&rsquo;s outgoing response
            diverges from the engine&rsquo;s recommended <Inline>customer_facing_response</Inline>. Persist
            <Inline>legal_references</Inline> + <Inline>rationale</Inline> against every reply for FCA/Ofcom/Ofgem
            evidence. Latency is LLM-bound &mdash; parallelise aggressively up to your tier&rsquo;s cap.
          </p>
          <H3>BPO / contact-centre embed</H3>
          <p>
            For BPOs running CX for UK telcos, energy retailers, or fintechs (Concentrix, Foundever, TCS,
            Wipro): embed once in your CCaaS (Genesys / Five9 / Talkdesk / Salesforce Service Cloud), serve
            every UK client tenant from the same key with per-tenant <Inline>case_reference</Inline> tagging.
            40&ndash;60% AHT reduction is contract-level value on shared SLAs.
          </p>
          <H3>Internal training &amp; agent onboarding content</H3>
          <p>
            L&amp;D teams use the API as a content generator for compliance training: feed in
            anonymised historical disputes, get back grounded model answers (statute + rationale +
            agent_talking_points + customer_facing_response). Bulk-batch overnight, export to your LMS
            as scenario cards with verified citations. Net effect: new agent ramp drops from weeks to
            days because trainees see the right answer per scenario, sourced not paraphrased.
          </p>
        </Section>

        <Section id="legal" title="13. Legal & data handling">
          <ul style={{ paddingLeft: 20 }}>
            <li>
              <strong>Request bodies are not stored.</strong> We log endpoint, status, latency, your
              <Inline>case_reference</Inline> + <Inline>customer_id</Inline> (if you supplied them), and the
              primary cited statute. Never the scenario text or PII.
            </li>
            <li>
              <strong>Logs land in EU-region Supabase.</strong> No data crosses outside the EU/UK without your
              explicit Enterprise contract instruction.
            </li>
            <li>
              <strong>Idempotency keys</strong> are stored as SHA-256 hashes for 24 hours, then deleted.
            </li>
            <li>
              <strong>Citations come from a curated <Inline>legal_references</Inline> table maintained by Paybacker.</strong>
              The engine cannot fabricate an act or section number &mdash; it can only cite from that table.
              Anti-hallucination is structural, not a prompt-tuning concern. The same engine is exercised every
              day by paying consumers on the Paybacker.co.uk app, which functions as a continuous QA harness.
            </li>
            <li>
              <strong>The draft letter is a starting point.</strong> It is not legal advice. It should be reviewed
              by your team or counsel before sending under your brand. Paybacker is not a regulated legal service
              and does not represent your customers.
            </li>
            <li>
              <strong>Jurisdiction in v1 is UK only.</strong> Calls with <Inline>jurisdiction</Inline> set to
              anything else return 400. We don&rsquo;t pretend to know New York consumer law and we won&rsquo;t
              silently degrade when you send us one.
            </li>
            <li>
              <strong>Procurement-grade documentation</strong> available on request: data-flow diagram, sub-processor
              list, ISO 27001 mapping, ICO ROPA, DPIA template, Stripe / Vercel / Supabase / Anthropic sub-processor
              chain. Email <a style={{ color: TEXT }} href="mailto:business@paybacker.co.uk">business@paybacker.co.uk</a>.
            </li>
          </ul>
        </Section>

        <Section id="support" title="14. Support">
          <p>
            Email <a style={{ color: TEXT }} href="mailto:business@paybacker.co.uk">business@paybacker.co.uk</a> with
            your key prefix (the 8 hex chars after <Inline>pbk_</Inline>) and a <Inline>X-Request-Id</Inline> from a
            response header. Founder-level response within one working day while the API is in pilot; Enterprise
            customers have a Slack channel with same-business-day SLA.
          </p>
        </Section>

        <footer style={{ marginTop: 64, borderTop: `1px solid ${BORDER}`, paddingTop: 24, fontSize: 14, color: '#64748b' }}>
          <p>Paybacker LTD · Registered in the UK · <Link href="/for-business" style={{ color: '#64748b' }}>/for-business</Link> · <Link href="/for-business/coverage" style={{ color: '#64748b' }}>Coverage</Link> · <Link href="/dashboard/api-keys" style={{ color: '#64748b' }}>Customer portal</Link></p>
        </footer>
      </div>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 48, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>{title}</h2>
      <div style={{ marginTop: 12, color: '#334155' }}>{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ marginTop: 28, fontSize: 16, fontWeight: 600 }}>{children}</h3>;
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{ marginTop: 12, overflowX: 'auto', borderRadius: 8, background: '#0f172a', padding: 16, fontSize: 13, lineHeight: 1.55, color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
      <code>{children}</code>
    </pre>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 6px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em' }}>{children}</code>;
}

function Table({ children }: { children: React.ReactNode }) {
  return <table style={{ marginTop: 16, width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>{children}</table>;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', borderBottom: `1px solid ${BORDER}` }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 12px 8px 0', borderBottom: '1px solid #f1f5f9', color: MUTED, verticalAlign: 'top' }}>{children}</td>;
}
