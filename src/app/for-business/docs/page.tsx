/**
 * /for-business/docs — public API manual for /v1/disputes.
 *
 * Linked from the for-business landing page and the API root JSON
 * blob. Plain HTML, no client JS — fast, easy to bookmark, printable.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API docs — Paybacker UK Consumer Rights API',
  description:
    'How to authenticate, call POST /v1/disputes, and parse the response. Worked examples for flight cancellation, Section 75, Ofcom and energy disputes.',
  alternates: { canonical: 'https://paybacker.co.uk/for-business/docs' },
};

export default function DocsPage() {
  return (
    <main className="m-business-root mx-auto max-w-3xl px-6 py-16 text-slate-900">
      <nav className="mb-10 text-sm text-slate-500">
        <Link href="/for-business" className="hover:text-slate-900">
          ← Back to /for-business
        </Link>
      </nav>

      <h1 className="text-4xl font-semibold tracking-tight">UK Consumer Rights API — manual</h1>
      <p className="mt-3 text-lg text-slate-600">
        One endpoint. Verified UK statute citations, structured entitlement, draft letter, escalation path.
        Built on the same engine that powers <a className="underline" href="https://paybacker.co.uk">paybacker.co.uk</a>.
      </p>

      {/* TOC */}
      <ul className="mt-10 grid gap-1 text-sm text-slate-600">
        <li><a href="#getting-a-key" className="hover:text-slate-900">1. Getting a key</a></li>
        <li><a href="#authentication" className="hover:text-slate-900">2. Authentication</a></li>
        <li><a href="#endpoint" className="hover:text-slate-900">3. POST /v1/disputes</a></li>
        <li><a href="#request" className="hover:text-slate-900">4. Request schema</a></li>
        <li><a href="#response" className="hover:text-slate-900">5. Response schema</a></li>
        <li><a href="#examples" className="hover:text-slate-900">6. Worked examples</a></li>
        <li><a href="#errors" className="hover:text-slate-900">7. Errors &amp; status codes</a></li>
        <li><a href="#rate-limits" className="hover:text-slate-900">8. Rate limits &amp; tiers</a></li>
        <li><a href="#integration" className="hover:text-slate-900">9. Integration patterns</a></li>
        <li><a href="#legal" className="hover:text-slate-900">10. Legal &amp; data handling</a></li>
        <li><a href="#support" className="hover:text-slate-900">11. Support</a></li>
      </ul>

      <Section id="getting-a-key" title="1. Getting a key">
        <p>
          Request a key by filling the form at{' '}
          <Link href="/for-business" className="underline">paybacker.co.uk/for-business</Link>.
          Approved keys are issued within one working day. Each key starts with{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">pbk_</code> and is shown to you
          <strong> once</strong>. Store it as a secret. If lost, contact us to revoke and re-issue.
        </p>
      </Section>

      <Section id="authentication" title="2. Authentication">
        <p>
          Pass the key as a Bearer token on every request:
        </p>
        <Code>{`Authorization: Bearer pbk_<prefix>_<secret>`}</Code>
        <p className="mt-3">
          Anything else returns <code>401 Unauthorized</code>. Revoked, expired or rate-limited
          keys are also rejected at this layer — see <a href="#errors" className="underline">§7</a>.
        </p>
      </Section>

      <Section id="endpoint" title="3. POST /v1/disputes">
        <Code>{`POST https://paybacker.co.uk/api/v1/disputes`}</Code>
        <p className="mt-3">
          Send a JSON body describing a UK consumer dispute. Receive a structured response with
          the cited statute, entitlement, draft letter excerpt, escalation path, and a confidence
          score. Typical latency: <strong>2–4 seconds</strong> end-to-end.
        </p>
        <p className="mt-3">
          A <code>GET</code> on the same URL returns metadata (version, docs URL, supported endpoints).
          Useful as a health check.
        </p>
      </Section>

      <Section id="request" title="4. Request schema">
        <Code>{`{
  "scenario": string,            // required, ≥10 chars — describe the dispute in plain English
  "context"?: object,            // optional — pass {merchant, dates, refs, ...}
  "jurisdiction"?: "UK",         // optional, only "UK" is supported in v1
  "desired_outcome"?: string,    // optional — what the consumer wants ("full refund", "rebooking + £520")
  "amount"?: number,             // optional — disputed amount in GBP
  "consumer_name"?: string       // optional — populates the draft letter
}`}</Code>
        <p className="mt-3">
          The richer the <code>scenario</code>, the better the citation. A good scenario names the
          merchant, the product/service, the date, what went wrong, and any prior contact with the
          merchant.
        </p>
      </Section>

      <Section id="response" title="5. Response schema">
        <Code>{`{
  "statute": string,             // primary UK statute or regulation
  "entitlement": {
    "summary": string,           // 1–4 sentence narrative of what the consumer is owed
    "rationale": string,         // why the cited statute applies
    "additional_rights": string[], // any concurrent rights worth flagging
    "estimated_success": "low" | "medium" | "high"
  },
  "draft_letter_excerpt": string, // first ~1,200 chars of a formal complaint letter
  "escalation_path": [             // ordered next steps if the merchant refuses
    { "step": number, "to": string, "wait_days"?: number, "url"?: string }
  ],
  "legal_references": string[],   // every act/section/regulation cited
  "confidence": number             // 0–1, how strongly the engine matched the scenario
}`}</Code>
        <p className="mt-3">
          The shape is stable across statute domains — a UK261 flight case and a Section 75
          chargeback both populate the same fields. Parse one schema, not many.
        </p>
      </Section>

      <Section id="examples" title="6. Worked examples">
        <h3 className="mt-6 font-semibold">Flight cancellation (UK261)</h3>
        <Code>{`curl -X POST https://paybacker.co.uk/api/v1/disputes \\
  -H "Authorization: Bearer pbk_xxx_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "scenario": "Ryanair cancelled my flight LGW-DUB six hours before departure with no replacement and is refusing compensation. The flight was 1,500km.",
    "amount": 350,
    "desired_outcome": "EU261 compensation plus full refund"
  }'`}</Code>
        <p className="mt-3 text-sm text-slate-600">
          Returns: <code>statute: "Regulation (EC) No 261/2004"</code>, draft letter to Ryanair Customer
          Relations, escalation path → carrier → CAA → ADR scheme.
        </p>

        <h3 className="mt-8 font-semibold">Section 75 chargeback (CCA 1974)</h3>
        <Code>{`{
  "scenario": "Customer paid £600 for a sofa on credit card via Acme Furniture, sofa arrived damaged, merchant refuses repair or refund.",
  "amount": 600,
  "desired_outcome": "Full refund via Section 75 claim"
}`}</Code>

        <h3 className="mt-8 font-semibold">Broadband (Ofcom General Conditions)</h3>
        <Code>{`{
  "scenario": "Sky broadband speeds 60% below the minimum guaranteed in the contract for 3 weeks despite multiple support tickets.",
  "desired_outcome": "Penalty-free exit + service credit"
}`}</Code>

        <h3 className="mt-8 font-semibold">Energy (Ofgem SLC)</h3>
        <Code>{`{
  "scenario": "British Gas back-billed customer £840 for usage 3 years ago in clear breach of the 12-month back-billing limit.",
  "amount": 840,
  "desired_outcome": "Bill cancelled per back-billing rules"
}`}</Code>
      </Section>

      <Section id="errors" title="7. Errors & status codes">
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Meaning</th>
              <th className="py-2">Recovery</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">200</td><td className="py-2 pr-4">Success</td><td className="py-2">—</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">400</td><td className="py-2 pr-4">Invalid JSON or scenario &lt; 10 chars</td><td className="py-2">Fix payload, retry</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">401</td><td className="py-2 pr-4">Missing / invalid / revoked key</td><td className="py-2">Check token, request new key</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">422</td><td className="py-2 pr-4"><code>NO_STATUTE_MATCH</code> — scenario didn’t map to a UK statute</td><td className="py-2">Add detail (sector, dates, amount)</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">429</td><td className="py-2 pr-4">Monthly limit reached</td><td className="py-2">Wait until 1st of month or upgrade</td></tr>
            <tr><td className="py-2 pr-4">500</td><td className="py-2 pr-4"><code>ENGINE_ERROR</code> — transient failure</td><td className="py-2">Retry with exponential backoff</td></tr>
          </tbody>
        </table>
      </Section>

      <Section id="rate-limits" title="8. Rate limits & tiers">
        <p>
          Every successful response includes:
        </p>
        <Code>{`X-RateLimit-Limit: <monthly cap for this key>
X-RateLimit-Remaining: <calls left this calendar month>`}</Code>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 pr-4">Tier</th>
              <th className="py-2 pr-4">Monthly calls</th>
              <th className="py-2">Indicative pricing</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">Starter</td><td className="py-2 pr-4">1,000</td><td className="py-2">Free pilot</td></tr>
            <tr className="border-b border-slate-100"><td className="py-2 pr-4">Growth</td><td className="py-2 pr-4">10,000</td><td className="py-2">From £499/month</td></tr>
            <tr><td className="py-2 pr-4">Enterprise</td><td className="py-2 pr-4">100,000+</td><td className="py-2">Talk to us</td></tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-slate-500">
          Counter resets at 00:00 UTC on the 1st of each month.
        </p>
      </Section>

      <Section id="integration" title="9. Integration patterns">
        <h3 className="mt-2 font-semibold">CX agent assist</h3>
        <p>
          Trigger on every inbound complaint ticket. Surface the cited statute and draft letter
          inside the agent UI; the agent edits and sends rather than drafting from scratch.
          Typical handle-time reduction: <strong>40–60%</strong> on disputes that touch UK statute.
        </p>
        <h3 className="mt-6 font-semibold">Self-serve dispute resolution</h3>
        <p>
          Embed in your customer portal. User describes the problem, your front-end POSTs to
          /v1/disputes, you render the entitlement summary and let them download the draft letter.
        </p>
        <h3 className="mt-6 font-semibold">Webhook / async pipeline</h3>
        <p>
          For batch jobs (e.g. nightly review of all open disputes), the API tolerates concurrent
          requests up to your tier’s cap. Latency is dominated by the LLM call — parallelise
          aggressively.
        </p>
      </Section>

      <Section id="legal" title="10. Legal & data handling">
        <ul className="list-disc pl-5">
          <li>Request bodies are not stored. We log endpoint, status, latency and (optionally) a coarse <code>scenario_kind</code> for debugging — never the scenario text or PII.</li>
          <li>Citations are pulled from a curated <code>legal_references</code> table maintained by Paybacker. The engine cannot fabricate an act or section number — it can only cite from that table.</li>
          <li>The draft letter is a <em>starting point</em>. It is not legal advice and should be reviewed by your team or counsel before sending. Paybacker is not a regulated legal service.</li>
          <li>Jurisdiction in v1 is UK only. Calls with <code>jurisdiction</code> set to anything else return 400.</li>
        </ul>
      </Section>

      <Section id="support" title="11. Support">
        <p>
          Email <a className="underline" href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>{' '}
          with your key prefix (the 8 hex chars after <code>pbk_</code>) and a request ID
          (any header from a recent response is fine). Founder-level response within one working day
          while the API is in pilot.
        </p>
      </Section>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <p>
          Paybacker LTD · Registered in the UK ·{' '}
          <Link href="/for-business" className="underline">/for-business</Link> ·{' '}
          <Link href="/" className="underline">paybacker.co.uk</Link>
        </p>
      </footer>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-2 text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}
