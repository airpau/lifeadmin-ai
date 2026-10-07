import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

export const metadata: Metadata = {
  title: "Security | Paybacker LTD",
  description:
    "How Paybacker protects your data: read-only bank connections through an FCA authorised provider, encryption in transit and at rest, UK data storage, strict access controls and how to report a security issue.",
  alternates: { canonical: "https://paybacker.co.uk/legal/security" },
  openGraph: {
    title: "Security | Paybacker LTD",
    description:
      "Read-only bank connections, encryption, UK data storage and strict access controls. How Paybacker keeps your data safe.",
    url: "https://paybacker.co.uk/legal/security",
    siteName: "Paybacker",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Security | Paybacker LTD",
    description: "How Paybacker keeps your data safe.",
  },
};

const TOC = [
  { id: "overview", label: "1. Overview" },
  { id: "bank-connections", label: "2. Bank connections" },
  { id: "encryption", label: "3. Encryption" },
  { id: "where-data-lives", label: "4. Where your data lives" },
  { id: "access", label: "5. Who can see your data" },
  { id: "development", label: "6. How we build and change the service" },
  { id: "suppliers", label: "7. Our suppliers" },
  { id: "incidents", label: "8. If something goes wrong" },
  { id: "report", label: "9. Reporting a security issue" },
];

export default function LegalSecurityPage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="How we protect your data"
      dek="You trust us with your bills, your emails and your bank transactions. This page explains, in plain English, how we keep that information safe."
      dateLabel="Last updated 7 October 2026"
      toc={TOC}
      aside={{
        eyebrow: "Found a problem?",
        title: "Report a security issue",
        description:
          "Email hello@paybacker.co.uk with “Security” in the subject line. We treat every report as urgent.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="overview">1. Overview</h2>
      <p>
        Paybacker LTD (company number 17107323, ICO registration ZC111084)
        follows a written information security policy, owned by the director
        and reviewed at least once a year and after any significant change.
        The main points are below.
      </p>

      <h2 id="bank-connections">2. Bank connections</h2>
      <ul>
        <li>
          We connect to your bank through Yapily Connect Ltd, which is
          authorised and regulated by the Financial Conduct Authority.
        </li>
        <li>
          You log in on your own bank&apos;s screen. We never see or store your
          bank username or password.
        </li>
        <li>
          Access is read only. Paybacker cannot move money or make payments
          from your account.
        </li>
        <li>
          Your consent lasts 90 days, after which you choose whether to renew
          it. You can disconnect a bank at any time from your account.
        </li>
      </ul>

      <h2 id="encryption">3. Encryption</h2>
      <ul>
        <li>All traffic to paybacker.co.uk uses HTTPS with TLS 1.2 or higher.</li>
        <li>Data stored in our database is encrypted at rest (AES-256).</li>
        <li>
          Bank connection tokens and email account access tokens get a second
          layer of encryption inside our application (AES-256-GCM), with a
          fresh random value for every record, so no two are encrypted the
          same way.
        </li>
      </ul>

      <h2 id="where-data-lives">4. Where your data lives</h2>
      <p>
        Our database runs on Supabase in London (AWS eu-west-2) with automated
        daily backups. The website runs on Vercel. Both hold independent SOC 2
        Type II security reports. We have no servers or office network of our
        own to attack.
      </p>

      <h2 id="access">5. Who can see your data</h2>
      <ul>
        <li>
          Every customer table has row level security switched on, so a signed
          in user can only ever reach their own records.
        </li>
        <li>
          Access to our production systems is limited to named accounts, every
          one protected by multi factor authentication. We never use shared
          logins.
        </li>
        <li>
          Anyone else who needs access for a specific job gets the minimum
          needed, for a fixed period, and it is removed when the job ends.
        </li>
        <li>
          Passwords, keys and tokens are never written to logs or sent by
          email or chat.
        </li>
      </ul>

      <h2 id="development">6. How we build and change the service</h2>
      <ul>
        <li>
          Code changes are made on separate branches, checked and reviewed
          before they go live, and every release can be rolled back.
        </li>
        <li>Real customer data is never used for testing.</li>
        <li>
          Our Gmail integration completed Google&apos;s CASA Tier 2 independent
          security assessment in April 2026.
        </li>
      </ul>

      <h2 id="suppliers">7. Our suppliers</h2>
      <p>
        Suppliers that handle customer data do so under written contracts and
        data processing agreements, and we review them every year. They are
        Supabase (database and sign in), Vercel (hosting), Yapily Connect
        (bank connections), Stripe (payments), Anthropic (AI reading of
        documents and drafting of letters), Resend (email delivery) and PostHog
        (product analytics). Our{" "}
        <Link href="/privacy-policy">privacy policy</Link> has the full detail.
      </p>

      <h2 id="incidents">8. If something goes wrong</h2>
      <p>
        We have a written incident response and data breach procedure. If a
        breach puts your personal data at risk, we will tell the Information
        Commissioner&apos;s Office within 72 hours where the law requires it,
        and tell you without undue delay, including what happened and what you
        can do.
      </p>

      <h2 id="report">9. Reporting a security issue</h2>
      <p>
        If you think you have found a security problem with Paybacker, please
        email{" "}
        <a href="mailto:hello@paybacker.co.uk?subject=Security">hello@paybacker.co.uk</a>{" "}
        with &ldquo;Security&rdquo; in the subject line. Please do not access
        other people&apos;s data or disrupt the service while testing. We will
        acknowledge your report quickly and keep you updated.
      </p>
    </PostShell>
  );
}
