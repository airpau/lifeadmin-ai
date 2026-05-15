import type { Metadata } from "next";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

export const metadata: Metadata = {
  title: "Methodology — Paybacker LTD",
  description:
    "How Paybacker uses Find Case Law (TNA) records and other primary UK legal sources to ground AI-drafted complaint and dispute letters.",
  alternates: { canonical: "https://paybacker.co.uk/legal/methodology" },
};

const TOC = [
  { id: "overview", label: "1. Overview" },
  { id: "find-case-law", label: "2. How we use Find Case Law (TNA)" },
  { id: "citation-pipeline", label: "3. Citation pipeline" },
  { id: "relevance-scoring", label: "4. Relevance scoring" },
  { id: "ai-provider", label: "5. AI provider and data flow" },
  { id: "human-in-loop", label: "6. Human-in-loop review" },
  { id: "coverage-limits", label: "7. Find Case Law coverage limits" },
  { id: "verification", label: "8. Verification cadence" },
  { id: "auditability", label: "9. Auditability and corrections" },
  { id: "contact", label: "10. Contact" },
];

export default function LegalMethodologyPage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="Methodology"
      dek="How Paybacker retrieves, scores, cites and verifies primary UK legal sources — including Find Case Law (TNA) records — when drafting consumer complaint and dispute letters."
      dateLabel="Last updated 1 May 2026"
      toc={TOC}
      aside={{
        eyebrow: "Questions?",
        title: "Contact us about methodology",
        description:
          "Email hello@paybacker.co.uk with any methodology question — we respond within 5 working days.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="overview">1. Overview</h2>
      <p>
        Paybacker drafts pre-litigation complaint letters, escalation requests,
        cancellation emails and small-claims correspondence on behalf of UK
        consumers. Every drafted letter is grounded in primary UK legal sources —
        legislation, regulator guidance and reported case law — and every
        citation links back to the original record so the user (and any
        recipient of the letter) can verify it in full. This page explains how
        that pipeline works, in line with question 23 and question 27 of our
        Find Case Law (TNA) Computational Analysis Agreement application.
      </p>

      <h2 id="find-case-law">2. How we use Find Case Law (TNA)</h2>
      <p>
        Find Case Law records are retrieved via the public Atom feed at{" "}
        <a href="https://caselaw.nationalarchives.gov.uk">
          caselaw.nationalarchives.gov.uk
        </a>
        . Inside Paybacker, Find Case Law is treated as one canonical source
        through our internal source-router, alongside{" "}
        <a href="https://www.legislation.gov.uk">legislation.gov.uk</a> and
        published regulator guidance (Ofcom, Ofgem, FCA, CMA, ICO). We do not
        republish full judgment text. We extract the neutral citation, the
        court, the date, and a short ratio summary that describes the principle
        the judgment establishes for use in consumer disputes. The full record
        is always reachable via a back-link to the original judgment URL on
        caselaw.nationalarchives.gov.uk.
      </p>

      <h2 id="citation-pipeline">3. Citation pipeline</h2>
      <p>
        Every citation that appears in a Paybacker-drafted letter contains four
        elements:
      </p>
      <ul>
        <li>The neutral citation (e.g. <em>[2023] UKSC 1</em>) or statutory reference (e.g. <em>Consumer Rights Act 2015, s.49</em>).</li>
        <li>The court (for case law) or the issuing body (for legislation and regulator guidance).</li>
        <li>A short plain-English statement of the ratio or the relevant section.</li>
        <li>A back-link to the original record — caselaw.nationalarchives.gov.uk for judgments, legislation.gov.uk for statutes, the regulator&apos;s own domain for guidance.</li>
      </ul>
      <p>
        No citation is ever inserted into a draft without a verified
        back-link. The pre-send guardrail blocks any letter containing a
        citation that cannot be traced to an authority-listed source.
      </p>

      <h2 id="relevance-scoring">4. Relevance scoring</h2>
      <p>
        For each user dispute we identify the dispute type (e.g. broadband
        outage, energy overcharge, parking charge, flight delay, debt dispute)
        and match it to entries in our internal <code>legal_references</code>{" "}
        table. Candidates are then ranked using two signals:
      </p>
      <ul>
        <li>
          <strong>Primary-authority preference.</strong> Legislation outranks
          regulator guidance, which outranks reported case law, which outranks
          secondary commentary. Find Case Law records are surfaced when a
          decided case is the clearest authority for the consumer&apos;s claim
          (for example a Supreme Court decision on penalty clauses) or when
          legislation alone is ambiguous.
        </li>
        <li>
          <strong>Historical win rate.</strong> When we have at least five
          recorded outcomes for a given merchant × legal-reference pair, we
          weight that pair by its recovered-amount and resolved-in-user&apos;s-favour
          rate. With fewer than five outcomes, this signal is suppressed and
          ranking falls back to authority preference alone. The model still
          chooses based on the case facts — historical win rate is provided as
          context, not as an instruction.
        </li>
      </ul>

      <h2 id="ai-provider">5. AI provider and data flow</h2>
      <p>
        Drafting and analysis are performed by Anthropic Claude via{" "}
        <a href="https://api.anthropic.com">api.anthropic.com</a>. Paybacker
        LTD is the data controller. The prompt sent to Anthropic includes the
        user&apos;s dispute facts and the structured citation metadata (neutral
        citation, court, ratio summary, back-link). We do not pass full
        judgment text back to Anthropic, and the API is invoked under
        Anthropic&apos;s zero-retention commercial terms — no Paybacker traffic
        is used for model training.
      </p>

      <h2 id="human-in-loop">6. Human-in-loop review</h2>
      <p>
        Paybacker&apos;s AI proposes; the user approves before any letter is
        sent. The product never auto-sends a complaint, escalation or
        cancellation letter on a user&apos;s behalf. The autonomous Dispute
        Agent surfaces recommended next actions (escalate, await response,
        send follow-up) but a human click is required before any outbound
        communication is generated or transmitted. The AI also never writes
        the terminal canonical fields of a citation — corrections to a
        citation&apos;s name, source URL or status pass through a founder-reviewed
        corrections queue (see <a href="#auditability">section 9</a>).
      </p>

      <h2 id="coverage-limits">7. Find Case Law coverage limits</h2>
      <p>
        Find Case Law&apos;s coverage is limited to judgments published from
        April 2003 onwards. Not all judgments are included — historic case
        law, much of the lower-court output, and most unreported decisions
        are outside the collection. Where the relevant authority for a
        consumer&apos;s dispute predates 2003, sits in a court not currently
        published, or is otherwise outside Find Case Law&apos;s scope,
        Paybacker drafts the citation from an alternate primary source —
        legislation.gov.uk, regulator guidance (Ofcom General Conditions,
        Ofgem Standard Licence Conditions, FCA CONC, ICO guidance) or the
        relevant court&apos;s own published rules — and the drafted letter
        notes the alternate source explicitly. The user sees this caveat
        where it applies.
      </p>

      <h2 id="verification">8. Verification cadence</h2>
      <p>
        Citations are reverified on a rolling schedule:
      </p>
      <ul>
        <li>
          <strong>legislation.gov.uk references</strong> are checked daily for
          amendments, supersessions and repeal status.
        </li>
        <li>
          <strong>Non-legislation references</strong> (Find Case Law records,
          regulator guidance) are reverified weekly. A daily compliance-sync
          pipeline runs URL-liveness checks, authority-allowlist audits, and
          discovery of newly-published judgments and guidance.
        </li>
        <li>
          Any proposed change to a citation&apos;s name, URL or status is
          queued in <code>legal_ref_corrections</code> and reviewed by the
          founder before it touches the canonical record. Same-host redirect
          fixes within the authority allowlist may auto-apply (e.g.{" "}
          legislation.gov.uk/x/y → legislation.gov.uk/x/y/contents); semantic
          changes — section numbers, year changes, act renames — always
          require founder approval.
        </li>
      </ul>

      <h2 id="auditability">9. Auditability and corrections</h2>
      <p>
        Every decision the engine makes is preserved. The corrections queue
        records every proposed change to a citation, the source text that
        triggered it, the verifier that proposed it, and the founder&apos;s
        accept/reject click. A freshness-audit table records every
        verification check and its outcome. Together these tables form the
        audit trail behind any citation we serve. If you believe a citation
        in a Paybacker letter is incorrect or out of date, email{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a> and
        we will queue a correction within one working day.
      </p>

      <h2 id="contact">10. Contact</h2>
      <p>
        Methodology questions:{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
        Paybacker LTD is registered in England &amp; Wales (company no.
        15289174).
      </p>
    </PostShell>
  );
}
