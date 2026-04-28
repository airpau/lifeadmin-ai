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

// Live example payload — keep this real. UK261 entitles £220 for a
// short-haul flight cancelled <14 days before departure when the
// airline is at fault. Don't fabricate amounts or statutes.
const REQUEST_EXAMPLE = `POST /v1/disputes
Content-Type: application/json

{
  "scenario": "Flight cancelled 2 hours before departure",
  "context": {
    "departure_airport": "LHR",
    "arrival_airport": "BCN",
    "carrier_country": "ES",
    "ticket_class": "economy",
    "distance_km": 1138,
    "cancellation_reason": "operational",
    "rebooked_arrival_delay_hours": 6
  },
  "jurisdiction": "UK"
}`;

const RESPONSE_EXAMPLE = `200 OK
Content-Type: application/json

{
  "statute": "UK261 (retained EU 261/2004 as amended)",
  "entitlement": {
    "compensation_gbp": 220,
    "rationale": "Short-haul (<1500km), cancelled <14 days, EU carrier, UK departure. Operational cancellation does not meet the 'extraordinary circumstances' threshold.",
    "additional_rights": ["meals_and_refreshments", "rebooking_or_refund"]
  },
  "draft_letter_excerpt": "Under UK Regulation 261/2004 as retained, I am entitled to compensation of £220 for the cancellation of flight [number] on [date]. The 14-day notification window was not met and the operational reason cited does not meet the extraordinary-circumstances exemption…",
  "escalation_path": [
    { "step": 1, "to": "carrier_claims_team", "wait_days": 14 },
    { "step": 2, "to": "CAA — Consumer Protection Group", "url": "https://www.caa.co.uk/passengers" },
    { "step": 3, "to": "Alternative Dispute Resolution scheme", "wait_days": 56 }
  ],
  "confidence": 0.94
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
    a: 'Yes. The same statute index, entitlement reasoner, and letter generator. The B2B surface is a thin REST and MCP layer on top with rate limits, audit logging, and a per-tenant context.',
  },
  {
    q: 'Do you offer MCP?',
    a: 'Yes, on the Growth tier and above. The same engine is exposed as MCP tool calls so an LLM agent can ask for statute, entitlement, draft, and escalation in one round trip.',
  },
  {
    q: 'How do you keep the statute index current?',
    a: 'We watch the legislation.gov.uk feed plus regulator publications (Ofcom, Ofgem, FCA, CAA). Material changes flow into the engine within 7 days, with an Enterprise SLA that tightens this to 24 hours.',
  },
  {
    q: 'What about case law?',
    a: 'The engine cites primary statute and regulator guidance. Persuasive case authorities are surfaced where they materially change the entitlement (e.g. Wakefield v Logan-Air on UK261 extraordinary circumstances). We do not generate untested legal positions.',
  },
  {
    q: 'When does it launch?',
    a: 'Public launch depends on signup demand. Waitlist members receive a private design partner offer if their use case is a strong fit, ahead of general availability.',
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
          <h1>UK Consumer Rights, as an API.</h1>
          <p className="m-business-lead">
            Cite the right statute. Draft the right response. Escalate the right way.
            Built on UK consumer legislation, kept current, available as REST or MCP.
          </p>
          <div className="m-business-cta-row">
            <a href="#buy" className="m-business-cta">Get a key</a>
            <a href="/for-business/docs" className="m-business-cta-ghost">Read the docs</a>
            <a href="#example" className="m-business-cta-ghost">See an example</a>
          </div>
        </div>
      </section>

      {/* ── The Problem ────────────────────────────────────── */}
      <section className="m-business-section">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">The problem</span>
          <h2>Consumer law inside a product is a hard build.</h2>
          <div className="m-business-card-grid">
            <ProblemCard title="Your support team isn't a law firm">
              Front-line agents handle thousands of consumer queries weekly. Without statutory grounding,
              answers are conservative-by-default and customers escalate.
            </ProblemCard>
            <ProblemCard title="Generic LLMs hallucinate statutes">
              Out-of-the-box models cite repealed acts, invent thresholds, and confuse English law with
              Scots law. Production-grade UK reasoning needs ground truth.
            </ProblemCard>
            <ProblemCard title="Hiring legal eng is slow and expensive">
              A senior consumer-law engineer plus the data work to maintain a statute index can run
              twelve months and a quarter-million pounds before first deploy.
            </ProblemCard>
          </div>
        </div>
      </section>

      {/* ── Live Example ───────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt" id="example">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Live example</span>
          <h2>One scenario in. Statute, entitlement, draft, escalation out.</h2>
          <p className="m-business-sub">
            Real UK261 entitlement returned with primary citation. The draft excerpt and escalation path are
            the same artefacts the consumer Paybacker app uses every day.
          </p>
          <div className="m-business-code-grid">
            <CodeBlock label="Request" body={REQUEST_EXAMPLE} />
            <CodeBlock label="Response" body={RESPONSE_EXAMPLE} variant="response" />
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
            Coverage is reviewed quarterly. Enterprise customers receive material-change webhooks within
            24 hours of a regulatory update going live.
          </p>
        </div>
      </section>

      {/* ── Who It's For ──────────────────────────────────── */}
      <section className="m-business-section m-business-section--alt">
        <div className="m-business-wrap">
          <span className="m-business-eyebrow">Who it's for</span>
          <h2>Built for product teams that ship UK consumer surfaces.</h2>
          <div className="m-business-segment-grid">
            <Segment
              title="Neobanks and challenger banks"
              line="Section 75 chargeback triage, FCA dispute readiness, refund eligibility scoring."
            />
            <Segment
              title="Insurance and warranty platforms"
              line="Claims with statutory backing, repair-or-replace decisioning, FOS escalation paths."
            />
            <Segment
              title="Cashback and comparison sites"
              line="Consumer query handling, mid-contract price-hike rights, switching entitlement."
            />
            <Segment
              title="AI agent builders"
              line="UK-aware tool calls. The engine ships as MCP so agents can reason about statute, not paraphrase."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section className="m-business-section">
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
          <a href="#example">Example</a>
          <a href="#waitlist" className="m-business-nav-cta">Join waitlist</a>
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
