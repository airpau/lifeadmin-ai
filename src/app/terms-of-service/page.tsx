import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../blog/_shared";
import "../blog/styles.css";

export const metadata: Metadata = {
  title: "Terms of Service — Paybacker LTD",
  description: "Terms and conditions for using the Paybacker platform.",
};

const TOC = [
  { id: "introduction", label: "1. Introduction" },
  { id: "service-description", label: "2. Service description" },
  { id: "account-registration", label: "3. Account registration" },
  { id: "plans", label: "4. Free and paid plans" },
  { id: "data-privacy", label: "5. User data and privacy" },
  { id: "ai-content", label: "6. AI-generated content" },
  { id: "affiliate", label: "7. Affiliate relationships" },
  { id: "acceptable-use", label: "8. Acceptable use" },
  { id: "liability", label: "9. Limitation of liability" },
  { id: "termination", label: "10. Termination" },
  { id: "changes", label: "11. Changes to terms" },
  { id: "governing-law", label: "12. Governing law" },
  { id: "contact", label: "13. Contact" },
];

export default function TermsOfServicePage() {
  return (
    <PostShell
      category="Legal"
      title="Terms of Service"
      dek="The terms that apply when you use the Paybacker platform."
      dateLabel="Last updated March 2026"
      toc={TOC}
      aside={{
        eyebrow: "Questions?",
        title: "Contact our team",
        description:
          "Email hello@paybacker.co.uk with any question about these terms.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="introduction">1. Introduction</h2>
      <p>
        Paybacker LTD (&ldquo;Paybacker&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
        &ldquo;our&rdquo;) operates the website{" "}
        <a href="https://paybacker.co.uk">paybacker.co.uk</a>.
      </p>
      <p>
        By using our platform, you agree to be bound by these Terms of Service.
        If you do not agree to these terms, please do not use our services.
      </p>

      <h2 id="service-description">2. Service description</h2>
      <p>
        Paybacker is an AI-powered consumer finance platform for UK consumers. We
        provide a range of services including:
      </p>
      <ul>
        <li>Bill analysis and contextual savings recommendations.</li>
        <li>Subscription tracking and automated cancellation workflows.</li>
        <li>Deal comparisons and price increase alerts.</li>
        <li>Dispute letter generation assisted by AI.</li>
        <li>Annual financial reports.</li>
      </ul>
      <p>
        To provide these services, we connect to your bank accounts via Open
        Banking using our partner Yapily (FCA-regulated) using read-only access.
      </p>
      <p>
        We may also connect to your email accounts (such as Gmail or Outlook)
        with read-only access to reliably identify bills, contracts, and renewal
        notices automatically.
      </p>

      <h2 id="account-registration">3. Account registration</h2>
      <p>
        To use Paybacker, you must be 18 years of age or older and a resident of
        the United Kingdom.
      </p>
      <ul>
        <li>
          You must provide accurate, complete, and up-to-date registration
          information.
        </li>
        <li>
          You are strictly responsible for maintaining the security of your
          account credentials.
        </li>
        <li>
          We permit one account per person. Creating multiple accounts may result
          in suspension.
        </li>
      </ul>

      <h2 id="plans">4. Free and paid plans</h2>
      <p>We offer our services across free and paid subscription models:</p>
      <ul>
        <li>
          <strong>Free plan:</strong> 3 AI letters per month, one-time bank and
          email scans, basic spending overview, AI chatbot.
        </li>
        <li>
          <strong>Essential — £4.99/month or £44.99/year:</strong> Unlimited AI
          letters, 1 bank account with daily auto-sync, monthly email and
          opportunity re-scans, full spending intelligence dashboard, renewal
          reminders, contract end-date tracking.
        </li>
        <li>
          <strong>Pro — £9.99/month or £94.99/year:</strong> Everything in
          Essential, plus unlimited bank accounts, unlimited email and
          opportunity scans, priority support.
        </li>
      </ul>
      <p>
        Our current pricing is displayed at{" "}
        <Link href="/pricing">paybacker.co.uk/pricing</Link>. We reserve the
        right to change our pricing with 30 days written notice.
      </p>

      <h2 id="data-privacy">5. User data and privacy</h2>
      <p>
        Our <Link href="/privacy-policy">Privacy Policy</Link> globally governs
        how we collect, store, and use your personal data.
      </p>
      <ul>
        <li>
          We operate exclusively using read-only access to your banking and email
          data. We can <strong>never</strong> move your money, make payments, or
          send emails on your behalf.
        </li>
        <li>
          We do not sell, share, or monetise your personal data to third-party
          data brokers.
        </li>
        <li>
          You can request complete data deletion at any time in accordance with
          UK GDPR.
        </li>
      </ul>

      <h2 id="ai-content">6. AI-generated content</h2>
      <div className="callout">
        <div className="label">Important</div>
        <p style={{ margin: 0 }}>
          Our AI automatically generates complaint letters, financial summaries,
          and switching recommendations based on your data. This AI-generated
          content is provided for informational and guidance purposes only and{" "}
          <strong>does not constitute legal or financial advice</strong>. Users
          should always review and verify all AI-generated letters before
          sending them to third-party providers. We do not guarantee the outcomes
          of any disputes, claims, or complaints pursued through our platform.
        </p>
      </div>

      <h2 id="affiliate">7. Affiliate relationships</h2>
      <p>
        We may earn a commission from partners when you successfully switch
        providers through our platform. Our transparent affiliate relationships
        will never influence our recommendations, nor do they ever affect the
        price you pay. Our priority is finding genuine savings for you.
      </p>

      <h2 id="acceptable-use">8. Acceptable use</h2>
      <p>When using our platform, you agree that you will not:</p>
      <ul>
        <li>Use the platform for any fraudulent or malicious purposes.</li>
        <li>
          Attempt to circumvent, disable, or tamper with any of our security
          measures.
        </li>
        <li>
          Scrape, copy, or redistribute any platform content or underlying
          technology.
        </li>
        <li>
          Create accounts using false or misleading identity information.
        </li>
      </ul>

      <h2 id="liability">9. Limitation of liability</h2>
      <p>
        Paybacker is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis strictly without any warranties of any kind. We
        are not liable for the financial decisions you make based on our
        recommendations.
      </p>
      <p>
        To the maximum extent permitted by law, our total cumulative liability to
        you is limited strictly to the amount you paid to us for the services in
        the 12 months immediately preceding the claim.
      </p>
      <p>
        We accept zero liability for any losses, delays, or issues arising
        directly or indirectly from actions taken by third-party services,
        including but not limited to banks, energy providers, telecommunications
        companies, or subscription services.
      </p>

      <h2 id="termination">10. Termination</h2>
      <p>
        You may close your account at any time via your Profile settings or by
        emailing{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
      </p>
      <p>
        We reserve the right to suspend or terminate accounts indefinitely that
        violate these terms or local laws. Upon termination, we will permanently
        delete your user data in accordance with our Privacy Policy.
      </p>

      <h2 id="changes">11. Changes to terms</h2>
      <p>
        We may update these terms occasionally. If we make material changes, we
        will communicate them to you via email. Your continued use of the
        platform after changes have been posted explicitly constitutes your
        acceptance of the updated terms.
      </p>

      <h2 id="governing-law">12. Governing law</h2>
      <p>
        These terms are governed collectively by the laws of England and Wales.
        Any disputes arising from these Terms of Service will be subject
        exclusively to the jurisdiction of the English courts.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Paybacker LTD is a company registered in England and Wales.
        <br />
        Registered address: 71-75 Shelton Street, Covent Garden, London, WC2H
        9JQ, United Kingdom.
      </p>
      <p>
        Email: <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>
        <br />
        Website: <a href="https://paybacker.co.uk">paybacker.co.uk</a>
      </p>
    </PostShell>
  );
}
