/**
 * /for-business/docs — public API manual for /v1/disputes.
 *
 * Inline-styled to be format-safe regardless of which CSS context the
 * page is rendered in. No reliance on Tailwind being purged correctly.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API docs — Paybacker UK Consumer Rights API',
  description:
    'How to authenticate, call POST /v1/disputes, and parse the response. Worked examples for flight cancellation, Section 75, Ofcom and energy disputes.',
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

        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>UK Consumer Rights API — manual</h1>
        <p style={{ marginTop: 12, fontSize: 18, color: MUTED }}>
          One endpoint. Verified UK statute citations, structured entitlement, draft letter, escalation path. Built on the same engine that powers <a style={{ color: TEXT }} href="https://paybacker.co.uk">paybacker.co.uk</a>.
        </p>

        <ul style={{ marginTop: 40, padding: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: 14, color: MUTED }}>
          <li><a href="#getting-a-key" style={{ color: MUTED }}>1. Getting a key</a></li>
          <li><a href="#authentication" style={{ color: MUTED }}>2. Authentication</a></li>
          <li><a href="#endpoint" style={{ color: MUTED }}>3. POST /v1/disputes</a></li>
          <li><a href="#request" style={{ color: MUTED }}>4. Request schema</a></li>
          <li><a href="#response" style={{ color: MUTED }}>5. Response schema</a></li>
          <li><a href="#examples" style={{ color: MUTED }}>6. Worked examples</a></li>
          <li><a href="#errors" style={{ color: MUTED }}>7. Errors & status codes</a></li>
          <li><a href="#rate-limits" style={{ color: MUTED }}>8. Rate limits & tiers</a></li>
          <li><a href="#integration" style={{ color: MUTED }}>9. Integration patterns</a></li>
          <li><a href="#legal" style={{ color: MUTED }}>10. Legal & data handling</a></li>
          <li><a href="#support" style={{ color: MUTED }}>11. Support</a></li>
        </ul>

        <Section id="getting-a-key" title="1. Getting a key">
          <p>Request a key by filling the form at <Link href="/for-business" style={{ color: TEXT }}>paybacker.co.uk/for-business</Link>. Approved keys are issued within one working day. Each key starts with <Inline>pbk_</Inline> and is shown to you <strong>once</strong>. Store it as a secret. If lost, contact us to revoke and re-issue.</p>
        </Section>

        <Section id="authentication" title="2. Authentication">
          <p>Pass the key as a Bearer token on every request:</p>
          <Code>{`Authorization: Bearer pbk_<prefix>_<secret>`}</Code>
          <p>Anything else returns <Inline>401 Unauthorized</Inline>. Revoked, expired or rate-limited keys are also rejected at this layer — see <a href="#errors" style={{ color: TEXT }}>§7</a>.</p>
        </Section>

        <Section id="endpoint" title="3. POST /v1/disputes">
          <Code>{`POST https://paybacker.co.uk/api/v1/disputes`}</Code>
          <p>Send a JSON body describing a UK consumer dispute. Receive a structured response with the cited statute, entitlement, draft letter excerpt, escalation path, and a confidence score. Typical latency: <strong>2–4 seconds</strong> end-to-end.</p>
          <p>A <Inline>GET</Inline> on the same URL returns metadata (version, docs URL, supported endpoints). Useful as a health check.</p>
        </Section>

        <Section id="request" title="4. Request schema">
          <Code>{`{
  "scenario": string,            // required, ≥10 chars — describe the dispute in plain English
  "context"?: object,            // optional — pass {merchant, dates, refs, ...}
  "jurisdiction"?: "UK",         // optional, only "UK" is supported in v1
  "desired_outcome"?: string,    // optional — what the consumer wants
  "amount"?: number,             // optional — disputed amount in GBP
  "consumer_name"?: string       // optional — populates the draft letter
}`}</Code>
          <p>The richer the <Inline>scenario</Inline>, the better the citation. Name the merchant, the product, the date, what went wrong, and any prior contact.</p>
        </Section>

        <Section id="response" title="5. Response schema">
          <Code>{`{
  "statute": string,
  "entitlement": {
    "summary": string,
    "rationale": string,
    "additional_rights": string[],
    "estimated_success": "low" | "medium" | "high"
  },
  "draft_letter_excerpt": string,
  "escalation_path": [
    { "step": number, "to": string, "wait_days"?: number, "url"?: string }
  ],
  "legal_references": string[],
  "confidence": number
}`}</Code>
          <p>Shape is stable across statute domains — a UK261 case and a Section 75 case populate the same fields. Parse one schema, not many.</p>
        </Section>

        <Section id="examples" title="6. Worked examples">
          <H3>Flight cancellation (UK261)</H3>
          <Code>{`curl -X POST https://paybacker.co.uk/api/v1/disputes \\
  -H "Authorization: Bearer pbk_xxx_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "scenario": "Ryanair cancelled my flight LGW-DUB six hours before departure with no replacement and is refusing compensation. The flight was 1,500km.",
    "amount": 350,
    "desired_outcome": "EU261 compensation plus full refund"
  }'`}</Code>
          <p style={{ fontSize: 14, color: MUTED }}>Returns: statute = "Regulation (EC) No 261/2004", draft letter to Ryanair Customer Relations, escalation → carrier → CAA → ADR.</p>

          <H3>Section 75 chargeback (CCA 1974)</H3>
          <Code>{`{
  "scenario": "Customer paid £600 for a sofa on credit card via Acme Furniture, sofa arrived damaged, merchant refuses repair or refund.",
  "amount": 600,
  "desired_outcome": "Full refund via Section 75 claim"
}`}</Code>

          <H3>Broadband (Ofcom General Conditions)</H3>
          <Code>{`{
  "scenario": "Sky broadband speeds 60% below the minimum guaranteed in the contract for 3 weeks despite multiple support tickets.",
  "desired_outcome": "Penalty-free exit + service credit"
}`}</Code>

          <H3>Energy (Ofgem SLC)</H3>
          <Code>{`{
  "scenario": "British Gas back-billed customer £840 for usage 3 years ago in clear breach of the 12-month back-billing limit.",
  "amount": 840,
  "desired_outcome": "Bill cancelled per back-billing rules"
}`}</Code>
        </Section>

        <Section id="errors" title="7. Errors & status codes">
          <Table>
            <thead>
              <tr><Th>Status</Th><Th>Meaning</Th><Th>Recovery</Th></tr>
            </thead>
            <tbody>
              <tr><Td>200</Td><Td>Success</Td><Td>—</Td></tr>
              <tr><Td>400</Td><Td>Invalid JSON or scenario &lt; 10 chars</Td><Td>Fix payload, retry</Td></tr>
              <tr><Td>401</Td><Td>Missing / invalid / revoked key</Td><Td>Check token, request new key</Td></tr>
              <tr><Td>422</Td><Td>NO_STATUTE_MATCH — scenario didn’t map to a UK statute</Td><Td>Add detail (sector, dates, amount)</Td></tr>
              <tr><Td>429</Td><Td>Monthly limit reached</Td><Td>Wait until 1st of month or upgrade</Td></tr>
              <tr><Td>500</Td><Td>ENGINE_ERROR — transient failure</Td><Td>Retry with exponential backoff</Td></tr>
            </tbody>
          </Table>
        </Section>

        <Section id="rate-limits" title="8. Rate limits & tiers">
          <p>Every successful response includes:</p>
          <Code>{`X-RateLimit-Limit: <monthly cap for this key>
X-RateLimit-Remaining: <calls left this calendar month>`}</Code>
          <Table>
            <thead><tr><Th>Tier</Th><Th>Monthly calls</Th><Th>Indicative pricing</Th></tr></thead>
            <tbody>
              <tr><Td>Starter</Td><Td>1,000</Td><Td>Free pilot</Td></tr>
              <tr><Td>Growth</Td><Td>10,000</Td><Td>From £499/month</Td></tr>
              <tr><Td>Enterprise</Td><Td>100,000+</Td><Td>Talk to us</Td></tr>
            </tbody>
          </Table>
          <p style={{ fontSize: 14, color: MUTED }}>Counter resets at 00:00 UTC on the 1st of each month.</p>
        </Section>

        <Section id="integration" title="9. Integration patterns">
          <H3>CX agent assist</H3>
          <p>Trigger on every inbound complaint ticket. Surface the cited statute and draft letter inside the agent UI; the agent edits and sends rather than drafting from scratch. Typical handle-time reduction: <strong>40–60%</strong>.</p>
          <H3>Self-serve dispute resolution</H3>
          <p>Embed in your customer portal. User describes the problem, your front-end POSTs to /v1/disputes, you render the entitlement summary and let them download the draft letter.</p>
          <H3>Webhook / async pipeline</H3>
          <p>For batch jobs (e.g. nightly review of all open disputes), the API tolerates concurrent requests up to your tier’s cap. Latency is dominated by the LLM call — parallelise aggressively.</p>
        </Section>

        <Section id="legal" title="10. Legal & data handling">
          <ul style={{ paddingLeft: 20 }}>
            <li>Request bodies are not stored. We log endpoint, status, latency and (optionally) a coarse <Inline>scenario_kind</Inline> for debugging — never the scenario text or PII.</li>
            <li>Citations are pulled from a curated <Inline>legal_references</Inline> table maintained by Paybacker. The engine cannot fabricate an act or section number — it can only cite from that table.</li>
            <li>The draft letter is a <em>starting point</em>. It is not legal advice and should be reviewed by your team or counsel before sending. Paybacker is not a regulated legal service.</li>
            <li>Jurisdiction in v1 is UK only. Calls with <Inline>jurisdiction</Inline> set to anything else return 400.</li>
          </ul>
        </Section>

        <Section id="support" title="11. Support">
          <p>Email <a style={{ color: TEXT }} href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a> with your key prefix (the 8 hex chars after <Inline>pbk_</Inline>) and a request ID. Founder-level response within one working day while the API is in pilot.</p>
        </Section>

        <footer style={{ marginTop: 64, borderTop: `1px solid ${BORDER}`, paddingTop: 24, fontSize: 14, color: '#64748b' }}>
          <p>Paybacker LTD · Registered in the UK · <Link href="/for-business" style={{ color: '#64748b' }}>/for-business</Link> · <Link href="/" style={{ color: '#64748b' }}>paybacker.co.uk</Link></p>
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
