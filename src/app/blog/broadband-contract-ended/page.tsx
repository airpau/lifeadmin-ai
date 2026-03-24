import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "Your Broadband Contract Has Ended - You're Probably Being Overcharged | Paybacker",
  description:
    "Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.",
  openGraph: {
    title:
      "Your Broadband Contract Has Ended - You're Probably Being Overcharged | Paybacker",
    description:
      "Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.",
    url: "https://paybacker.co.uk/blog/broadband-contract-ended",
    siteName: "Paybacker",
    type: "article",
    publishedTime: "2026-03-23T00:00:00Z",
    authors: ["Paybacker"],
  },
  twitter: {
    card: "summary",
    title:
      "Your Broadband Contract Has Ended - You're Probably Being Overcharged | Paybacker",
    description:
      "Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/blog/broadband-contract-ended",
  },
};

export default function BroadbandBlogPost() {
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
        <Link
          href="/blog"
          className="text-amber-400 hover:text-amber-300 text-sm mb-8 inline-block"
        >
          &larr; Back to Blog
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Your Broadband Contract Has Ended — You&apos;re Probably Being
          Overcharged
        </h1>
        <p className="text-slate-500 text-sm mb-8">23 March 2026 &middot; 4 min read</p>

        <p className="text-slate-300 leading-relaxed mb-4">
          If you signed up for a broadband deal 18 or 24 months ago and
          haven&apos;t thought about it since, there&apos;s a very good chance
          you&apos;re now paying significantly more than you need to. In the UK,
          an estimated{" "}
          <strong className="text-white">8.8 million households</strong> are out
          of contract on their broadband — and most of them are overpaying by
          hundreds of pounds a year.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          What Happens When Your Contract Ends
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          When your initial broadband contract period ends (typically 18 or 24
          months), you don&apos;t get cut off. Instead, your provider
          automatically rolls you onto an out-of-contract rate — sometimes called
          a &quot;rolling monthly&quot; plan. This rate is almost always{" "}
          <strong className="text-white">
            significantly higher than what you were paying
          </strong>{" "}
          during your contract.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          For example, a deal that was £25 a month during contract might jump to
          £45 or even £50 once it ends. That&apos;s an extra £240-£300 a year
          for the exact same service — same speed, same router, same everything.
          The only thing that changes is the price.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          The Loyalty Penalty Problem
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          This practice is known as the &quot;loyalty penalty&quot; — loyal
          customers who stay with the same provider end up paying more than new
          customers who sign up for introductory deals. Ofcom has taken steps to
          address this, requiring providers to notify you when your contract is
          ending and tell you about the best deals available. But many people
          miss these notifications or simply don&apos;t act on them.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          On top of that, most broadband providers now include annual mid-contract
          price rises tied to inflation (often CPI + 3.9%). So even if you&apos;re
          still in contract, you might be paying more than you expected when you
          first signed up.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          How to Check If You&apos;re Out of Contract
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          There are a few quick ways to find out:
        </p>

        <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-6">
          <li>
            <strong className="text-white">Check your latest bill</strong> — it
            should state whether you&apos;re in or out of contract
          </li>
          <li>
            <strong className="text-white">Log into your provider&apos;s app or website</strong>{" "}
            — most show your contract status and end date in your account
            settings
          </li>
          <li>
            <strong className="text-white">Think back to when you signed up</strong>{" "}
            — if it was more than two years ago and you haven&apos;t renewed,
            you&apos;re almost certainly out of contract
          </li>
          <li>
            <strong className="text-white">
              Check your email for end-of-contract notifications
            </strong>{" "}
            — your provider is legally required to send one
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          What to Do About It
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          If you&apos;re out of contract, you have several options — and all of
          them are better than doing nothing:
        </p>

        <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-6">
          <li>
            <strong className="text-white">Switch to a new provider</strong> —
            new customer deals are almost always the cheapest option. Switching
            is managed by the new provider and typically takes around two weeks.
            You won&apos;t lose your broadband during the switch.
          </li>
          <li>
            <strong className="text-white">
              Negotiate with your current provider
            </strong>{" "}
            — call their retentions team and ask what deals they can offer you
            as an existing customer. They will often match or come close to new
            customer prices to keep you.
          </li>
          <li>
            <strong className="text-white">Re-contract at a lower rate</strong>{" "}
            — some providers let you sign a new contract online at a better rate
            than your out-of-contract price, without needing to call.
          </li>
        </ul>

        <p className="text-slate-300 leading-relaxed mb-4">
          Since you&apos;re out of contract, there are{" "}
          <strong className="text-white">no exit fees</strong> to worry about.
          You&apos;re free to leave at any time, usually with just 30
          days&apos; notice.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          How Paybacker Helps
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          Keeping track of contract end dates across broadband, mobile, energy
          and insurance is a pain. Paybacker does it automatically. Connect your
          email or bank account, and our AI identifies your broadband provider,
          detects whether you&apos;re in or out of contract, and flags when your
          renewal date is approaching — so you never accidentally roll onto an
          expensive out-of-contract rate.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          We also surface the best deals available right now, personalised to
          your area and usage, so you can switch in minutes rather than spending
          an afternoon on comparison sites.
        </p>

        {/* CTA */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 mt-10">
          <h3 className="text-xl font-bold text-white mb-2">
            Stop overpaying on broadband
          </h3>
          <p className="text-slate-300 mb-4">
            Sign up to Paybacker and we&apos;ll check your contract status and
            find you a better deal. It takes two minutes.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-all"
          >
            Get Started Free
          </Link>
        </div>
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
