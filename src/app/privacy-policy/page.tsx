import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../blog/_shared";
import "../blog/styles.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Paybacker LTD",
  description:
    "How Paybacker LTD collects, uses and protects your personal data under UK GDPR.",
};

const TOC = [
  { id: "who-we-are", label: "1. Who we are" },
  { id: "data-we-collect", label: "2. Data we collect" },
  { id: "how-we-use", label: "3. How we use your data" },
  { id: "data-storage", label: "4. Data storage" },
  { id: "data-sharing", label: "5. Data sharing" },
  { id: "affiliate-disclosure", label: "6. Affiliate disclosure" },
  { id: "retention", label: "7. Data retention and deletion" },
  { id: "cookies", label: "8. Cookies" },
  { id: "your-rights", label: "9. Your rights" },
  { id: "changes", label: "10. Changes to this policy" },
  { id: "contact", label: "11. Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <PostShell
      category="Legal"
      title="Privacy Policy"
      dek="How Paybacker LTD collects, uses and protects your personal data under the UK GDPR."
      dateLabel="Last updated March 2026"
      toc={TOC}
      aside={{
        eyebrow: "Questions?",
        title: "Contact our privacy team",
        description:
          "Email hello@paybacker.co.uk with any privacy question — we respond within 30 days.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="who-we-are">1. Who we are</h2>
      <p>
        Paybacker LTD (&ldquo;Paybacker&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
        &ldquo;our&rdquo;) is a company registered in the United Kingdom. We
        operate the website <a href="https://paybacker.co.uk">paybacker.co.uk</a>{" "}
        and provide AI-powered bill analysis and savings recommendation services.
      </p>
      <p>
        For any privacy-related enquiries, you can contact us at{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
      </p>

      <h2 id="data-we-collect">2. Data we collect</h2>
      <p>We collect the following categories of personal data:</p>
      <div className="callout">
        <div className="label">Account information</div>
        <p style={{ margin: 0 }}>
          Your name, email address and password when you create an account.
        </p>
      </div>
      <div className="callout">
        <div className="label">Email data (with your consent)</div>
        <p style={{ margin: 0 }}>
          Read-only access to your Gmail or Outlook inbox to identify bills,
          contracts and renewal notices. We only read emails relevant to
          household bills and subscriptions.
        </p>
      </div>
      <div className="callout">
        <div className="label">Banking data (with your consent)</div>
        <p style={{ margin: 0 }}>
          Read-only access to your bank transactions via Open Banking (powered by
          Yapily, FCA-regulated) to identify recurring payments and spending
          patterns. We can never move your money or make payments on your behalf.
        </p>
      </div>

      <h2 id="how-we-use">3. How we use your data</h2>
      <p>
        We use your personal data solely to provide and improve our savings
        identification service. Specifically, we use your data to:
      </p>
      <ul>
        <li>Identify bills, subscriptions and recurring payments.</li>
        <li>Analyse your current tariffs and contracts against available market deals.</li>
        <li>Surface personalised switching recommendations in your dashboard.</li>
        <li>
          Send you alerts when contract end dates are approaching or better deals
          become available.
        </li>
        <li>Provide customer support and respond to your enquiries.</li>
      </ul>
      <p>
        Our legal basis for processing is your consent (for email and banking
        data) and legitimate interest (for account management and service
        delivery).
      </p>

      <h2 id="data-storage">4. Data storage</h2>
      <p>
        Your data is stored securely in Supabase, our database provider, which
        hosts data on encrypted servers within the UK and EU. All data is
        encrypted in transit (TLS) and at rest. We follow industry best practices
        for access control and regularly review our security measures.
      </p>

      <h2 id="data-sharing">5. Data sharing</h2>
      <p>
        We do not sell, rent or trade your personal data to any third party. We
        may share limited data with the following categories of service
        providers, solely to operate our platform:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database hosting and authentication.
        </li>
        <li>
          <strong>Stripe</strong> — payment processing (we never see or store
          your full card details).
        </li>
        <li>
          <strong>Yapily</strong> — Open Banking data access (read-only bank
          transactions).
        </li>
        <li>
          <strong>Resend</strong> — transactional email delivery.
        </li>
      </ul>

      <h2 id="affiliate-disclosure">6. Affiliate disclosure</h2>
      <div className="callout">
        <div className="label">How we make money</div>
        <p style={{ margin: 0 }}>
          Paybacker earns referral commissions when you switch to a new provider
          through links on our platform. These are paid by the provider, not by
          you. This does <strong>not</strong> affect the price you pay — you will
          always pay the same price as if you had gone directly to the provider.
          Our recommendations are based on genuine savings potential for you, and
          we clearly disclose all affiliate relationships.
        </p>
      </div>

      <h2 id="retention">7. Data retention and deletion</h2>
      <p>
        We retain your personal data for as long as your account is active or as
        needed to provide our services. If you close your account, we will delete
        your personal data within 30 days, except where we are legally required
        to retain it (for example, financial records for tax purposes).
      </p>
      <p>
        You can request deletion of your data at any time by emailing{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>. We will
        process your request within 30 days.
      </p>

      <h2 id="cookies">8. Cookies</h2>
      <p>
        We use cookies and similar technologies on our website. These fall into
        two categories:
      </p>
      <ul>
        <li>
          <strong>Essential cookies</strong> — required for the website to
          function (authentication, session management). These cannot be
          disabled.
        </li>
        <li>
          <strong>Analytics cookies</strong> — we use PostHog and Google
          Analytics to understand how visitors use our website so we can improve
          it. These are only set with your consent.
        </li>
      </ul>
      <p>
        For full detail including every third-party service we use, see our{" "}
        <Link href="/cookie-policy">Cookie Policy</Link>.
      </p>

      <h2 id="your-rights">9. Your rights under UK GDPR</h2>
      <p>
        Under UK GDPR and the Data Protection Act 2018, you have the following
        rights:
      </p>
      <ul>
        <li>
          <strong>Right of access</strong> — request a copy of the personal data
          we hold about you.
        </li>
        <li>
          <strong>Right to rectification</strong> — ask us to correct any
          inaccurate or incomplete data.
        </li>
        <li>
          <strong>Right to erasure</strong> — request that we delete your
          personal data.
        </li>
        <li>
          <strong>Right to data portability</strong> — receive your data in a
          structured, commonly used format.
        </li>
        <li>
          <strong>Right to object</strong> — object to certain types of
          processing, including direct marketing.
        </li>
        <li>
          <strong>Right to restrict processing</strong> — ask us to limit how we
          use your data.
        </li>
        <li>
          <strong>Right to withdraw consent</strong> — withdraw your consent at
          any time where processing is based on consent.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email us at{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>. If you
        are not satisfied with our response, you have the right to lodge a
        complaint with the Information Commissioner&apos;s Office (ICO) at{" "}
        <a href="https://ico.org.uk">ico.org.uk</a>.
      </p>

      <h2 id="changes">10. Changes to this policy</h2>
      <p>
        We may update this privacy policy from time to time to reflect changes in
        our practices or legal requirements. If we make significant changes, we
        will notify you by email or by placing a prominent notice on our
        website. We encourage you to review this policy periodically.
      </p>

      <h2 id="contact">11. Contact</h2>
      <p>
        Paybacker LTD is a company registered in England and Wales.
        <br />
        Registered address: 71-75 Shelton Street, Covent Garden, London, WC2H
        9JQ, United Kingdom.
      </p>
      <p>
        If you have any questions about this privacy policy or how we handle your
        data, please contact us at{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
      </p>
    </PostShell>
  );
}
