import type { Metadata } from "next";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

export const metadata: Metadata = {
  title: "Code of Ethics — Paybacker LTD",
  description:
    "The de facto code of ethics governing Paybacker's AI-drafted consumer complaint letters: human-in-loop, source attribution, plain English, no terminal automation, GDPR posture, transparency and bias monitoring.",
  alternates: { canonical: "https://paybacker.co.uk/legal/ethics-code" },
};

const TOC = [
  { id: "overview", label: "1. Overview" },
  { id: "human-in-loop", label: "2. Human-in-loop" },
  { id: "source-attribution", label: "3. Source attribution" },
  { id: "no-republishing", label: "4. No republishing of judgment text" },
  { id: "plain-english", label: "5. Plain-English explanation" },
  { id: "no-terminal-outcomes", label: "6. No automated terminal outcomes" },
  { id: "corrections-queue", label: "7. Founder-reviewed corrections queue" },
  { id: "gdpr", label: "8. GDPR posture" },
  { id: "ai-transparency", label: "9. AI transparency" },
  { id: "bias-monitoring", label: "10. Bias monitoring" },
  { id: "contact", label: "11. Contact" },
];

export default function LegalEthicsCodePage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="Code of Ethics"
      dek="The principles that govern how Paybacker uses generative AI, primary UK legal sources, and user data when drafting consumer complaint and dispute letters."
      dateLabel="Last updated 1 May 2026"
      toc={TOC}
      aside={{
        eyebrow: "Questions?",
        title: "Raise an ethics concern",
        description:
          "Email hello@paybacker.co.uk and we will respond within 5 working days.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="overview">1. Overview</h2>
      <p>
        Paybacker drafts UK consumer complaint and dispute letters using
        generative AI grounded in primary legal sources. This document is the
        de facto code of ethics already operating inside the product — it
        describes commitments enforced in code, in process, or in published
        product behaviour, not aspirations. It corresponds to question 19 of
        the Find Case Law (TNA) Computational Analysis Agreement application.
      </p>

      <h2 id="human-in-loop">2. Human-in-loop</h2>
      <p>
        AI proposes, the user approves. Paybacker never auto-sends a complaint
        letter, escalation request, cancellation email, or small-claims draft.
        The autonomous Dispute Agent surfaces recommended next actions but
        always requires a user click before any outbound communication is
        generated or sent. Human approval is the load-bearing safeguard
        against AI error.
      </p>

      <h2 id="source-attribution">3. Source attribution</h2>
      <p>
        Every citation in a Paybacker letter links back to the original
        primary source — caselaw.nationalarchives.gov.uk for judgments,
        legislation.gov.uk for statutes, the regulator&apos;s own domain for
        guidance. The user, and any recipient of the drafted letter, can
        always verify a citation against the canonical record.
      </p>

      <h2 id="no-republishing">4. No republishing of judgment text</h2>
      <p>
        Paybacker does not republish the full text of any Find Case Law
        judgment. Drafted letters quote only the neutral citation, the court,
        and a short plain-English ratio summary, with a back-link to the
        original record. Aggregate citation lists or extracted-data feeds are
        not published.
      </p>

      <h2 id="plain-english">5. Plain-English explanation</h2>
      <p>
        Every formal legal reference in a Paybacker letter is paired with a
        plain-English explanation of what it means for the consumer&apos;s
        specific dispute. This is a deliberate accessibility choice:
        consumers should be able to read their own letter and understand it
        without legal training.
      </p>

      <h2 id="no-terminal-outcomes">6. No automated terminal outcomes</h2>
      <p>
        Paybacker&apos;s AI never decides whether a dispute is &ldquo;won&rdquo;
        or &ldquo;lost&rdquo;. The dispute outcome dataset captures
        won / partial / lost / withdrawn / timeout / still-open states only
        when the user (or in some cases an AI proposal that the user
        confirms) explicitly records them. The engine surfaces a suggested
        outcome with an evidence excerpt; the user has to click Confirm.
        Terminal outcomes are never auto-written.
      </p>

      <h2 id="corrections-queue">7. Founder-reviewed corrections queue</h2>
      <p>
        Citations drift — statutes are amended, regulator guidance is
        republished, judgments are superseded. Paybacker runs a daily
        compliance-sync pipeline that flags any citation whose source
        appears to have changed. Every proposed change is queued for
        founder review before the canonical record is updated. Semantic
        changes (section numbers, year changes, act renames, jurisdiction
        changes) always require founder approval; only same-host redirect
        fixes within the authority allowlist may auto-apply.
      </p>

      <h2 id="gdpr">8. GDPR posture</h2>
      <p>
        User data — account information, dispute facts, uploaded
        correspondence — is held under the UK GDPR. Paybacker LTD is the
        data controller. We do not extract, store or republish personal
        data from Find Case Law judgments. Citations reference cases by
        neutral citation, court and ratio only — names of parties, judges
        and witnesses appearing in the public record are not used as
        analytical inputs and are not stored beyond the citation itself.
        Full details of how we handle user data, including UK GDPR rights,
        are set out in our{" "}
        <a href="/privacy-policy">Privacy Policy</a>.
      </p>

      <h2 id="ai-transparency">9. AI transparency</h2>
      <p>
        Paybacker&apos;s use of generative AI is disclosed explicitly in
        marketing pages and in the onboarding flow. Inside the product,
        every AI-drafted letter is presented to the user as an AI-assisted
        draft requiring their review before sending. The AI provider
        (Anthropic Claude) and the human-in-loop review step are described
        in our <a href="/legal/methodology">Methodology</a> page.
      </p>

      <h2 id="bias-monitoring">10. Bias monitoring</h2>
      <p>
        We run a monthly sample audit of cited authorities to check that
        the engine is not over-relying on a narrow set of citations or
        skewing dispute outcomes by demographic factors. A quarterly
        summary records the audit findings, any corrections applied, and
        any changes to the relevance-scoring policy. Findings that would
        affect cited authorities feed directly into the corrections queue
        described in section 7.
      </p>

      <h2 id="contact">11. Contact</h2>
      <p>
        Ethics questions, concerns, or proposed corrections:{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
        Paybacker LTD is registered in England &amp; Wales (company no.
        15289174).
      </p>
    </PostShell>
  );
}
