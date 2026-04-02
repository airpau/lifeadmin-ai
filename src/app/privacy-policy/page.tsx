import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Paybacker LTD",
  description:
    "How Paybacker LTD collects, uses and protects your personal data under UK GDPR.",
};

export default function PrivacyPolicyPage() {
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
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Privacy Policy
        </h1>
        <p className="text-slate-500 text-sm mb-10">
          Last updated: March 2026
        </p>

        {/* 1. Who We Are */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            1. Who We Are
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker LTD (&quot;Paybacker&quot;, &quot;we&quot;, &quot;us&quot;,
            &quot;our&quot;) is a company registered in the United Kingdom. We
            operate the website{" "}
            <a
              href="https://paybacker.co.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              paybacker.co.uk
            </a>{" "}
            and provide AI-powered bill analysis and savings recommendation
            services.
          </p>
          <p className="text-slate-300 leading-relaxed">
            For any privacy-related enquiries, you can contact us at{" "}
            <a
              href="mailto:hello@paybacker.co.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              hello@paybacker.co.uk
            </a>
            .
          </p>
        </section>

        {/* 2. Data We Collect */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            2. Data We Collect
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We collect the following categories of personal data:
          </p>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 mb-4">
            <h3 className="text-white font-semibold mb-2">
              Account information
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Your name, email address and password when you create an account.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 mb-4">
            <h3 className="text-white font-semibold mb-2">
              Email data (with your consent)
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Read-only access to your Gmail or Outlook inbox to identify bills,
              contracts and renewal notices. We only read emails relevant to
              household bills and subscriptions.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2">
              Banking data (with your consent)
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Read-only access to your bank transactions via Open Banking
              (powered by Yapily) to identify recurring payments and spending
              patterns. We can never move your money or make payments on your
              behalf.
            </p>
          </div>
        </section>

        {/* 3. How We Use Your Data */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            3. How We Use Your Data
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We use your personal data solely to provide and improve our savings
            identification service. Specifically, we use your data to:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-4">
            <li>Identify bills, subscriptions and recurring payments</li>
            <li>
              Analyse your current tariffs and contracts against available market
              deals
            </li>
            <li>
              Surface personalised switching recommendations in your dashboard
            </li>
            <li>
              Send you alerts when contract end dates are approaching or better
              deals become available
            </li>
            <li>Provide customer support and respond to your enquiries</li>
          </ul>
          <p className="text-slate-300 leading-relaxed">
            Our legal basis for processing is your consent (for email and banking
            data) and legitimate interest (for account management and service
            delivery).
          </p>
        </section>

        {/* 4. Data Storage */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            4. Data Storage
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Your data is stored securely in Supabase, our database provider,
            which hosts data on encrypted servers within the UK and EU. All data
            is encrypted in transit (TLS) and at rest. We follow industry best
            practices for access control and regularly review our security
            measures.
          </p>
        </section>

        {/* 5. Data Sharing */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            5. Data Sharing
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We do not sell, rent or trade your personal data to any third party.
            We may share limited data with the following categories of service
            providers, solely to operate our platform:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300">
            <li>
              <strong className="text-white">Supabase</strong> — database
              hosting and authentication
            </li>
            <li>
              <strong className="text-white">Stripe</strong> — payment
              processing (we never see or store your full card details)
            </li>
            <li>
              <strong className="text-white">Yapily</strong> — Open Banking
              data access (read-only bank transactions)
            </li>
            <li>
              <strong className="text-white">Resend</strong> — transactional
              email delivery
            </li>
          </ul>
        </section>

        {/* 6. Affiliate Disclosure */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            6. Affiliate Disclosure
          </h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-300 leading-relaxed mb-4">
              Paybacker earns referral commissions when you switch to a new
              provider through links on our platform. These are paid by the
              provider, not by you.
            </p>
            <p className="text-slate-300 leading-relaxed">
              This does <strong className="text-white">not</strong> affect the
              price you pay. You will always pay the same price as if you had
              gone directly to the provider. Our recommendations are based on
              genuine savings potential for you, and we clearly disclose all
              affiliate relationships.
            </p>
          </div>
        </section>

        {/* 7. Data Retention and Deletion */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            7. Data Retention and Deletion
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We retain your personal data for as long as your account is active or
            as needed to provide our services. If you close your account, we will
            delete your personal data within 30 days, except where we are legally
            required to retain it (for example, financial records for tax
            purposes).
          </p>
          <p className="text-slate-300 leading-relaxed">
            You can request deletion of your data at any time by emailing{" "}
            <a
              href="mailto:hello@paybacker.co.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              hello@paybacker.co.uk
            </a>
            . We will process your request within 30 days.
          </p>
        </section>

        {/* 8. Cookies */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">8. Cookies</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            We use cookies and similar technologies on our website. These fall
            into two categories:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300">
            <li>
              <strong className="text-white">Essential cookies</strong> —
              required for the website to function (authentication, session
              management). These cannot be disabled.
            </li>
            <li>
              <strong className="text-white">Analytics cookies</strong> — we use
              PostHog and Google Analytics to understand how visitors use our
              website so we can improve it. These are only set with your consent.
            </li>
          </ul>
        </section>

        {/* 9. Your Rights */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            9. Your Rights Under UK GDPR
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Under UK GDPR and the Data Protection Act 2018, you have the
            following rights:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300">
            <li>
              <strong className="text-white">Right of access</strong> — request
              a copy of the personal data we hold about you
            </li>
            <li>
              <strong className="text-white">Right to rectification</strong> —
              ask us to correct any inaccurate or incomplete data
            </li>
            <li>
              <strong className="text-white">Right to erasure</strong> — request
              that we delete your personal data
            </li>
            <li>
              <strong className="text-white">Right to data portability</strong>{" "}
              — receive your data in a structured, commonly used format
            </li>
            <li>
              <strong className="text-white">Right to object</strong> — object
              to certain types of processing, including direct marketing
            </li>
            <li>
              <strong className="text-white">
                Right to restrict processing
              </strong>{" "}
              — ask us to limit how we use your data
            </li>
            <li>
              <strong className="text-white">Right to withdraw consent</strong>{" "}
              — withdraw your consent at any time where processing is based on
              consent
            </li>
          </ul>
          <p className="text-slate-300 leading-relaxed mt-4">
            To exercise any of these rights, email us at{" "}
            <a
              href="mailto:hello@paybacker.co.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              hello@paybacker.co.uk
            </a>
            . If you are not satisfied with our response, you have the right to
            lodge a complaint with the Information Commissioner&apos;s Office
            (ICO) at{" "}
            <a
              href="https://ico.org.uk"
              className="text-amber-400 hover:text-amber-300"
            >
              ico.org.uk
            </a>
            .
          </p>
        </section>

        {/* 10. Changes to This Policy */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            10. Changes to This Policy
          </h2>
          <p className="text-slate-300 leading-relaxed">
            We may update this privacy policy from time to time to reflect
            changes in our practices or legal requirements. If we make
            significant changes, we will notify you by email or by placing a
            prominent notice on our website. We encourage you to review this
            policy periodically.
          </p>
        </section>

        {/* 11. Contact */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">11. Contact</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paybacker LTD is a company registered in England and Wales.<br/>
            Registered Address: 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom
          </p>
          <p className="text-slate-300 leading-relaxed">
            If you have any questions about this privacy policy or how we handle
            your data, please contact us at{" "}
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
