import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../blog/_shared";
import "../blog/styles.css";

export const metadata: Metadata = {
  title: "Account & Data Deletion — Paybacker LTD",
  description:
    "How to delete your Paybacker account and your personal data, what gets removed and how long it takes.",
};

const TOC = [
  { id: "in-app", label: "1. Delete from inside the app" },
  { id: "by-email", label: "2. Delete by email request" },
  { id: "what-happens", label: "3. What gets deleted" },
  { id: "what-we-keep", label: "4. What we keep (and why)" },
  { id: "timeline", label: "5. How long it takes" },
  { id: "contact", label: "6. Contact" },
];

export default function AccountDeletionPage() {
  return (
    <PostShell
      category="Legal"
      title="Account & Data Deletion"
      dek="How to delete your Paybacker account and the personal data linked to it."
      dateLabel="Last updated April 2026"
      toc={TOC}
      aside={{
        eyebrow: "Need help?",
        title: "Email our privacy team",
        description:
          "If you can&rsquo;t access your account or have questions about deletion, email hello@paybacker.co.uk and we&rsquo;ll process the request manually within 30 days.",
        ctaLabel: "Contact us",
        ctaHref: "mailto:hello@paybacker.co.uk",
      }}
    >
      <p>
        You can permanently delete your Paybacker account and all the personal data
        associated with it at any time. This page explains the two ways to do that,
        what gets removed, what we&rsquo;re legally required to keep, and how long
        the process takes. This applies to the Paybacker iOS app, Android app and{" "}
        <a href="https://paybacker.co.uk">paybacker.co.uk</a> equally &mdash; one
        deletion removes your account across all surfaces.
      </p>

      <h2 id="in-app">1. Delete from inside the app</h2>
      <p>The fastest way to delete your account:</p>
      <ol>
        <li>
          Sign in to{" "}
          <a href="https://paybacker.co.uk/dashboard/profile">
            paybacker.co.uk/dashboard/profile
          </a>{" "}
          (or the same Profile screen in the iOS/Android app).
        </li>
        <li>
          Scroll to the <strong>Danger zone</strong> section at the bottom of the
          page.
        </li>
        <li>Tap or click <strong>Delete my account</strong>.</li>
        <li>
          Confirm by typing <code>DELETE</code> when prompted.
        </li>
      </ol>
      <p>
        Once you confirm, your account is queued for permanent deletion and
        you&rsquo;re signed out immediately on every device.
      </p>

      <h2 id="by-email">2. Delete by email request</h2>
      <p>
        If you can&rsquo;t access your account, email{" "}
        <a href="mailto:hello@paybacker.co.uk?subject=Account%20deletion%20request">
          hello@paybacker.co.uk
        </a>{" "}
        from the address registered on your account with the subject line{" "}
        <em>&ldquo;Account deletion request&rdquo;</em>. Tell us:
      </p>
      <ul>
        <li>The email address on the account</li>
        <li>(Optional) the date you signed up, to help us match the record</li>
      </ul>
      <p>
        We&rsquo;ll verify the request, delete the account, and reply within 30
        days to confirm.
      </p>

      <h2 id="what-happens">3. What gets deleted</h2>
      <p>When you delete your account we permanently remove:</p>
      <div className="callout">
        <div className="label">Profile &amp; auth</div>
        <p style={{ margin: 0 }}>
          Your name, email address, phone number, password hash, login history,
          push notification tokens, and any biometric-unlock preferences stored on
          our servers.
        </p>
      </div>
      <div className="callout">
        <div className="label">Connected services</div>
        <p style={{ margin: 0 }}>
          All Open Banking consents (Yapily) are revoked, and all Gmail/Outlook
          OAuth tokens are revoked and erased. Once deleted, Paybacker can no
          longer access your bank or your inbox.
        </p>
      </div>
      <div className="callout">
        <div className="label">Account contents</div>
        <p style={{ margin: 0 }}>
          Your subscriptions, contracts, complaint letters and dispute threads,
          tasks, budgets, savings goals, scanned email opportunities, transaction
          history, AI chatbot conversations, and any uploaded documents.
        </p>
      </div>

      <h2 id="what-we-keep">4. What we keep (and why)</h2>
      <p>
        UK GDPR Article 17(3) lets us retain a narrow set of data after deletion
        where we have a legal obligation. Specifically we keep, in encrypted form
        and accessible only to our compliance team:
      </p>
      <ul>
        <li>
          Stripe transaction records for any payments you made &mdash; for 6 years
          to satisfy HMRC and Companies House record-keeping rules.
        </li>
        <li>
          Anonymised audit logs (with your name and email already stripped) so we
          can comply with security incident investigations.
        </li>
        <li>
          A hash of your email address on a suppression list so we don&rsquo;t
          accidentally re-send marketing if someone signs up again with the same
          email.
        </li>
      </ul>

      <h2 id="timeline">5. How long it takes</h2>
      <ul>
        <li>
          <strong>In-app deletion:</strong> Account access removed immediately;
          full data erasure completes within 7 days.
        </li>
        <li>
          <strong>Email-request deletion:</strong> We confirm receipt within 3
          working days and complete erasure within 30 days, in line with UK GDPR
          Article 12.
        </li>
      </ul>

      <h2 id="contact">6. Contact</h2>
      <p>
        Paybacker LTD, 71-75 Shelton Street, London, WC2H 9JQ, United Kingdom. For
        anything related to deletion, email{" "}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>. See our{" "}
        <Link href="/privacy-policy">Privacy Policy</Link> for the full details on
        how we collect, use and protect your data.
      </p>
    </PostShell>
  );
}
