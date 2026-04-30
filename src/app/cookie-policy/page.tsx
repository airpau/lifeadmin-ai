import type { Metadata } from 'next';
import Link from 'next/link';
import CookieSettingsButton from '@/components/CookieSettingsButton';
import { PostShell, SIGNUP_HREF } from '../blog/_shared';
import '../blog/styles.css';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Paybacker uses cookies and similar technologies.',
};

const TOC = [
  { id: 'what-are-cookies', label: 'What are cookies?' },
  { id: 'how-we-use', label: 'How we use cookies' },
  { id: 'manage', label: 'Managing your preferences' },
  { id: 'third-party', label: 'Third-party cookies' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'contact', label: 'Contact' },
];

export default function CookiePolicyPage() {
  return (
    <PostShell
      category="Legal"
      title="Cookie Policy"
      dek="How Paybacker uses cookies and similar technologies on paybacker.co.uk."
      dateLabel="Last updated 4 April 2026"
      toc={TOC}
      aside={{
        eyebrow: 'Manage cookies',
        title: 'Change your cookie choice',
        description:
          "Open the cookie settings panel at any time. You can also use the cookie settings button in the footer.",
        ctaLabel: 'Start free',
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="what-are-cookies">What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device when you visit a
        website. They help the site remember your preferences and understand how
        you use it.
      </p>

      <h2 id="how-we-use">How we use cookies</h2>
      <p>
        Paybacker uses cookies and similar technologies in the following
        categories:
      </p>

      <h3>Essential cookies</h3>
      <p>Required for the site to function. Cannot be disabled.</p>
      <ul>
        <li>
          <strong>Supabase auth cookies</strong> — maintain your login session.
        </li>
        <li>
          <strong>pb_consent</strong> — stores your cookie consent preferences.
        </li>
      </ul>

      <h3>Analytics cookies</h3>
      <p>Help us understand how visitors use Paybacker. Only set with your consent.</p>
      <ul>
        <li>
          <strong>Google Analytics (GA4)</strong> — page views, user journeys,
          performance metrics. ID: <code>G-GRL9XKYTN1</code>.
        </li>
        <li>
          <strong>PostHog</strong> — product analytics sent via our server (no
          client-side cookies set).
        </li>
      </ul>

      <h3>Marketing cookies</h3>
      <p>Used for advertising and affiliate tracking. Only set with your consent.</p>
      <ul>
        <li>
          <strong>Meta Pixel</strong> — measures ad effectiveness and enables
          retargeting. Pixel ID: <code>722806327584909</code>.
        </li>
        <li>
          <strong>Meta Conversions API</strong> — server-side event tracking for
          ad optimisation.
        </li>
        <li>
          <strong>Awin</strong> — affiliate tracking for partner deals.
        </li>
      </ul>

      <h3>Functional cookies</h3>
      <p>Enable enhanced features. Only set with your consent.</p>
      <ul>
        <li>
          <strong>Chat preferences</strong> — remembers your chatbot interaction
          state.
        </li>
      </ul>

      <h2 id="manage">Managing your preferences</h2>
      <p>
        You can change your cookie preferences at any time using the Cookie
        Settings button in the website footer, or by clicking below:
      </p>
      <div style={{ margin: '8px 0 20px' }}>
        <CookieSettingsButton />
      </div>

      <h2 id="third-party">Third-party cookies</h2>
      <p>
        Some cookies are set by third-party services that appear on our pages
        (Google, Meta, Awin). We do not control these cookies. Please refer to
        the respective privacy policies of these providers for more information.
      </p>

      <h2 id="your-rights">Your rights</h2>
      <p>
        Under UK GDPR and PECR, you have the right to refuse non-essential
        cookies. Essential cookies that are strictly necessary for the site to
        function cannot be disabled as they are required to provide the service
        you have requested.
      </p>
      <p>
        For the full detail of how we handle personal data, see our{' '}
        <Link href="/privacy-policy">Privacy Policy</Link>.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        If you have questions about our use of cookies, contact us at{' '}
        <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
      </p>
    </PostShell>
  );
}
