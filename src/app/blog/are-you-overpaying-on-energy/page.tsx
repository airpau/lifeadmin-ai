import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../_shared";
import "../styles.css";

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

const TOC = [
  { id: "svt-vs-fixed", label: "Standard variable vs fixed deals" },
  { id: "signs", label: "Signs you're overpaying" },
  { id: "how-to-check", label: "How to check what you're paying" },
  { id: "switching", label: "Switching is easier than you think" },
  { id: "paybacker", label: "Let Paybacker do the work" },
];

export default function EnergyBlogPost() {
  return (
    <PostShell
      category="Energy"
      title="Are You Overpaying on Energy in 2026? Here's How to Find Out"
      dek="The Ofgem price cap lands at £1,641 from April 2026 — but that's just a maximum unit rate, not a total. If you haven't switched in two years, you're almost certainly on the most expensive tariff your supplier offers."
      dateLabel="23 March 2026"
      readTime="4 min read"
      toc={TOC}
      aside={{
        eyebrow: "Try Paybacker",
        title: "Find out if you're overpaying",
        description: "Sign up free and let our AI scan your energy bills. It takes two minutes and could save you hundreds.",
        ctaLabel: "Generate your letter free",
        ctaHref: "/dashboard/complaints?type=energy_dispute&new=1",
      }}
    >
      <p>
        Energy bills have been one of the biggest household expenses in the UK
        for several years now, and 2026 is no different. With the Ofgem energy
        price cap set at <strong>£1,641 per year</strong> for a typical dual-fuel
        household from April 2026, millions of people are paying more than they
        need to — without even realising it.
      </p>
      <p>
        The price cap doesn&apos;t limit your total bill. It caps the maximum
        unit rate and standing charge your supplier can charge if you&apos;re on
        a standard variable tariff (SVT). If you use more energy than average,
        you&apos;ll pay more than £1,641. And if you haven&apos;t switched in a
        while, you&apos;re almost certainly on an SVT — the most expensive type
        of tariff.
      </p>

      <h2 id="svt-vs-fixed">Standard variable tariffs vs fixed deals</h2>
      <p>
        When your fixed energy deal ends, your supplier automatically moves you
        onto their standard variable tariff. This is typically the most expensive
        rate they offer. It&apos;s designed to be a default, not a good deal.
      </p>
      <p>
        Fixed deals, on the other hand, lock in your unit rate for 12 or 24
        months. Right now, some of the best fixed tariffs are priced{" "}
        <strong>below the price cap</strong>, meaning you could save a
        significant amount by switching away from your SVT. The difference can
        be anywhere from £100 to £300 or more per year, depending on your usage.
      </p>

      <h2 id="signs">Signs you&apos;re overpaying</h2>
      <p>You&apos;re likely overpaying on energy if any of the following apply to you:</p>
      <ul>
        <li>You haven&apos;t switched energy supplier or tariff in the last two years.</li>
        <li>
          You&apos;re not currently on a fixed-rate deal (check your latest bill —
          it will say &quot;variable&quot; or &quot;standard&quot;).
        </li>
        <li>Your annual energy spend is above £1,641 for a typical three-bedroom house.</li>
        <li>You&apos;ve never compared your unit rate against what&apos;s available on the market.</li>
        <li>You moved into a new property and never changed the default energy supplier.</li>
      </ul>

      <h2 id="how-to-check">How to check what you&apos;re actually paying</h2>
      <p>
        The two numbers that matter most on your energy bill are your{" "}
        <strong>unit rate</strong> (the cost per kilowatt-hour of gas and
        electricity you use) and your <strong>standing charge</strong> (a daily
        fixed fee just for having a supply connected).
      </p>
      <p>
        Find these on your latest bill or your online account. Then compare them
        against the best deals currently available. If your unit rate is higher
        than the cheapest fixed deals on the market, you&apos;re leaving money
        on the table.
      </p>

      <h2 id="switching">Switching is easier than you think</h2>
      <p>
        Many people put off switching because they assume it&apos;s complicated.
        In reality, it takes about five minutes. You don&apos;t need to call
        anyone, no engineer needs to visit, and your supply is never
        interrupted. The switch typically completes within five working days,
        and your new supplier handles everything — including contacting your old
        one.
      </p>
      <p>
        If you&apos;re on a standard variable tariff, there are no exit fees. If
        you&apos;re on a fixed deal that hasn&apos;t ended yet, check whether the
        savings from switching outweigh any early exit penalty (usually £30–£50
        per fuel).
      </p>

      <h2 id="paybacker">Let Paybacker do the work for you</h2>
      <p>
        Comparing tariffs manually is doable, but it takes time — and you need to
        remember to do it every year. Paybacker automates this entirely. Connect
        your email or bank account, and our AI scans your energy bills, identifies
        your current tariff, and surfaces the best deals available right now. No
        forms to fill in, no comparison sites to trawl through.
      </p>
      <p>
        We also alert you before your fixed deal ends, so you never accidentally
        roll onto an expensive standard variable tariff again.
      </p>

      <div className="post-cta">
        <h3>Find out if you&apos;re overpaying</h3>
        <p>
          Sign up to Paybacker and let our AI scan your bills. It takes two
          minutes and could save you hundreds.
        </p>
        <Link
          className="btn btn-mint"
          href="/dashboard/complaints?type=energy_dispute&new=1"
        >
          Generate your energy dispute letter free
        </Link>
      </div>

      <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 24 }}>
        Want to browse before signing up? <Link href={SIGNUP_HREF}>Create a free account</Link> and our AI will flag any expensive tariff the moment you connect your email or bank.
      </p>
    </PostShell>
  );
}
