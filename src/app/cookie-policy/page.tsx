import type { Metadata } from 'next';
import Link from 'next/link';
import CookieSettingsButton from '@/components/CookieSettingsButton';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Paybacker uses cookies and similar technologies.',
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-navy-950 text-slate-300">
      <div className="container mx-auto px-6 py-16 max-w-3xl">
        <Link href="/" className="text-mint-400 text-sm hover:underline">&larr; Back to home</Link>
        <h1 className="text-3xl font-bold text-white mt-6 mb-8">Cookie Policy</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: 4 April 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">What are cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website.
              They help the site remember your preferences and understand how you use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How we use cookies</h2>
            <p className="mb-4">Paybacker uses cookies and similar technologies in the following categories:</p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Essential cookies</h3>
            <p className="mb-2">Required for the site to function. Cannot be disabled.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Supabase auth cookies</strong> — maintain your login session</li>
              <li><strong className="text-slate-300">pb_consent</strong> — stores your cookie consent preferences</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Analytics cookies</h3>
            <p className="mb-2">Help us understand how visitors use Paybacker. Only set with your consent.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Google Analytics (GA4)</strong> — page views, user journeys, performance metrics. ID: G-GRL9XKYTN1</li>
              <li><strong className="text-slate-300">PostHog</strong> — product analytics sent via our server (no client-side cookies set)</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Marketing cookies</h3>
            <p className="mb-2">Used for advertising and affiliate tracking. Only set with your consent.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Meta Pixel</strong> — measures ad effectiveness and enables retargeting</li>
              <li><strong className="text-slate-300">Meta Conversions API</strong> — server-side event tracking for ad optimisation</li>
              <li><strong className="text-slate-300">Awin</strong> — affiliate tracking for partner deals</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Functional cookies</h3>
            <p className="mb-2">Enable enhanced features. Only set with your consent.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Chat preferences</strong> — remembers your chatbot interaction state</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Managing your preferences</h2>
            <p className="mb-3">
              You can change your cookie preferences at any time using the Cookie Settings button
              in the website footer, or by clicking below:
            </p>
            <CookieSettingsButton />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Third-party cookies</h2>
            <p>
              Some cookies are set by third-party services that appear on our pages (Google, Meta, Awin).
              We do not control these cookies. Please refer to the respective privacy policies of
              these providers for more information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Your rights</h2>
            <p>
              Under UK GDPR and PECR, you have the right to refuse non-essential cookies.
              Essential cookies that are strictly necessary for the site to function cannot be
              disabled as they are required to provide the service you have requested.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>
              If you have questions about our use of cookies, contact us at{' '}
              <a href="mailto:hello@paybacker.co.uk" className="text-mint-400 hover:underline">hello@paybacker.co.uk</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
