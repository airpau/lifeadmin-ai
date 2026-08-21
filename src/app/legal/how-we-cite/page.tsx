import type { Metadata } from "next";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

/**
 * /legal/how-we-cite — public trust page for the citation guardrail.
 *
 * EDITING RULE FOR FUTURE SESSIONS
 * --------------------------------
 * Every sentence on this page is a factual claim about running code. It
 * exists because the FTC's finalised order against DoNotPay turned on
 * unsubstantiated claims about an AI's legal capability and an absence of
 * testing. A trust page that overstates is worse than no trust page.
 *
 * Before changing a word here, verify it against the implementation. The
 * load-bearing files are:
 *   - src/lib/legal-refs-authority.ts     (the allowlist + checkUkLegalAuthority)
 *   - src/lib/legal-refs-guardrail.ts     (freshness gate + post-flight sanitiser)
 *   - src/lib/legal-refs-auto-apply.ts    (evaluateCorrection — the gates)
 *   - src/app/api/complaints/generate/route.ts   (B2C retrieval + guardrail)
 *   - src/lib/b2b/disputes.ts                    (B2B retrieval + guardrail)
 *   - src/app/api/cron/compliance-sync/route.ts  (the daily chain)
 *   - src/app/api/cron/discover-legal-refs/route.ts (discovery → pending)
 *
 * Claims deliberately NOT made here, because they are not true of the
 * code as written — do not add them back without changing the code first:
 *   1. "No automated path changes a citation's source URL or verification
 *      status without founder approval." Untrue: refreshSingleRef in
 *      legal-refs-guardrail.ts, recover-url-dead, the legal-updates cron
 *      and verify-legal-refs all write those fields unattended. What IS
 *      true, and what this page says instead, is that no unattended path
 *      changes the LAW NAME or the SECTION — those need founder approval —
 *      and that a source URL is only ever replaced with one that
 *      checkUkLegalAuthority returns as reason==='authority'.
 *   2. Any response-time SLA on citation reports. Nothing measures one.
 *
 * Fixed on 16 Aug 2026, so these claims ARE now safe to make (they were
 * not before — see git history if you are auditing):
 *   - The guardrail scope. checkRefFreshness + the post-flight sanitiser
 *     now also run in src/lib/agents/dispute-reply-engine.ts, which is
 *     the single grounding path behind the Pocket Agent on WhatsApp and
 *     Telegram and the dashboard "Draft reply". The WhatsApp letter
 *     writer delegates to that engine; its own legal_references query is
 *     display-only (the "Cites:" preview line).
 *   - The authority gate on refreshSingleRef and recover-url-dead. Both
 *     now require reason==='authority', not merely .ok (which also
 *     admits the secondary list).
 *   - "Auto-applied changes are written to legal_ref_verifications."
 *     The insert now uses the real column names (ref_id / changes /
 *     notes) and logs loudly on failure instead of a bare catch.
 */

export const metadata: Metadata = {
  title: "How we cite the law — Paybacker LTD",
  description:
    "Where Paybacker's legal citations come from, which sources we accept and which we reject, the checks that run before a letter is produced, and what we do not claim.",
  alternates: { canonical: 'https://paybacker.co.uk/legal/how-we-cite' },
  openGraph: {
    title: 'How we cite the law — Paybacker LTD',
    description:
      'Citations come from a maintained store of UK legislation and regulator rules, restricted to an allowlist of official sources, and checked before a letter is produced.',
    url: 'https://paybacker.co.uk/legal/how-we-cite',
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'How we cite the law — Paybacker LTD',
    description:
      'Where our citations come from, which sources we reject, and what we do not claim.',
  },
};

const TOC = [
  { id: "summary", label: "1. In short" },
  { id: "where-citations-come-from", label: "2. Where citations come from" },
  { id: "authority-allowlist", label: "3. The source allowlist" },
  { id: "guardrail", label: "4. What runs before a letter" },
  { id: "corrections", label: "5. How corrections are made" },
  { id: "discovery", label: "6. How new citations get added" },
  { id: "not-claiming", label: "7. What we do not claim" },
  { id: "limitations", label: "8. Honest limitations" },
  { id: "report", label: "9. Report a citation" },
  { id: "contact", label: "10. Contact" },
];

