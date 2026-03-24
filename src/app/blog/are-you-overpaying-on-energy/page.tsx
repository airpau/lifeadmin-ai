import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "Are You Overpaying on Energy in 2026? Here's How to Find Out | Paybacker",
  description:
    "The energy price cap hits £1,641 from April 2026. Find out if you're on an expensive standard variable tariff and how switching could save you hundreds.",
  openGraph: {
    title:
      "Are You Overpaying on Energy in 2026? Here's How to Find Out | Paybacker",
    description:
      "The energy price cap hits £1,641 from April 2026. Find out if you're on an expensive standard variable tariff and how switching could save you hundreds.",
    url: "https://paybacker.co.uk/blog/are-you-overpaying-on-energy",
    siteName: "Paybacker",
    type: "article",
    publishedTime: "2026-03-23T00:00:00Z",
    authors: ["Paybacker"],
  },
  twitter: {
    card: "summary",
    title:
      "Are You Overpaying on Energy in 2026? Here's How to Find Out | Paybacker",
    description:
      "The energy price cap hits £1,641 from April 2026. Find out if you're on an expensive standard variable tariff and how switching could save you hundreds.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/blog/are-you-overpaying-on-energy",
  },
};

export default function EnergyBlogPost() {
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
          Are You Overpaying on Energy in 2026? Here&apos;s How to Find Out
        </h1>
        <p className="text-slate-500 text-sm mb-8">23 March 2026 &middot; 4 min read</p>

        <p className="text-slate-300 leading-relaxed mb-4">
          Energy bills have been one of the biggest household expenses in the UK
          for several years now, and 2026 is no different. With the Ofgem energy
          price cap set at <strong className="text-white">£1,641 per year</strong> for a
          typical dual-fuel household from April 2026, millions of people are
          paying more than they need to — without even realising it.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          The price cap doesn&apos;t limit your total bill. It caps the maximum
          unit rate and standing charge your supplier can charge if you&apos;re
          on a standard variable tariff (SVT). If you use more energy than
          average, you&apos;ll pay more than £1,641. And if you haven&apos;t
          switched in a while, you&apos;re almost certainly on an SVT — the most
          expensive type of tariff.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          Standard Variable Tariffs vs Fixed Deals
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          When your fixed energy deal ends, your supplier automatically moves
          you onto their standard variable tariff. This is typically the most
          expensive rate they offer. It&apos;s designed to be a default, not a
          good deal.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          Fixed deals, on the other hand, lock in your unit rate for 12 or 24
          months. Right now, some of the best fixed tariffs are priced{" "}
          <strong className="text-white">below the price cap</strong>, meaning
          you could save a significant amount by switching away from your SVT.
          The difference can be anywhere from £100 to £300 or more per year,
          depending on your usage.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          Signs You&apos;re Overpaying
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          You&apos;re likely overpaying on energy if any of the following apply
          to you:
        </p>

        <ul className="list-disc pl-6 space-y-2 text-slate-300 mb-6">
          <li>
            You haven&apos;t switched energy supplier or tariff in the last two
            years
          </li>
          <li>
            You&apos;re not currently on a fixed-rate deal (check your latest
            bill — it will say &quot;variable&quot; or &quot;standard&quot;)
          </li>
          <li>
            Your annual energy spend is above £1,641 for a typical three-bedroom
            house
          </li>
          <li>
            You&apos;ve never compared your unit rate against what&apos;s
            available on the market
          </li>
          <li>
            You moved into a new property and never changed the default energy
            supplier
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          How to Check What You&apos;re Actually Paying
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          The two numbers that matter most on your energy bill are your{" "}
          <strong className="text-white">unit rate</strong> (the cost per
          kilowatt-hour of gas and electricity you use) and your{" "}
          <strong className="text-white">standing charge</strong> (a daily fixed
          fee just for having a supply connected).
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          Find these on your latest bill or your online account. Then compare
          them against the best deals currently available. If your unit rate is
          higher than the cheapest fixed deals on the market, you&apos;re leaving
          money on the table.
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          Switching Is Easier Than You Think
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          Many people put off switching because they assume it&apos;s
          complicated. In reality, it takes about five minutes. You don&apos;t
          need to call anyone, no engineer needs to visit, and your supply is
          never interrupted. The switch typically completes within five working
          days, and your new supplier handles everything — including contacting
          your old one.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          If you&apos;re on a standard variable tariff, there are no exit fees.
          If you&apos;re on a fixed deal that hasn&apos;t ended yet, check
          whether the savings from switching outweigh any early exit penalty
          (usually £30-£50 per fuel).
        </p>

        <h2 className="text-2xl font-bold text-white mt-10 mb-4">
          Let Paybacker Do the Work for You
        </h2>

        <p className="text-slate-300 leading-relaxed mb-4">
          Comparing tariffs manually is doable, but it takes time — and you need
          to remember to do it every year. Paybacker automates this entirely. Connect
          your email or bank account, and our AI scans your energy bills,
          identifies your current tariff, and surfaces the best deals available
          right now. No forms to fill in, no comparison sites to trawl through.
        </p>

        <p className="text-slate-300 leading-relaxed mb-4">
          We also alert you before your fixed deal ends, so you never
          accidentally roll onto an expensive standard variable tariff again.
        </p>

        {/* CTA */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 mt-10">
          <h3 className="text-xl font-bold text-white mb-2">
            Find out if you&apos;re overpaying
          </h3>
          <p className="text-slate-300 mb-4">
            Sign up to Paybacker and let our AI scan your bills. It takes two
            minutes and could save you hundreds.
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
