import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Paybacker LTD",
  description: "Terms and conditions for using the Paybacker platform.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="container mx-auto px-6 py-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-bold text-white">
              Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 md:gap-3 text-sm">
            <Link href="/about" className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
              About
            </Link>
            <Link href="/blog" className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
              Blog
            </Link>
            <Link href="/pricing" className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
              Pricing
            </Link>
            <Link href="/auth/login" className="text-slate-300 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-16 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Terms of Service
        </h1>
        <p className="text-slate-500 text-sm mb-10">
          Last updated: March 2026
        </p>

        {/* Section 1 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker LTD (&quot;Paybacker&quot;, &quot;we&quot;, &quot;us&quot;,
            &quot;our&quot;) operates the website <a href="https://paybacker.co.uk" className="text-amber-400 hover:text-amber-300">paybacker.co.uk</a>.
          </p>
          <p className="text-slate-300 leading-relaxed">
            By using our platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
          </p>
        </section>

        {/* Section 2 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">2. Service Description</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker is an AI-powered consumer finance platform for UK consumers. We provide a range of services including:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li>Bill analysis and contextual savings recommendations</li>
            <li>Subscription tracking and automated cancellation workflows</li>
            <li>Deal comparisons and price increase alerts</li>
            <li>Dispute letter generation assisted by AI</li>
            <li>Annual financial reports</li>
          </ul>
          <p className="text-slate-300 leading-relaxed mb-4">
            To provide these services, we connect to your bank accounts via Open Banking using our partner TrueLayer (FCA-regulated) using read-only access.
          </p>
          <p className="text-slate-300 leading-relaxed">
            We may also connect to your email accounts (such as Gmail or Outlook) with read-only access to reliably identify bills, contracts, and renewal notices automatically.
          </p>
        </section>

        {/* Section 3 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">3. Account Registration</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            To use Paybacker, you must be 18 years of age or older and a resident of the United Kingdom.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li>You must provide accurate, complete, and up-to-date registration information.</li>
            <li>You are strictly responsible for maintaining the security of your account credentials.</li>
            <li>We permit one account per person. Creating multiple accounts may result in suspension.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">4. Free and Paid Plans</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We offer our services across free and paid subscription models:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li><strong>Free plan:</strong> Provides limited access to features and basic recommendations.</li>
            <li><strong>Pro plan:</strong> Grants full access to advanced features including premium AI letter generation, continuous bank connectivity, email scanning, and your annual report.</li>
          </ul>
          <p className="text-slate-300 leading-relaxed">
            Our current pricing is displayed at <Link href="/pricing" className="text-amber-400 hover:text-amber-300">paybacker.co.uk/pricing</Link>. We reserve the right to change our pricing with 30 days written notice.
          </p>
        </section>

        {/* Section 5 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">5. User Data and Privacy</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Our <Link href="/privacy-policy" className="text-amber-400 hover:text-amber-300">Privacy Policy</Link> globally governs how we collect, store, and use your personal data.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li>We operate exclusively using read-only access to your banking and email data. We can <strong>never</strong> move your money, make payments, or send emails on your behalf.</li>
            <li>We do not sell, share, or monetise your personal data to third-party data brokers.</li>
            <li>You can request complete data deletion at any time in accordance with UK GDPR.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">6. AI-Generated Content</h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-300 leading-relaxed mb-4">
              Our AI automatically generates complaint letters, financial summaries, and switching recommendations based on your data. This AI-generated content is provided for informational and guidance purposes only and <strong>does not constitute legal or financial advice</strong>.
            </p>
            <p className="text-slate-300 leading-relaxed mb-4">
              Users should always manually deeply review and verify all AI-generated letters before sending them to third-party providers. We do not guarantee the outcomes of any disputes, claims, or complaints pursued through our platform.
            </p>
          </div>
        </section>

        {/* Section 7 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">7. Affiliate Relationships</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We may earn a commission from partners when you successfully switch providers through our platform. Our transparent affiliate relationships will never influence our recommendations, nor do they ever affect the price you pay. Our priority is finding genuine savings for you.
          </p>
        </section>

        {/* Section 8 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">8. Acceptable Use</h2>
          <p className="text-slate-300 leading-relaxed mb-2">When using our platform, you agree that you will not:</p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li>Use the platform for any fraudulent or malicious purposes.</li>
            <li>Attempt to circumvent, disable, or tamper with any of our security measures.</li>
            <li>Scrape, copy, or redistribute any platform content or underlying technology.</li>
            <li>Create accounts using false or misleading identity information.</li>
          </ul>
        </section>

        {/* Section 9 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">9. Limitation of Liability</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker is provided on an &quot;as is&quot; and &quot;as available&quot; basis strictly without any warranties of any kind. We are not liable for the financial decisions you make based on our recommendations.
          </p>
          <p className="text-slate-300 leading-relaxed mb-4">
            To the maximum extent permitted by law, our total cumulative liability to you is limited strictly to the amount you paid to us for the services in the 12 months immediately preceding the claim.
          </p>
          <p className="text-slate-300 leading-relaxed">
            We accept zero liability for any losses, delays, or issues arising directly or indirectly from actions taken by third-party services, including but not limited to banks, energy providers, telecommunications companies, or subscription services.
          </p>
        </section>

        {/* Section 10 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">10. Termination</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            You may close your account at any time via your Profile settings or by emailing <a href="mailto:hello@paybacker.co.uk" className="text-amber-400 hover:text-amber-300">hello@paybacker.co.uk</a>.
          </p>
          <p className="text-slate-300 leading-relaxed mb-4">
            We reserve the right to suspend or terminate accounts indefinitely that violate these terms or local laws. Upon termination, we will permanently delete your user data in accordance with our Privacy Policy.
          </p>
        </section>

        {/* Section 11 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">11. Changes to Terms</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We may update these terms occasionally. If we make material changes, we will communicate them to you via email. Your continued use of the platform after changes have been posted explicitly constitutes your acceptance of the updated terms.
          </p>
        </section>

        {/* Section 12 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">12. Governing Law</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            These terms are governed collectively by the laws of England and Wales. Any disputes arising from these Terms of Service will be subject exclusively to the jurisdiction of the English courts.
          </p>
        </section>

        {/* Section 13 */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">13. Contact</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker LTD is a company registered in England and Wales.<br/>
            Registered Address: 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom
          </p>
          <p className="text-slate-300 leading-relaxed mb-2">Email: <a href="mailto:hello@paybacker.co.uk" className="text-amber-400 hover:text-amber-300">hello@paybacker.co.uk</a></p>
          <p className="text-slate-300 leading-relaxed">Website: <a href="https://paybacker.co.uk" className="text-amber-400 hover:text-amber-300">paybacker.co.uk</a></p>
        </section>

      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-slate-800 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/about" className="hover:text-white transition-all">About</Link>
            <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-all">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
            <a href="mailto:hello@paybacker.co.uk" className="hover:text-white transition-all">Contact</a>
          </div>
          <p>
            Need help? Email <a href="mailto:support@paybacker.co.uk" className="text-amber-500 hover:text-amber-400">support@paybacker.co.uk</a>
          </p>
          <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