export default function HowWeCitePage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="How we cite the law"
      dek="Paybacker's letters cite UK legislation and regulator rules. This page explains where those citations come from, which sources we refuse to use, what is checked before a letter is produced, and what we deliberately do not claim."
      dateLabel="Last updated 16 August 2026"
      toc={TOC}
      aside={{
        eyebrow: "Spotted a problem?",
        title: "Report a citation",
        description:
          "If a citation in a Paybacker letter looks wrong, email hello@paybacker.co.uk with the letter and what you think is incorrect.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="summary">1. In short</h2>
      <p>
        A letter is only as good as the law it cites, and an AI that invents
        statutes is worse than useless — it is actively harmful to the person
        sending it. So Paybacker does not let the model decide what the law
        says.
      </p>
      <ul>
        <li>
          Citations are <strong>retrieved from a maintained store</strong> of UK
          legislation and regulator rules and handed to the model. The model
          selects from that list and applies it to your facts; it is not asked
          to recall legislation from memory.
        </li>
        <li>
          Every citation must link to a source on an{" "}
          <strong>allowlist of official domains</strong>. Trade bodies, law-firm
          blogs, news sites and consumer aggregators are rejected, not cited.
        </li>
        <li>
          Before a letter is produced, the references being used are{" "}
          <strong>checked for freshness</strong>, and after it is written the
          text is <strong>scanned for citations we did not supply</strong>, which
          are replaced or removed.
        </li>
        <li>
          Changing what a citation <em>says</em> — the name of the Act, the
          section number — <strong>requires a person to approve it</strong>. No
          unattended process does that.
        </li>
        <li>
          We are not a law firm, we do not give legal advice, and we do not
          promise outcomes. See <a href="#not-claiming">section 7</a>.
        </li>
      </ul>
      <p>
        Our broader approach to sourcing and verification is set out in our{" "}
        <a href="/legal/methodology">Methodology</a>, and the commitments we hold
        ourselves to are in our <a href="/legal/ethics-code">Code of Ethics</a>.
      </p>

      <h2 id="where-citations-come-from">2. Where citations come from</h2>
      <p>
        Paybacker keeps a store of UK legal references — the Act or regulator
        rule, the relevant section, a plain-English summary, the source link,
        the escalation body, and a verification status recording when we last
        checked it and what we found.
      </p>
      <p>
        When you ask for a complaint letter, the system first works out the
        category of your dispute (energy, telecoms, consumer goods, credit, and
        so on), pulls the references stored against that category, and puts them
        into the prompt as a fixed list. The model is instructed to cite{" "}
        <em>only</em> from that list and not to invent statute names, section
        numbers or provisions. The same retrieval happens for the{" "}
        <code>/v1/disputes</code> API used by our business customers.
      </p>
      <p>
        References whose source link has stopped resolving are excluded from
        that list before the model ever sees them.
      </p>
      <p>
        This matters because the failure mode we are designing against is
        specific and well documented: language models produce citations that
        look right and are not. Retrieving from a maintained store removes the
        model&apos;s opportunity to guess. It does not remove it entirely, which
        is why there is also a check on the way out —{" "}
        <a href="#guardrail">section 4</a>.
      </p>

      <h2 id="authority-allowlist">3. The source allowlist</h2>
      <p>
        A correctly-stated statute is still unusable if it links somewhere a
        company&apos;s complaints team will not take seriously. So we maintain an
        explicit allowlist of domains a citation is allowed to point at. A URL
        must match one of these exactly, or be a genuine subdomain of one.
      </p>
      <p>Accepted:</p>
      <ul>
        <li>
          <strong>Primary legislation</strong> — legislation.gov.uk
        </li>
        <li>
          <strong>Government guidance</strong> — gov.uk and its subdomains,
          parliament.uk
        </li>
        <li>
          <strong>Statutory regulators</strong> — fca.org.uk (including
          handbook.fca.org.uk), ofcom.org.uk, ofgem.gov.uk, cma.gov.uk,
          ico.org.uk, caa.co.uk, orr.gov.uk
        </li>
        <li>
          <strong>Ombudsmen and approved ADR schemes</strong> —
          financial-ombudsman.org.uk, lgo.org.uk, spso.org.uk,
          ombudsman-services.org, ombudsman.wales
        </li>
        <li>
          <strong>Courts</strong> — judiciary.uk, supremecourt.uk, bailii.org
        </li>
        <li>
          <strong>Health</strong> — nhs.uk
        </li>
      </ul>
      <p>
        Two consumer-guidance sites — citizensadvice.org.uk and
        moneyhelper.org.uk — are treated as <strong>secondary</strong>. A
        proposal citing one of them is never applied automatically; it is forced
        to low confidence and flagged for human review, and it never silently
        replaces an existing citation.
      </p>
      <p>
        Everything else is <strong>refused</strong>. Trade associations, bank
        and insurer industry bodies, law-firm blogs, news and consumer-money
        media, and Wikipedia are commentary about the law, not the law. A
        proposal citing one of them is dropped — it is not queued for review,
        because there is nothing to review. Our discovery process drops them
        before they can become candidates, and our daily maintenance run
        automatically rejects any pending correction pointing at one.
      </p>
      <p>
        The domain matching is done on label boundaries, so a lookalike hostname
        such as <code>legislation.gov.uk.example.com</code> does not match{" "}
        <code>legislation.gov.uk</code>.
      </p>
      <p>
        If a genuine citation needs a source we have not allowlisted, the
        correct fix is to add the domain to the list after checking it — not to
        wave the citation through. That is a rule we apply to ourselves in the
        codebase.
      </p>

      <h2 id="guardrail">4. What runs before a letter</h2>
      <p>
        Two checks sit around the writing step. They apply to the complaint
        letter generator on this website, to the <code>/v1/disputes</code> API
        used by our business customers, and to the dispute-reply engine behind
        the assistant on WhatsApp and Telegram and the &ldquo;draft a
        reply&rdquo; button in your dashboard.
      </p>
      <p>
        <strong>Before writing — a freshness check.</strong> Every reference
        about to be put in front of the model is tested: does it have an
        acceptable verification status, has it been checked recently enough, and
        has it been marked superseded or broken? References that fail are not
        used blind. The system attempts a live re-check of the reference, and
        where that does not resolve it, it looks for a fresher substitute in the
        same legal category, then in legally adjacent categories, before falling
        back to the pan-sector statutes such as the Consumer Rights Act 2015.
        Where a reference is usable but older than we would like, the response
        carries a compliance warning rather than presenting it as fully current.
      </p>
      <p>
        <strong>After writing — a citation check.</strong> The finished text is
        scanned for references to UK statutes and regulators. Anything cited
        that was not in the list we supplied is treated as unverified: it is
        either replaced with the closest verified reference we did supply, or
        removed from the text, and the substitution is recorded as a warning on
        the result. This is the check that catches a plausible-looking invention
        such as a wrong year on an Act or a section number that does not exist.
      </p>
      <p>
        Both checks are designed to fail safe. If our own database is
        unreachable, the freshness check does not block your letter — it lets it
        through rather than leaving you stuck, and the post-writing citation
        check still runs.
      </p>
      <p>
        This is a check on sourcing and internal consistency. It is not a
        judgement that the law cited is the right law for your particular
        circumstances. Nothing automated can make that judgement, and we do not
        claim it does.
      </p>

      <h2 id="corrections">5. How corrections are made</h2>
      <p>
        The law moves. Sections are renumbered, guidance is reissued, regulators
        move pages. A daily maintenance run at 03:00 UTC works through the store
        of references: it tries to repair links that have stopped resolving,
        audits every stored source against the allowlist in{" "}
        <a href="#authority-allowlist">section 3</a>, looks for recent
        legislation, gathers supporting evidence for anything already flagged,
        automatically rejects proposals pointing at non-authority sources, and
        finally emails a punch list of what needs a human decision.
      </p>
      <p>
        <strong>Automated verifiers propose. They do not decide.</strong> A
        proposed change is written to a corrections queue with the before and
        after values, a risk score, and the evidence behind it.
      </p>
      <p>
        Whether a proposal can be applied without a person depends on what it
        would change:
      </p>
      <ul>
        <li>
          <strong>A link that has moved within the same official site</strong>{" "}
          — for example a page on legislation.gov.uk redirecting to its contents
          page — is applied automatically. The law name is identical, the
          hostname is identical, and the destination is on the allowlist, so no
          change to meaning is possible.
        </li>
        <li>
          <strong>Other low-risk mechanical changes</strong> — punctuation,
          capitalisation, an official page moving between government domains —
          are applied automatically only if all three of these hold: the change
          is scored low risk with supporting evidence attached; the text
          actually fetched from the proposed source corroborates both the
          proposed name and the proposed URL, or a redirect chain proves the old
          page now leads to the new one; and no semantic change is detected. If
          any one of the three fails, it goes to a person.
        </li>
        <li>
          <strong>Anything that changes what the citation says</strong> — a
          section number, a year, an Act renamed, a rule superseded, a change of
          jurisdiction — <strong>requires a founder approval click</strong>.
          There is no unattended path that renames a law or changes the section
          we cite.
        </li>
      </ul>
      <p>
        Automatically-applied changes are not invisible. They appear in an
        &ldquo;auto-applied&rdquo; panel in our admin dashboard alongside the
        before and after values, with a one-click revert that restores the
        previous law name, section and source URL.
      </p>
      <p>
        Separately from the corrections queue, routine maintenance does update
        two things unattended: the <strong>source link</strong> a reference
        points at, and its <strong>freshness status</strong> when the source
        stops responding or is found to have been superseded. Those changes
        affect where a citation points and whether we are willing to use it,
        not what it says.
      </p>
      <p>
        The link is the one an automated verifier could get wrong, so it is
        gated: a replacement URL is written only if it passes the allowlist in{" "}
        <a href="#authority-allowlist">section 3</a> as a primary official
        source. A proposed link that is not on that list, including the two
        secondary consumer-guidance sites, is refused and logged, and the
        stored link is left exactly as it was. There is no path, attended or
        unattended, by which a Paybacker citation comes to point at a law-firm
        blog or a news article.
      </p>

      <h2 id="discovery">6. How new citations get added</h2>
      <p>
        We look for new UK legislation and regulator material automatically, but
        discovery is never applied on its own. A discovered reference is written
        to a candidates queue as <strong>pending</strong>, and stays there until
        a person approves it. Candidates whose source fails the allowlist check
        are dropped at discovery and never reach the queue at all.
      </p>
      <p>
        When a candidate is approved it enters the reference store marked as
        needing verification — founder-approved but not yet independently
        checked — so it carries a lower confidence than a reference that has
        been through the full verification cycle.
      </p>

      <h2 id="not-claiming">7. What we do not claim</h2>
      <p>These are limits on what Paybacker is, not marketing caveats.</p>
      <ul>
        <li>
          <strong>We are not a law firm.</strong> Paybacker LTD is a technology
          company. No one drafting your letter is acting as your solicitor, and
          no solicitor-client relationship is created by using the product.
        </li>
        <li>
          <strong>We do not give legal advice.</strong> Paybacker helps you
          write your own correspondence and points you at the law that is likely
          to be relevant. That is general guidance applied to the information
          you gave us, not advice on your situation. For complex or high-value
          disputes, court proceedings, or anything where you are unsure, consult
          a qualified solicitor or Citizens Advice.
        </li>
        <li>
          <strong>We do not promise outcomes.</strong> We never state or imply
          that a dispute will succeed, that a refund will be paid, or that a
          particular sum will be recovered. Whether a company or a regulator
          agrees with you depends on facts and evidence we cannot see from a
          form.
        </li>
        <li>
          <strong>We do not claim the AI performs a lawyer&apos;s work.</strong>{" "}
          It retrieves, drafts and cites from a maintained source of law. It
          does not exercise legal judgement, and we do not present it as
          equivalent to a qualified adviser.
        </li>
        <li>
          <strong>We take no percentage of what you recover.</strong> Paybacker
          charges a flat subscription and never a success fee.
        </li>
      </ul>

      <h2 id="limitations">8. Honest limitations</h2>
      <p>Things that are true and that we would rather you heard from us.</p>
      <ul>
        <li>
          <strong>The law changes between our checks.</strong> Our maintenance
          run is daily. A statute amended today may take a cycle to be reflected,
          and material that requires human approval waits for that approval.
        </li>
        <li>
          <strong>The right law for you is a judgement call.</strong> A citation
          being current, correctly named and correctly linked does not make it
          the strongest argument in your circumstances. Read your letter before
          you send it.
        </li>
        <li>
          <strong>The guardrail is a sourcing check, not a legal opinion.</strong>{" "}
          The pre-writing freshness check and the post-writing citation check
          described in <a href="#guardrail">section 4</a> run on every path that
          drafts a letter for you: this website&apos;s generator, the{" "}
          <code>/v1/disputes</code> API, and the assistant on WhatsApp and
          Telegram. What they confirm is that a citation came from our
          maintained store and an official source, and that the finished text
          does not cite something we never supplied. They cannot confirm it is
          the right law for your circumstances. On the conversational surfaces
          we cap how long we will spend re-checking a reference live, so a
          reference we cannot re-check in time is substituted or dropped rather
          than used unchecked.
        </li>
        <li>
          <strong>Coverage is uneven.</strong> Our reference store is strongest
          in the sectors we serve most — energy, telecoms, consumer goods, air
          passenger rights, credit and debt. It is thinner elsewhere, and where
          we have no specific rule we fall back to the pan-sector statutes.
        </li>
        <li>
          <strong>Automated verification uses AI, and AI is fallible.</strong>{" "}
          That is precisely why the checks it can trigger on its own are limited
          to links and freshness status, why anything touching the substance of a
          citation needs a person, and why automatic changes are logged with a
          revert.
        </li>
      </ul>

      <h2 id="report">9. Report a citation</h2>
      <p>
        If a citation in a Paybacker letter looks wrong, out of date, or points
        somewhere it should not, tell us. Email{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a> with:
      </p>
      <ul>
        <li>the letter or dispute it appeared in, or a copy of the text;</li>
        <li>the citation you are querying — the Act or rule and the section;</li>
        <li>
          what you believe is wrong, and a link to the correct source if you
          have one.
        </li>
      </ul>
      <p>
        Reports go into the same corrections queue described in{" "}
        <a href="#corrections">section 5</a> and are reviewed by a person. If we
        confirm a citation is wrong, we correct the stored reference so it stops
        appearing in anyone else&apos;s letters, not just yours. We will tell you
        what we found either way.
      </p>
      <p>
        We would rather hear about a citation you are unsure of than have you
        send a letter you do not trust.
      </p>

      <h2 id="contact">10. Contact</h2>
      <p>
        Questions about anything on this page:{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
        Business and API enquiries:{" "}
        <a href="mailto:business@paybacker.co.uk">business@paybacker.co.uk</a>.
      </p>
      <p>
        Related reading: our <a href="/legal/methodology">Methodology</a> covers
        how we source and score primary material, and our{" "}
        <a href="/legal/ethics-code">Code of Ethics</a> covers the commitments we
        hold ourselves to when using generative AI on consumer correspondence.
      </p>
      <p>
        Paybacker LTD is registered in England &amp; Wales (company no.
        17107323).
      </p>
    </PostShell>
  );
}
