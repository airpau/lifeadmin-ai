import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { MarkNav, MarkFoot } from '../blog/_shared';
import '../blog/styles.css';

/**
 * /ico-notice — UK Information Commissioner's Office data-protection notice.
 *
 * Linked from the blog footer + careers footer. The page complements the
 * full Privacy Policy at /privacy-policy by stating, in one place:
 *
 *   - the data controller (Paybacker LTD, registered company no. 15289174)
 *   - the lawful bases on which we process personal data
 *   - the user's rights under the UK GDPR / Data Protection Act 2018
 *   - the route to lodge a complaint with the ICO
 *
 * UK ICO REGISTRATION — set NEXT_PUBLIC_ICO_REGISTRATION_NUMBER once
 * the ICO have issued the registration certificate. Until then the page
 * states that registration is in progress; the ICO accepts that
 * controllers can begin processing while registration is pending,
 * provided the fee has been paid (UK GDPR Art. 14, ICO guidance).
 */

export const metadata: Metadata = {
  title: 'ICO data-protection notice — Paybacker',
  description:
    'How Paybacker LTD handles your personal data under the UK GDPR and Data Protection Act 2018, the legal bases we rely on, and how to contact the ICO.',
  alternates: { canonical: 'https://paybacker.co.uk/ico-notice' },
  openGraph: {
    title: 'ICO data-protection notice — Paybacker',
    description:
      'How Paybacker LTD handles your personal data under UK GDPR. Data controller, lawful bases, your rights, and how to complain to the ICO.',
    url: 'https://paybacker.co.uk/ico-notice',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ICO data-protection notice — Paybacker',
    description:
      'How Paybacker LTD handles your personal data under UK GDPR.',
  },
};

const ICO_REG = process.env.NEXT_PUBLIC_ICO_REGISTRATION_NUMBER;

