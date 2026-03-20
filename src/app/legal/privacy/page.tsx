import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — Paybacker LTD',
  description: 'How Paybacker LTD collects, uses, and protects your personal data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="container mx-auto px-6 py-6 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Sparkles className="h-6 w-6 text-amber-500" />
          <span className="text-xl font-bold text-white">Pay<span className="text-amber-500">Backer</span></span>
        </Link>
      </header>

      <main className="container mx-auto px-6 py-16 max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
        <p className="text-slate-400 mb-12">Last updated: 20 March 2026</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-10 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Who we are</h2>
            <p>
              Paybacker LTD (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a UK-based service that helps consumers dispute bills,
              cancel subscriptions, and exercise their rights under UK consumer law. Our website is{' '}
              <a href="https://paybacker.co.uk" className="text-amber-400 hover:underline">paybacker.co.uk</a>.
            </p>
            <p className="mt-3">
              We are registered as a data controller with the Information Commissioner&apos;s Office (ICO).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. What data we collect</h2>
            <div className="space-y-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-2">Account data</h3>
                <p className="text-sm">Name, email address, and password (hashed). Collected when you create an account.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-2">Email access (OAuth)</h3>
                <p className="text-sm">
                  When you connect Gmail or Outlook, we receive a read-only OAuth token. We use this token to
                  scan your emails for billing-related content only. We do not store full email bodies —
                  only the metadata and snippets required to identify savings opportunities.
                  We never send emails on your behalf without your explicit approval of each individual email.
                </p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-2">Generated content</h3>
                <p className="text-sm">Complaint letters and cancellation emails created by our AI are stored so you can access them later. You can delete these at any time.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-2">Payment data</h3>
                <p className="text-sm">We use Stripe to process payments. We do not store card details — Stripe handles all payment data under PCI-DSS compliance.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-2">Usage data</h3>
                <p className="text-sm">Pages visited, features used, scan runs, and letter generation counts. Used to improve the product and enforce fair-use limits.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. How we use your data</h2>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>To provide the Paybacker LTD service — scanning, letter generation, subscription tracking</li>
              <li>To send you transactional emails (account, billing, complaint status)</li>
              <li>To enforce plan limits and prevent abuse</li>
              <li>To improve our AI models and service quality (anonymised and aggregated only)</li>
              <li>To comply with our legal obligations under UK law</li>
            </ul>
            <p className="mt-4 text-sm">
              We do not sell your data to third parties. We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Legal basis for processing</h2>
            <p className="text-sm">Under UK GDPR, we process your data on the following legal bases:</p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-3">
              <li><strong className="text-white">Contract</strong> — processing necessary to provide the service you signed up for</li>
              <li><strong className="text-white">Legitimate interest</strong> — product analytics and fraud prevention</li>
              <li><strong className="text-white">Consent</strong> — email marketing (you can withdraw at any time)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Data retention</h2>
            <p className="text-sm">
              We retain your account data for as long as your account is active. Email OAuth tokens are retained
              until you disconnect the integration or delete your account. Generated letters are retained
              indefinitely so you can access your complaint history, but can be deleted by you at any time.
              We delete inactive accounts (no login for 24 months) after 30 days&apos; notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Your rights under UK GDPR</h2>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li><strong className="text-white">Access</strong> — request a copy of all data we hold on you</li>
              <li><strong className="text-white">Rectification</strong> — correct inaccurate data</li>
              <li><strong className="text-white">Erasure</strong> — delete your account and all associated data (available in Profile → Delete Account)</li>
              <li><strong className="text-white">Portability</strong> — receive your data in a machine-readable format</li>
              <li><strong className="text-white">Objection</strong> — object to processing based on legitimate interest</li>
              <li><strong className="text-white">Restriction</strong> — request we limit how we use your data</li>
            </ul>
            <p className="mt-4 text-sm">
              To exercise any of these rights, email us at{' '}
              <a href="mailto:privacy@paybacker.co.uk" className="text-amber-400 hover:underline">privacy@paybacker.co.uk</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Third-party processors</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 pr-4 text-white font-semibold">Processor</th>
                    <th className="text-left py-2 pr-4 text-white font-semibold">Purpose</th>
                    <th className="text-left py-2 text-white font-semibold">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {[
                    ['Supabase', 'Database, authentication', 'EU (AWS eu-west-2)'],
                    ['Vercel', 'Hosting and edge functions', 'EU'],
                    ['Anthropic (Claude)', 'AI letter generation', 'US (SCCs apply)'],
                    ['Stripe', 'Payment processing', 'US / EU (SCCs apply)'],
                    ['Resend', 'Transactional email', 'US (SCCs apply)'],
                    ['PostHog', 'Product analytics', 'EU'],
                  ].map(([name, purpose, location]) => (
                    <tr key={name}>
                      <td className="py-2 pr-4 text-amber-400">{name}</td>
                      <td className="py-2 pr-4">{purpose}</td>
                      <td className="py-2 text-slate-400">{location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Cookies</h2>
            <p className="text-sm">
              We use strictly necessary cookies for authentication sessions. We use PostHog analytics
              cookies to understand how users interact with the product. You can opt out of analytics
              cookies by contacting us, though this does not affect core functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Contact & complaints</h2>
            <p className="text-sm">
              Email us at{' '}
              <a href="mailto:privacy@paybacker.co.uk" className="text-amber-400 hover:underline">privacy@paybacker.co.uk</a>{' '}
              for any data protection queries.
            </p>
            <p className="mt-3 text-sm">
              If you are not satisfied with our response, you have the right to lodge a complaint with the
              Information Commissioner&apos;s Office (ICO) at{' '}
              <a href="https://ico.org.uk" className="text-amber-400 hover:underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-slate-800 mt-16">
        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-white transition-all">Home</Link>
          <Link href="/legal/terms" className="hover:text-white transition-all">Terms of Service</Link>
          <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
        </div>
      </footer>
    </div>
  );
}
