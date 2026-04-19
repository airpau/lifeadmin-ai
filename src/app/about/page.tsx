import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PublicNavbar from '@/components/PublicNavbar';

export const metadata: Metadata = {
  title: "About Paybacker - Fighting for UK Consumers",
  description:
    "Paybacker was built so normal people don't need a lawyer to fight back against unfair bills. Founded by Paul Airey. Know your rights. Fight for your rights.",
  openGraph: {
    title: "About Paybacker - Fighting for UK Consumers",
    description:
      "Paybacker was built so normal people don't need a lawyer to fight back against unfair bills. Founded by Paul Airey. Know your rights. Fight for your rights.",
    url: "https://paybacker.co.uk/about",
    siteName: "Paybacker",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "About Paybacker - Fighting for UK Consumers",
    description:
      "Paybacker was built so normal people don't need a lawyer to fight back against unfair bills. Founded by Paul Airey. Know your rights. Fight for your rights.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/about",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />
      <div className="h-16" />

      <main className="container mx-auto px-4 md:px-6 py-10 md:py-16 max-w-3xl">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            About Paybacker
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-4">
            Most UK households are being overcharged by hundreds of pounds a year on bills they could dispute. Paybacker was built to change that.
          </p>
          <p className="text-lg text-slate-400 leading-relaxed">
            We give every UK consumer access to the legal tools and AI intelligence to find every hidden charge, dispute it professionally, and stop paying more than they should. No legal fees. No lawyers. No giving in.
          </p>
        </div>

        {/* What Paybacker Is */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            What Paybacker Is
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Most people are paying more than they need to on everyday bills —
            energy, broadband, mobile, insurance and subscriptions. The problem
            is that finding better deals takes time, and it's easy to let
            renewals slip by unnoticed.
          </p>
          <p className="text-slate-300 leading-relaxed">
            Paybacker solves this by connecting securely to your email and bank
            accounts, using AI to analyse your bills and contracts, and surfacing
            personalised switching recommendations that could save you hundreds
            of pounds a year. No spreadsheets, no hours on comparison sites —
            just clear, actionable savings.
          </p>
        </section>

        {/* How It Works */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">How It Works</h2>
          <div className="grid gap-4">
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-mint-400 font-bold text-lg mt-0.5">
                  1
                </span>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Connect your email and bank securely
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    We use read-only access via Gmail, Outlook and Open Banking
                    (powered by Yapily, FCA regulated). We never store your login credentials
                    and can never move your money.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-mint-400 font-bold text-lg mt-0.5">
                  2
                </span>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    AI analyses your bills and contracts
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Our AI reads your bills, identifies your tariffs, contract
                    end dates and spending patterns, then compares them against
                    the best deals currently available in the UK market.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-mint-400 font-bold text-lg mt-0.5">
                  3
                </span>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Your dashboard shows where you save
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    See a clear breakdown of potential savings across every
                    category — energy, broadband, mobile, insurance and
                    subscriptions — with direct links to switch.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Story */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Our Story
          </h2>
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <p>
              I spent a decade working as an IT specialist inside some of the UK&apos;s biggest law firms and banks. I saw first-hand how institutions protect their interests: layers of process, deliberate complexity, terms and conditions written by lawyers so you can&apos;t use them against the company.
            </p>
            <p>
              Then I got home one evening and opened a £400 energy bill I hadn&apos;t been expecting. I knew it wasn&apos;t right. When I called to dispute it, I was passed between departments for 45 minutes before giving up. A few weeks later I found a cancellation clause buried in paragraph 14 of my gym contract — and three streaming subscriptions quietly draining an old card I barely used.
            </p>
            <p>
              The worst part wasn&apos;t the money. It was knowing the tools to fight back already existed — the Consumer Rights Act 2015, Ofgem&apos;s billing codes, UK261 for flight delays. UK law is genuinely on the consumer&apos;s side. It&apos;s just written in language that takes time and specialist knowledge to decode, and most people don&apos;t have either to spare.
            </p>
            <p>
              That&apos;s exactly what big corporations count on. Most people give up — not because the company is right, but because fighting back feels impossibly complicated. Hiring a solicitor to dispute a £400 bill costs more than the bill. So people pay up, and feel powerless.
            </p>
            <p>
              I built Paybacker to change that. You connect your bank and email; the AI finds every hidden charge, forgotten subscription and overpriced contract in minutes, then drafts the formal complaint letter — citing the exact UK legislation that applies to your case — in 30 seconds. No legal fees. No hold music. No giving up.
            </p>
            <p className="text-white font-semibold text-base pt-2">
              Know your rights. Fight for your rights. Paybacker makes it simple.
            </p>
          </div>
        </section>

        {/* Meet the Founder */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">
            Meet the Founder
          </h2>
          <div className="bg-navy-900 border border-mint-400/20 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row items-start gap-6 mb-6">
              <div className="shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-mint-400/30 to-brand-400/30 border border-mint-400/30 flex items-center justify-center">
                  <span className="text-2xl font-bold text-mint-400">PA</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Paul Airey</h3>
                <p className="text-mint-400 text-sm font-medium mb-4">Founder &amp; CEO, Paybacker LTD</p>
                <div className="flex items-center gap-2">
                  <a
                    href="https://www.linkedin.com/in/paul-airey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-navy-600 bg-navy-800 text-slate-300 hover:text-mint-400 hover:border-mint-400/50 hover:bg-mint-400/5 text-xs font-medium transition-all"
                    aria-label="Paul Airey on LinkedIn"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>
            <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
              <p>
                A computer science graduate, Paul spent ten years as an IT specialist inside some of the UK&apos;s largest law firms and banks — watching how institutions quietly protect themselves from the people they&apos;re meant to serve, and how rarely ordinary people come out on top.
              </p>
              <p>
                After one too many unjustified bills, impossible cancellations, and charges buried deep in the small print, he built the tool he wished he&apos;d had.
              </p>
              <p className="text-slate-400 italic border-l-2 border-mint-400/40 pl-4">
                &ldquo;The system is designed to make you give up. Paybacker is designed to make sure you don&apos;t have to.&rdquo;
              </p>
            </div>
          </div>
        </section>

        {/* Trust & Transparency */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Trust &amp; Transparency
          </h2>
          <div className="bg-navy-900 border border-mint-400/30 rounded-2xl p-5">
            <p className="text-slate-300 leading-relaxed mb-4">
              We believe in full transparency about how we operate and earn
              revenue.
            </p>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">
                    Affiliate relationships disclosed.
                  </strong>{" "}
                  When you switch through our links, we may earn a referral
                  commission from the provider. This never affects the price you
                  pay.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">
                    Read-only data access.
                  </strong>{" "}
                  We can read your emails and bank transactions to find savings.
                  We can never send emails on your behalf, make payments or move
                  money.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">
                    Your data is never sold.
                  </strong>{" "}
                  We do not sell, share or monetise your personal data. Full
                  stop.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">Regulated under UK law.</strong>{" "}
                  We comply with UK GDPR, the Data Protection Act 2018 and all
                  applicable consumer protection regulations.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Company Info */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Company Information
          </h2>
          <p className="text-slate-300 leading-relaxed mb-2">
            Paybacker LTD is a company registered in England and Wales.<br/>
            Registered Address: 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom
          </p>
          <p className="text-slate-300 leading-relaxed">
            For any questions, feedback or press enquiries, contact us at{" "}
            <a
              href="mailto:hello@paybacker.co.uk"
              className="text-mint-400 hover:text-mint-300"
            >
              hello@paybacker.co.uk
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="container mx-auto px-4 md:px-6 py-8 border-t border-navy-700/50 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <Link href="/about" className="hover:text-white transition-all">
              About
            </Link>
            <Link href="/blog" className="hover:text-white transition-all">
              Blog
            </Link>
            <Link
              href="/privacy-policy"
              className="hover:text-white transition-all"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="hover:text-white transition-all"
            >
              Terms of Service
            </Link>
            <Link href="/pricing" className="hover:text-white transition-all">
              Pricing
            </Link>
            <a
              href="mailto:hello@paybacker.co.uk"
              className="hover:text-white transition-all"
            >
              Contact
            </a>
          </div>
          <p>
            Need help? Email{" "}
            <a
              href="mailto:support@paybacker.co.uk"
              className="text-mint-400 hover:text-mint-300"
            >
              support@paybacker.co.uk
            </a>
          </p>
          <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