export default function IcoNoticePage() {
  return (
    <div className="m-blog-root">
      <MarkNav />

      <section className="section-light" style={{ paddingTop: 140, paddingBottom: 96 } as CSSProperties}>
        <div className="wrap" style={{ maxWidth: 760 } as CSSProperties}>
          <span className="eyebrow">Legal · Data protection</span>
          <h1
            style={{
              fontSize: 'var(--fs-h1)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              lineHeight: 1.1,
              margin: '18px 0 24px',
            } as CSSProperties}
          >
            ICO data-protection notice
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              margin: '0 0 32px',
            } as CSSProperties}
          >
            This page summarises how <strong>Paybacker LTD</strong> handles your personal data under the <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong>. For the full picture, see our <Link href="/privacy-policy">Privacy Policy</Link>.
          </p>

          <h2 style={hStyle}>Who controls your data</h2>
          <p style={pStyle}>
            <strong>Paybacker LTD</strong>, registered in England &amp; Wales (company no. <strong>15289174</strong>), is the <em>data controller</em> for personal data submitted through paybacker.co.uk and the Paybacker apps.
          </p>
          <p style={pStyle}>
            <strong>Contact:</strong> <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>
          </p>
          <p style={pStyle}>
            <strong>ICO registration:</strong>{' '}
            {ICO_REG ? (
              <span>
                Registration number <strong>{ICO_REG}</strong>. You can verify our registration on the{' '}
                <a href="https://ico.org.uk/ESDWebPages/Search" target="_blank" rel="noreferrer">ICO public register</a>.
              </span>
            ) : (
              <span>
                Registration with the ICO is in progress. The ICO permits processing to begin once the data-protection fee has been paid; we will publish the registration number here as soon as it is issued.
              </span>
            )}
          </p>

          <h2 style={hStyle}>What we collect</h2>
          <ul style={ulStyle}>
            <li><strong>Account data</strong> — your email, name, and password hash.</li>
            <li><strong>Bank data</strong> — read-only transaction history retrieved via Yapily / TrueLayer when you connect a bank, used solely to identify subscriptions and recurring charges.</li>
            <li><strong>Email metadata</strong> — when you connect Gmail or Outlook, we read message subjects, sender, and date to identify dispute correspondence and overcharges. We do not exfiltrate full email bodies beyond the matched subset.</li>
            <li><strong>Dispute content</strong> — the disputes, complaint letters and supporting facts you generate or paste.</li>
            <li><strong>Usage analytics</strong> — anonymised behaviour via PostHog.</li>
          </ul>

          <h2 style={hStyle}>Lawful bases for processing</h2>
          <ul style={ulStyle}>
            <li><strong>Contract</strong> (UK GDPR Art. 6(1)(b)) — to deliver the Paybacker service you signed up for.</li>
            <li><strong>Legitimate interests</strong> (Art. 6(1)(f)) — for security, fraud prevention and product improvement, balanced against your rights.</li>
            <li><strong>Consent</strong> (Art. 6(1)(a)) — for optional marketing emails, push and WhatsApp messages. You can withdraw consent at any time.</li>
            <li><strong>Legal obligation</strong> (Art. 6(1)(c)) — for tax records, complaint logs and other statutory requirements.</li>
          </ul>

          <h2 style={hStyle}>Your rights</h2>
          <p style={pStyle}>Under the UK GDPR you have the right to:</p>
          <ul style={ulStyle}>
            <li>Access the personal data we hold about you (subject access request)</li>
            <li>Rectify inaccurate data</li>
            <li>Erase your data (the &ldquo;right to be forgotten&rdquo;) — see <Link href="/account-deletion">/account-deletion</Link></li>
            <li>Restrict or object to processing</li>
            <li>Data portability — request an export of your data in a machine-readable format</li>
            <li>Withdraw consent, where consent was the lawful basis</li>
            <li>Not be subject to fully automated decision-making with legal effect</li>
          </ul>
          <p style={pStyle}>
            To exercise any of these rights, email <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>. We respond within one calendar month, free of charge.
          </p>

          <h2 style={hStyle}>How we secure your data</h2>
          <ul style={ulStyle}>
            <li>Data is encrypted in transit (TLS 1.2+) and at rest in our Supabase database (AES-256, EU-West region).</li>
            <li>Bank-OAuth tokens are encrypted with a per-environment key; we never see your bank login credentials.</li>
            <li>Email-account OAuth tokens use the minimum scopes required for the feature you opted into.</li>
            <li>Access to production data is restricted to a small admin allowlist with audit logging.</li>
          </ul>

          <h2 style={hStyle}>How long we keep your data</h2>
          <p style={pStyle}>
            We keep account data for the lifetime of your account, plus 30 days post-deletion (recovery window) before permanent purge. Bank transactions you delete via the disconnect flow enter a 30-day soft-deleted bin and are then purged daily by an automated process. Disputes you create are kept for 6 years to comply with UK statute-of-limitations on consumer-claim records.
          </p>

          <h2 style={hStyle}>Sharing your data</h2>
          <p style={pStyle}>
            We do not sell personal data. We share data only with the sub-processors needed to deliver the service:
          </p>
          <ul style={ulStyle}>
            <li><strong>Supabase</strong> — managed Postgres + Auth (EU-West).</li>
            <li><strong>Anthropic</strong> — Claude API for AI letter drafting (US, with UK-GDPR-compliant data agreement).</li>
            <li><strong>Yapily / TrueLayer</strong> — FCA-regulated Open Banking provider.</li>
            <li><strong>Stripe</strong> — payments processor (PCI-DSS certified).</li>
            <li><strong>Resend</strong> — transactional email.</li>
            <li><strong>PostHog</strong> — product analytics.</li>
            <li><strong>Vercel</strong> — hosting.</li>
            <li><strong>Twilio / Meta</strong> — SMS and WhatsApp delivery, where opted in.</li>
          </ul>

          <h2 style={hStyle}>Your right to complain to the ICO</h2>
          <p style={pStyle}>
            If you&rsquo;re unhappy with how we&rsquo;ve handled your data, please email us first so we can put it right. If you remain dissatisfied, you have the right to lodge a complaint with the Information Commissioner&rsquo;s Office:
          </p>
          <ul style={ulStyle}>
            <li>Website: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ico.org.uk/make-a-complaint</a></li>
            <li>Telephone: 0303 123 1113</li>
            <li>Post: Information Commissioner&rsquo;s Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
          </ul>

          <p
            style={{
              fontSize: 13,
              color: 'var(--text-tertiary)',
              marginTop: 48,
              paddingTop: 24,
              borderTop: '1px solid var(--divider)',
            } as CSSProperties}
          >
            This notice was last reviewed on 27 April 2026. We update it whenever we change how we handle data — material changes are emailed to all account holders.
          </p>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}

const hStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: '-.015em',
  margin: '40px 0 12px',
  lineHeight: 1.25,
};
const pStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
};
const ulStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
  margin: '0 0 16px',
  paddingLeft: 22,
};
