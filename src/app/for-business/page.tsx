import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import BuyButtons from './BuyButtons';
import './styles.css';

/**
 * /for-business — UK Consumer Rights API validation landing page.
 *
 * This page is a demand test, not a product. Visitors land, read the
 * positioning, and either join the waitlist or bounce. The waitlist
 * row goes into b2b_waitlist (separate from consumer waitlist_signups
 * because the lifecycle and fields differ).
 *
 * /api also routes here (next.config redirect) — `paybacker.co.uk/api`
 * is the natural URL fintech engineers will guess.
 *
 * Design intent: Stripe / Linear / Resend visual language, NOT the
 * consumer Paybacker look. Scoped under `.m-business-root` so styles
 * don't bleed onto the consumer surfaces.
 *
 * Decision criterion (founder-defined): if /for-business produces 10+
 * qualified signups (named UK fintech / platform with named use case)
 * in 30 days post-launch, green-light a real B2B build. Otherwise the
 * page gets archived and we move on.
 */

export const metadata: Metadata = {
  title: 'UK Consumer Rights API | Paybacker for Business',
  description:
    'Compliance-as-code for UK fintechs and platforms. Cite the right statute, draft the right response, escalate the right way — UK consumer law as a REST or MCP API.',
  alternates: { canonical: 'https://paybacker.co.uk/for-business' },
  openGraph: {
    title: 'UK Consumer Rights API — Paybacker for Business',
    description:
      'UK consumer-law reasoning as infrastructure. Statute citation, entitlement analysis, dispute drafts, escalation paths — for fintechs, neobanks, insurance and AI agent builders.',
    url: 'https://paybacker.co.uk/for-business',
    siteName: 'Paybacker',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

// Live example — a Section 75 chargeback ticket arriving at a UK
// neobank's CX queue. Shows the real shape: customer-supplied scenario
// text, the bank's own case_reference / customer_id echoed for CRM
// persistence, and a structured response their agents render straight
// into the disputes tool. Real CCA 1974 entitlement; don't fabricate.
const REQUEST_EXAMPLE = `POST /api/v1/disputes
Authorization: Bearer pbk_live_xxx
Content-Type: application/json
Idempotency-Key: tk_8f2c41b9-2026-04-28

{
  "scenario": "Customer raised a Section 75 dispute via in-app chat:
    'Paid £640 on my credit card to Acme Furniture for a sofa. It arrived
    damaged. The merchant has refused repair or refund and stopped
    replying. I want my money back.'",
  "case_reference": "ZD-89742",
  "customer_id": "cus_18b3a92f",
  "context": {
    "merchant": "Acme Furniture",
    "transaction_amount": 640.00,
    "payment_method": "credit_card",
    "purchase_date": "2026-03-12",
    "channel": "in_app_chat"
  },
  "channel": "webchat",
  "amount": 640
}`;

const RESPONSE_EXAMPLE = `200 OK
Content-Type: application/json
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9847

{
  "statute": "Consumer Credit Act 1974, s.75",
  "dispute_type": "finance",
  "regulator": "FCA / Financial Ombudsman Service",
  "entitlement": {
    "summary": "Equal claim against the card issuer for breach of contract by the supplier under s.75 CCA 1974.",
    "rationale": "Single transaction £100-£30,000 paid by credit card; debtor-creditor-supplier chain established; supplier in breach of s.9 CRA 2015 (satisfactory quality) and refusing remedy. Liability under s.75 is joint and several with the merchant.",
    "additional_rights": ["Consumer Rights Act 2015 s.20-24", "Consumer Credit Act 1974 s.75A"],
    "estimated_success": "high"
  },
  "customer_facing_response": "Thanks for raising this — under Section 75 of the Consumer Credit Act 1974 you have an equal claim against us as you do against Acme Furniture, because the purchase was £100-£30,000 on credit card. We're escalating this as a Section 75 claim and will refund £640 to your card if our investigation confirms the breach…",
  "agent_talking_points": [
    "Cited authority: Consumer Credit Act 1974, s.75",
    "Single transaction within £100-£30k threshold — s.75 applies",
    "Joint and several liability with merchant; we don't need to wait for them",
    "8-week final-response window before FOS escalation",
    "Statutory deadline applies — flag urgency."
  ],
  "claim_value_estimate": { "min": 384, "max": 640, "currency": "GBP" },
  "time_sensitivity": "high",
  "draft_letter_excerpt": "Re: Section 75 claim against Acme Furniture, transaction dated 12 March 2026, amount £640. Under section 75 of the Consumer Credit Act 1974 we as your card issuer have a like claim against the supplier, who has been afforded reasonable opportunity to remedy the breach…",
  "escalation_path": [
    { "step": 1, "to": "card_issuer_disputes", "wait_days": 14 },
    { "step": 2, "to": "Financial Ombudsman Service", "url": "https://www.financial-ombudsman.org.uk", "wait_days": 56 }
  ],
  "legal_references": ["Consumer Credit Act 1974, s.75", "Consumer Rights Act 2015, s.9"],
  "confidence": 0.92,
  "case_reference": "ZD-89742",
  "customer_id": "cus_18b3a92f"
}`;

const COVERED_LEGISLATION = [
  { name: 'Consumer Rights Act 2015', scope: 'goods, services, digital content' },
  { name: 'Consumer Credit Act 1974, s.75', scope: 'card protection on £100–£30k purchases' },
  { name: 'Package Travel and Linked Travel Arrangements Regulations 2018', scope: 'package holidays, ATOL' },
  { name: 'UK261 (retained EU 261/2004 as amended)', scope: 'flight delay and cancellation' },
  { name: 'Consumer Contracts Regulations 2013', scope: 'distance and off-premises sales, 14-day cooling-off' },
  { name: 'Financial Services and Markets Act 2000', scope: 'FCA-regulated firm complaints, FOS escalation' },
  { name: 'Data Protection Act 2018 / UK GDPR', scope: 'Subject Access Requests, ICO escalation' },
  { name: 'Electronic Communications Code & Ofcom General Conditions', scope: 'mid-contract price hikes, broadband and mobile' },
  { name: 'Energy retail rules (Ofgem licence conditions)', scope: 'energy switching, billing disputes' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is this the same engine that powers the Paybacker consumer app?',
    a: 'Yes — the same statute index, retrieval pipeline, entitlement reasoner, and letter generator. The B2B surface is a stable REST contract on top with bearer-token auth, monthly rate limits, audit logging, idempotency keys, and a customer portal. MCP is on the roadmap for Growth tier customers.',
  },
  {
    q: 'How do you keep the statute index current?',
    a: 'A daily legal-monitoring cron watches legislation.gov.uk, FCA / Ofcom / Ofgem / CAA / ORR publications, and the Financial Ombudsman Service decision feed. Every reference is reviewed and the engine’s verification_status field flips to current / updated / superseded. The published /coverage page reflects what the engine actually grounds against today — it cannot drift from production.',
  },
  {
    q: 'How do I get notified when a statute the engine cites changes?',
    a: 'Subscribe to the statute.updated webhook event from your customer portal. The legal-monitoring cron fires it within 24 hours of a material change being verified, with the affected category + a diff of what changed. Compliance teams use it to drive their own internal review workflow.',
  },
  {
    q: 'What about case law?',
    a: 'The engine cites primary statute and regulator guidance as the grounding authority. Persuasive case authorities are surfaced in the rationale only where they materially change the entitlement (e.g. Wakefield v Loganair on UK261 extraordinary circumstances). We do not generate untested legal positions — if a scenario doesn’t map to a verified reference, the API returns 422 NO_STATUTE_MATCH instead of guessing.',
  },
  {
    q: 'How is this different from wrapping GPT / Claude / Gemini in a prompt?',
    a: 'A generic LLM hallucinates UK statute citations — cites repealed acts, invents thresholds, confuses England with Scotland. Anti-hallucination here is structural: every citation is pulled from a curated table BEFORE the model is prompted, the prompt instructs the model to ground only in those citations, and the response shape is parsed into typed fields. You get UK consumer-law reasoning that won’t embarrass your conduct team in front of the FCA, the FOS, or your own users.',
  },
  {
    q: 'Where does Paybacker store our data?',
    a: 'Request bodies are not stored. We log endpoint, status, latency, your case_reference and customer_id (if you supplied them), and the primary cited statute — never the scenario text or PII. Logs land in EU-region Supabase. Idempotency keys are stored hashed for 24h.',
  },
  {
    q: 'What about throughput and latency at scale?',
    a: 'p50 latency is 2-3s end-to-end, p95 is 4-5s, dominated by the LLM call. The engine is parallelisable up to your tier’s monthly cap; we don’t enforce per-second burst limits below 50 rps. Enterprise customers get dedicated tenant infrastructure to insulate against noisy-neighbour effects.',
  },
  {
    q: 'Can we self-host or run on-prem?',
    a: 'Email business@paybacker.co.uk — on-prem and dedicated VPC are supported under Enterprise contracts. Includes the statute index updated via signed delta releases.',
  },
];

export default function ForBusinessPage() {
  return (
    <div className="m-business-root">
      <Header />

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="m-business-hero">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Paybacker for Business · API</span>
          <h1>UK consumer-rights compliance, as an API.</h1>
          <p className="m-business-lead">
            Every consumer complaint that hits your CRM, helpdesk, claims pipeline,
            or AI agent — comes back grounded in current UK statute. Cited regulation,
            entitlement analysis, paste-ready customer reply, agent talking points,
            escalation path. One POST. Every sector. Audit-logged.
          </p>
          <div className="m-business-cta-row">
            <a href="#buy" className="m-business-cta">Get a key</a>
            <a href="/for-business/docs" className="m-business-cta-ghost">Read the docs</a>
            <a href="/for-business/coverage" className="m-business-cta-ghost">Statute coverage</a>
          </div>
        </div>
      </section>

      {/* ── The Problem ────────────────────────────────────── */}
      <section className="m-business-section">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">The problem</span>
          <h2>UK consumer-law compliance is the bottleneck nobody owns.</h2>
          <div className="m-business-card-grid">
            <ProblemCard title="Your CX team is searching CCA 1974 in another tab">
              Every Section 75 ticket, every back-billing dispute, every UK261 claim starts with an agent
              Googling the statute. Lean digital-CX teams (15–25 agents handling what 200-agent legacies
              handle) are the bottleneck and the audit risk. Conservative-by-default answers escalate
              to FOS, the Energy Ombudsman, CISAS, or POPLA — at 10× the cost.
            </ProblemCard>
            <ProblemCard title="Generic LLMs hallucinate UK statutes">
              GPT, Claude and Gemini cite repealed acts, invent thresholds, confuse England with
              Scotland, and quote the wrong CCA section to your customers. DoNotPay paid the FTC
              $193,000 in 2024 for over-claiming AI legal capability it couldn&rsquo;t deliver. The
              regulator-facing risk is real; the answer is structural anti-hallucination, not a
              better prompt.
            </ProblemCard>
            <ProblemCard title="Aveni and Voyc grade calls. They don't ground them.">
              UK call-monitoring AI (Aveni, Voyc) flags Consumer Duty breaches <em>after</em> an agent
              has already replied. Useful — but it requires a ground-truth reference layer to score
              against. We are that layer. Pair us with their QA and your agents are correct
              <em> at the moment of the reply</em>, not corrected next week in a coaching session.
            </ProblemCard>
            <ProblemCard title="Regulatory waves break monthly">
              FCA PS26/3 motor-finance redress. April-2026 BT/EE/Sky/Vodafone mid-contract rises
              under Ofcom&rsquo;s Jan-2025 inflation-link ban. Octopus&rsquo;s £1.5m back-billing
              settlement under SLC 21BA. DMCCA subscription regime due autumn 2026. Each wave puts a
              new statute under the microscope. We refresh the index daily; you don&rsquo;t maintain it.
            </ProblemCard>
            <ProblemCard title="Hiring legal-eng is slow and expensive">
              A senior consumer-law engineer plus the data work to maintain a statute index runs twelve
              months and a quarter of a million pounds before first deploy — and even then, you&rsquo;re
              one hire away from the index going stale. A licence here is &lt;5% of that, with the
              statute coverage maintained as a service.
            </ProblemCard>
            <ProblemCard title="QA harness comes free with the licence">
              Our consumer Paybacker app runs the same engine in production every day, against
              thousands of paying UK households writing real complaint letters. Every B2B call benefits
              from that QA harness — your prompt-wrapped LLM doesn&rsquo;t have one.
            </ProblemCard>
          </div>
        </div>
      </section>

      {/* ── Live Example ───────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt" id="example">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Live example · neobank Section 75 dispute</span>
          <h2>Inbound complaint from your CRM. Compliance-grounded response back in 2&ndash;4 seconds.</h2>
          <p className="m-business-sub">
            A Section 75 chargeback ticket hits your disputes queue. You POST the customer&rsquo;s message
            with your own <code>case_reference</code> and <code>customer_id</code>. The response comes
            back with the cited authority (CCA 1974 s.75), the entitlement analysis, a paste-ready
            customer reply, agent talking points your conduct team can sign off on, the FOS escalation
            path, and a structured claim-value estimate &mdash; all keyed to your ticket so your CRM
            persists the response without an out-of-band correlation step.
          </p>
          <div className="m-business-code-grid">
            <CodeBlock label="Request · from your Zendesk / Intercom / HubSpot integration" body={REQUEST_EXAMPLE} />
            <CodeBlock label="Response · render in your agent UI; persist to your audit log" body={RESPONSE_EXAMPLE} variant="response" />
          </div>
        </div>
      </section>

      {/* ── What's Inside ─────────────────────────────────── */}
      <section className="m-business-section">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">What's inside</span>
          <h2>The legislation index, encoded.</h2>
          <ul className="m-business-legislation">
            {COVERED_LEGISLATION.map((l) => (
              <li key={l.name}>
                <span className="m-business-leg-name">{l.name}</span>
                <span className="m-business-leg-scope">{l.scope}</span>
              </li>
            ))}
          </ul>
          <p className="m-business-footnote">
            Refreshed daily by an automated legal-monitoring cron — the published index is
            always the index the engine grounds against.{' '}
            Subscribe to the <code style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>statute.updated</code> webhook
            and your compliance team is notified within 24 hours of any material change to a
            statute, regulator code, or guidance note that the API can cite.
          </p>
        </div>
      </section>

      {/* ── Who It's For ──────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Who it's for</span>
          <h2>Built for product, claims, CX and compliance teams shipping UK consumer surfaces.</h2>
          <div className="m-business-segment-grid">
            <Segment
              title="Neobanks, BNPL & lenders"
              line="Section 75 chargeback triage at the agent UI. CCA 1974 disputed-credit handling. FOS-readiness scoring on every escalation. Statute-grounded responses your conduct team can sign off on."
            />
            <Segment
              title="Insurers, MGAs & warranty platforms"
              line="Wrongful-decline detection at first notification. FCA general insurance pricing-rule checks at renewal. FOS escalation pathing baked into the claims pipeline. Treating-Customers-Fairly evidence on every reply."
            />
            <Segment
              title="Energy, broadband, mobile retailers"
              line="Ofgem licence-condition compliance on billing disputes. 12-month back-billing detection. Ofcom GC C1 service credit calculations. Mid-contract CPI rise eligibility checks. Penalty-free-exit triage on cancellation flows."
            />
            <Segment
              title="Travel, OTAs & flight-delay claims"
              line="UK261 entitlement returned with the cited regulation, not a paraphrase. Distance-banded compensation, extraordinary-circumstances test, EU261 grandfathering, denied-boarding pathways. Same engine that drives the consumer self-serve claim."
            />
            <Segment
              title="CX automation, ticketing & helpdesk vendors"
              line="Embed in Zendesk, Intercom, HubSpot, Front, Gladly — every inbound consumer dispute returns the cited statute, agent talking points, and a paste-ready customer reply. Cuts AHT by 40-60% in early deployments."
            />
            <Segment
              title="AI agent builders & vertical copilots"
              line="UK-aware tool calls. The engine is exposed as MCP so a Claude / Gemini / GPT-class agent can ask for statute, entitlement, draft, and escalation in one round-trip — without paraphrasing law it doesn&rsquo;t know."
            />
          </div>
        </div>
      </section>

      {/* ── Customer portal ───────────────────────────────── */}
      <section className="m-business-section" id="portal">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Customer portal</span>
          <h2>An admin dashboard your CX, eng and security teams can actually use.</h2>
          <p className="m-business-prose" style={{ marginBottom: 28 }}>
            Every customer gets passwordless self-serve access to a full operations
            console — not a Notion page, not a support ticket, a real portal.
          </p>
          <div className="m-business-card-grid">
            <ProblemCard title="Live usage charts">
              30-day stacked-bar chart of OK vs error volume. Per-key usage bars colour-coded at 60% and 90%
              of the monthly cap. Stat row shows active keys, calls, errors, audit events at a glance.
            </ProblemCard>
            <ProblemCard title="Recent calls drill-down">
              Last 50 API calls with timestamp, key prefix, endpoint, HTTP status badge, latency, error
              code. Click any row for the full detail drawer. Filter by status, key, or free-text search.
            </ProblemCard>
            <ProblemCard title="Immutable audit log">
              Every key action (create, revoke, re-issue, reveal, sign-in) logged with actor (customer
              / founder / Stripe / system), IP address, user agent, full metadata JSON. Append-only.
              Forward-able to procurement.
            </ProblemCard>
            <ProblemCard title="Webhook configuration UI">
              Register HTTPS endpoints, choose events, get a signing secret shown ONCE at creation. Send
              test pings from the portal. Recent deliveries table with HTTP status + latency + error.
              5 consecutive failures auto-disable.
            </ProblemCard>
            <ProblemCard title="Self-serve key lifecycle">
              Re-issue (revokes old, mints new, plaintext shown once). Revoke (kills the key instantly).
              Full key history including revoked entries, with timestamps. No ticket required, no
              founder in the loop.
            </ProblemCard>
            <ProblemCard title="CSV export">
              Download usage and audit logs as CSV (5,000 rows per export). Plug into your own SIEM,
              compliance dashboard, or quarterly board pack without us in the way.
            </ProblemCard>
            <ProblemCard title="Team / multi-seat access">
              Invite teammates with admin or viewer roles. They sign in with their own work email,
              everyone sees the same account. Procurement, security, eng, and CX all in one place.
            </ProblemCard>
            <ProblemCard title="In-browser API explorer">
              Try POST /v1/disputes live with your own key. Inspect the full response, latency, and
              status code without leaving the portal. No Postman, no curl gymnastics.
            </ProblemCard>
            <ProblemCard title="Live status block + public /status">
              p50 / p95 latency and 24h uptime on the portal home, plus a public
              <a href="/status" className="m-business-link"> /status</a> page you can link to from procurement docs.
            </ProblemCard>
            <ProblemCard title="IP allow-listing (paid)">
              Restrict each Growth or Enterprise key to a list of source IPs. Calls from anywhere
              else return 403. Defence-in-depth for the keys your CX agents use.
            </ProblemCard>
            <ProblemCard title="Weekly email digest">
              Per-customer Monday digest with last 7 days of usage, errors, p95 latency, and
              per-key breakdown. Toggle off in the portal if you'd rather not receive.
            </ProblemCard>
          </div>
          <p className="m-business-footnote m-business-footnote--center">
            Sign in via passwordless 30-min one-time link — no Paybacker user account to create.
            Demo: <a href="/dashboard/api-keys" className="m-business-link">paybacker.co.uk/dashboard/api-keys</a>
          </p>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Pricing · indicative</span>
          <h2>Three tiers. Finalising with launch partners.</h2>
          <div className="m-business-pricing-grid">
            <PriceCard
              tier="Starter"
              price="Free"
              suffix=""
              description="A 1,000-call pilot. No card. Self-serve."
              features={['1,000 calls / month', 'REST endpoint', 'Statute index access', 'Email support']}
              ctaLabel="Get free key"
              ctaHref="#free-pilot"
            />
            <PriceCard
              tier="Growth"
              price="£499"
              suffix="/month"
              description="Production traffic. Subscribe and get a key in your inbox in seconds."
              features={['10,000 calls / month', 'REST endpoint', 'Webhook for statute updates', 'Email support']}
              featured
              ctaLabel="Subscribe — £499/mo"
              ctaHref="#buy-growth"
            />
            <PriceCard
              tier="Enterprise"
              price="£1,999"
              suffix="/month"
              description="100k calls + dedicated tenant + statute SLA + legal-engineering review."
              features={['100,000 calls / month', 'SLA + 24h statute updates', 'Dedicated tenant', 'Slack support']}
              ctaLabel="Subscribe — £1,999/mo"
              ctaHref="#buy-enterprise"
            />
          </div>
          <p className="m-business-footnote m-business-footnote--center">
            All tiers shown in GBP, monthly, exc. VAT. Cancel anytime via the customer portal.
          </p>
        </div>
      </section>

      {/* ── Founder Note ──────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt">
        <div className="m-business-wrap m-business-wrap--narrow">
          <span className="m-business-eyebrow">From the founder</span>
          <h2>This engine has been in production for months.</h2>
          <p className="m-business-prose">
            We built Paybacker — the UK consumer-rights AI assistant — to give households the
            ability to write a statutorily-grounded dispute letter in 30 seconds. The engine has
            been running in production, generating thousands of complaint letters citing the
            Consumer Rights Act 2015, Section 75, Package Travel Regs, UK261, and a long tail of
            sector-specific regulation.
          </p>
          <p className="m-business-prose">
            We are now opening the same engine to platforms that need UK consumer-law reasoning
            inside their own products — without rebuilding the statute index from scratch.
          </p>
        </div>
      </section>

      {/* ── Buy ───────────────────────────────────────────── */}
      <section className="m-business-section" id="buy">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Get a key</span>
          <h2>Pick a tier. Key in your inbox.</h2>
          <p className="m-business-sub">
            Starter is free and self-serve. Paid tiers go via Stripe Checkout — your key
            arrives by email within seconds of payment success.
          </p>
          <BuyButtons />
        </div>
      </section>

      {/* ── Bespoke (email-only — no waitlist) ────────────── */}
      <section className="m-business-section m-business-section--alt" id="bespoke">
        <div className="m-business-wrap m-business-wrap--narrow">
          <span className="m-business-eyebrow">Need something custom?</span>
          <h2>Talk to us directly.</h2>
          <p className="m-business-sub">
            For bespoke deployments, on-prem hosting, or volume above Enterprise — email{' '}
            <a href="mailto:business@paybacker.co.uk" className="m-business-link">business@paybacker.co.uk</a>{' '}
            and we will reply within 24 hours.
          </p>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt">
        <div className="m-business-wrap m-business-wrap--narrow">
          <span className="m-business-eyebrow">FAQ</span>
          <h2>Questions we get asked.</h2>
          <div className="m-business-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Header() {
  return (
    <header className="m-business-header">
      <div className="m-business-wrap m-business-header-row">
        <Link href="/" className="m-business-brand">
          Pay<span>backer</span>
          <span className="m-business-brand-divider">·</span>
          <span className="m-business-brand-product">Business</span>
        </Link>
        <nav>
          <a href="/for-business/docs">Docs</a>
          <a href="/for-business/coverage">Coverage</a>
          <a href="/dashboard/api-keys">Sign in</a>
          <a href="#buy" className="m-business-nav-cta">Get a key</a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="m-business-footer">
      <div className="m-business-wrap m-business-footer-row">
        <div>
          <Link href="/" className="m-business-footer-brand">Pay<span>backer</span></Link>
          <p className="m-business-footnote">Compliance-as-code for UK fintechs and platforms.</p>
        </div>
        <div className="m-business-footer-links">
          <Link href="/">Consumer app</Link>
          <Link href="/blog">Journal</Link>
          <Link href="/pricing">Consumer pricing</Link>
          <a href="mailto:business@paybacker.co.uk">business@paybacker.co.uk</a>
        </div>
      </div>
    </footer>
  );
}

function ProblemCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="m-business-problem-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function CodeBlock({ label, body, variant }: { label: string; body: string; variant?: 'response' }) {
  return (
    <div className={`m-business-code${variant === 'response' ? ' m-business-code--response' : ''}`}>
      <div className="m-business-code-label">{label}</div>
      <pre>
        <code>{body}</code>
      </pre>
    </div>
  );
}

function Segment({ title, line }: { title: string; line: string }) {
  return (
    <div className="m-business-segment">
      <h3>{title}</h3>
      <p>{line}</p>
    </div>
  );
}

function PriceCard({
  tier, price, suffix, description, features, featured, ctaLabel, ctaHref,
}: {
  tier: string;
  price: string;
  suffix: string;
  description: string;
  features: string[];
  featured?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className={`m-business-price-card${featured ? ' m-business-price-card--featured' : ''}`}>
      <h3>{tier}</h3>
      <div className="m-business-price">
        {price}<span>{suffix}</span>
      </div>
      <p className="m-business-price-desc">{description}</p>
      <ul>
        {features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <a href={ctaHref ?? '#waitlist'} className="m-business-price-cta">{ctaLabel ?? 'Join waitlist'}</a>
    </div>
  );
}
