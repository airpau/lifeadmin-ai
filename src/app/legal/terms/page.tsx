import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service — Paybacker LTD',
  description: 'Terms and conditions for using Paybacker LTD.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="container mx-auto px-6 py-6 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Sparkles className="h-6 w-6 text-amber-500" />
          <span className="text-xl font-bold text-white">Pay<span className="text-amber-500">Backer</span></span>
        </Link>
      </header>

      <main className="container mx-auto px-6 py-16 max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
        <p className="text-slate-400 mb-12">Last updated: 20 March 2026</p>

        <div className="space-y-10 text-slate-300 leading-relaxed text-sm">

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. About Paybacker LTD</h2>
            <p>
              Paybacker LTD (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) provides an AI-powered tool that helps UK consumers
              identify billing errors, draft complaint letters, and cancel unwanted subscriptions.
              By using Paybacker LTD, you agree to these Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Not legal advice</h2>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 mb-4">
              <p className="font-semibold text-amber-400 mb-2">Important disclaimer</p>
              <p>
                Paybacker LTD generates complaint letters and cancellation emails using AI. This content is
                provided as a <strong className="text-white">drafting tool only</strong> and does not
                constitute legal advice. You are responsible for reviewing all content before sending it.
                Paybacker LTD is not a law firm and is not regulated by the Solicitors Regulation Authority (SRA).
              </p>
            </div>
            <p>
              This model is the same approach used by Resolver, Which?, and MoneySavingExpert — all of which
              operate without legal authorisation because they assist users rather than give regulated advice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Your account</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be 18 or older to use Paybacker LTD.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must provide accurate information when creating your account.</li>
              <li>One account per person. Do not share accounts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Email and data access</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Gmail and Outlook connections are <strong className="text-white">read-only</strong>. Paybacker LTD
                cannot send emails, delete messages, or modify your inbox in any way.
              </li>
              <li>
                Paybacker LTD will never send an email on your behalf without your explicit approval of each individual message.
              </li>
              <li>You can disconnect any email integration at any time from the Scanner page.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Subscriptions and billing</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Paid plans are billed monthly or annually in advance via Stripe.</li>
              <li>You can cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.</li>
              <li>Refunds are not provided for partial months, except where required by UK consumer law.</li>
              <li>
                Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013,
                you have a 14-day cooling-off period from the date of purchase. To exercise this right,
                email <a href="mailto:support@paybacker.co.uk" className="text-amber-400 hover:underline">support@paybacker.co.uk</a>.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Free tier</h2>
            <p>
              Free accounts include 3 AI complaint letters per month and limited scanning. Free tier usage is
              subject to fair-use limits. We reserve the right to restrict access if automated or abusive usage is detected.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Acceptable use</h2>
            <p>You must not use Paybacker LTD to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Submit fraudulent or misleading complaint letters</li>
              <li>Harass or threaten companies or individuals</li>
              <li>Attempt to access other users&apos; data</li>
              <li>Reverse engineer or scrape the service</li>
              <li>Violate any applicable law or regulation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Intellectual property</h2>
            <p>
              AI-generated complaint letters and cancellation emails are provided to you for your personal use.
              Paybacker LTD retains no ownership rights over content you generate. The Paybacker LTD platform, design,
              and underlying code are owned by us and may not be copied or reproduced.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Limitation of liability</h2>
            <p>
              Paybacker LTD provides a drafting tool, not a guaranteed outcome. We are not liable for:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>The outcome of any complaint or cancellation you send</li>
              <li>Any loss or damage arising from inaccurate AI-generated content that you did not review</li>
              <li>Third-party service outages (Google, Microsoft, Stripe, etc.)</li>
            </ul>
            <p className="mt-4">
              To the extent permitted by UK law, our total liability to you is capped at the amount you paid us
              in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">10. Termination</h2>
            <p>
              You can delete your account at any time from Profile → Delete Account. We may suspend or terminate
              accounts that violate these terms, with reasonable notice where possible.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">11. Changes to these terms</h2>
            <p>
              We may update these terms. We will notify you by email at least 14 days before material changes
              take effect. Continued use after that date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">12. Governing law</h2>
            <p>
              These terms are governed by English law. Any disputes will be subject to the exclusive jurisdiction
              of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">13. Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:support@paybacker.co.uk" className="text-amber-400 hover:underline">support@paybacker.co.uk</a>
            </p>
          </section>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-slate-800 mt-16">
        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-white transition-all">Home</Link>
          <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy Policy</Link>
          <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
        </div>
      </footer>
    </div>
  );
}
