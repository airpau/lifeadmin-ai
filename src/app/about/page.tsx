import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Paybacker - AI-Powered Consumer Finance Platform",
  description:
    "Paybacker helps UK consumers save money on bills, subscriptions, and contracts using AI and Open Banking. Founded in 2026.",
  openGraph: {
    title: "About Paybacker - AI-Powered Consumer Finance Platform",
    description:
      "Paybacker helps UK consumers save money on bills, subscriptions, and contracts using AI and Open Banking. Founded in 2026.",
    url: "https://paybacker.co.uk/about",
    siteName: "Paybacker",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "About Paybacker - AI-Powered Consumer Finance Platform",
    description:
      "Paybacker helps UK consumers save money on bills, subscriptions, and contracts using AI and Open Banking. Founded in 2026.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/about",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="container mx-auto px-6 py-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
            <span className="text-xl font-bold text-white">
              Pay<span className="text-amber-500">backer</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 md:gap-3 text-sm">
            <Link
              href="/about"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              About
            </Link>
            <Link
              href="/blog"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Blog
            </Link>
            <Link
              href="/pricing"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Pricing
            </Link>
            <Link
              href="/auth/login"
              className="text-slate-300 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-16 max-w-3xl">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            About Paybacker
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Paybacker is an AI-powered savings platform built for UK consumers.
            We scan your bills, spot where you're overpaying, and show you
            exactly how to save — all in one dashboard.
          </p>
        </div>

        {/* What Paybacker Is */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">
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
          <h2 className="text-2xl font-bold text-white mb-4">How It Works</h2>
          <div className="grid gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-amber-500 font-bold text-lg mt-0.5">
                  1
                </span>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Connect your email and bank securely
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    We use read-only access via Gmail, Outlook and Open Banking
                    (powered by Finexer). We never store your login credentials
                    and can never move your money.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-amber-500 font-bold text-lg mt-0.5">
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
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-amber-500 font-bold text-lg mt-0.5">
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

        {/* Why We Built It */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">
            Why We Built It
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We built Paybacker because we were tired of overpaying. The average
            UK household wastes hundreds of pounds a year on bills they could
            reduce — simply because switching providers is tedious, confusing and
            easy to put off.
          </p>
          <p className="text-slate-300 leading-relaxed">
            Comparison sites help, but they still require you to gather your
            details, input them manually and trawl through results. Paybacker
            removes that friction entirely. Connect once, and our AI does the
            hard work for you — continuously monitoring your bills and alerting
            you when there's a better deal.
          </p>
        </section>

        {/* Trust & Transparency */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">
            Trust &amp; Transparency
          </h2>
          <div className="bg-slate-900/50 border border-amber-500/30 rounded-xl p-5">
            <p className="text-slate-300 leading-relaxed mb-4">
              We believe in full transparency about how we operate and earn
              revenue.
            </p>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">&#8226;</span>
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
                <span className="text-amber-500 mt-1">&#8226;</span>
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
                <span className="text-amber-500 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">
                    Your data is never sold.
                  </strong>{" "}
                  We do not sell, share or monetise your personal data. Full
                  stop.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">&#8226;</span>
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
          <h2 className="text-2xl font-bold text-white mb-4">
            Company Information
          </h2>
          <p className="text-slate-300 leading-relaxed mb-2">
            Paybacker LTD is a company registered in the United Kingdom.
          </p>
          <p className="text-slate-300 leading-relaxed">
            For any questions, feedback or press enquiries, contact us at{" "}
            <a
              href="mailto:hello@paybacker.co.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              hello@paybacker.co.uk
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-slate-800 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-6">
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
              href="/legal/terms"
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
              className="text-amber-500 hover:text-amber-400"
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
