import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../_shared";
import "../styles.css";

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

const TOC = [
  { id: "what-happens", label: "What happens when your contract ends" },
  { id: "loyalty-penalty", label: "The loyalty penalty problem" },
  { id: "how-to-check", label: "How to check if you're out of contract" },
  { id: "what-to-do", label: "What to do about it" },
  { id: "how-paybacker-helps", label: "How Paybacker helps" },
];

export default function BroadbandBlogPost() {
  return (
    <PostShell
      category="Broadband"
      title="Your Broadband Contract Has Ended — You're Probably Being Overcharged"
      dek="If your initial 18 or 24-month broadband contract has lapsed, you're almost certainly rolled onto a more expensive out-of-contract rate — for the exact same service."
      dateLabel="23 March 2026"
      readTime="4 min read"
      toc={TOC}
      aside={{
        eyebrow: "Try Paybacker",
        title: "Stop overpaying on broadband",
        description: "Sign up free and we'll check your contract status and find you a better deal — in minutes, not hours.",
        ctaLabel: "Generate your letter free",
        ctaHref: "/dashboard/complaints?type=broadband_complaint&new=1",
      }}
    >
      <p>
        If you signed up for a broadband deal 18 or 24 months ago and haven&apos;t
        thought about it since, there&apos;s a very good chance you&apos;re now
        paying significantly more than you need to. In the UK, an estimated{" "}
        <strong>8.8 million households</strong> are out of contract on their
        broadband — and most of them are overpaying by hundreds of pounds a year.
      </p>

      <h2 id="what-happens">What happens when your contract ends</h2>
      <p>
        When your initial broadband contract period ends (typically 18 or 24
        months), you don&apos;t get cut off. Instead, your provider automatically
        rolls you onto an out-of-contract rate — sometimes called a
        &quot;rolling monthly&quot; plan. This rate is almost always{" "}
        <strong>significantly higher than what you were paying</strong> during
        your contract.
      </p>
      <p>
        For example, a deal that was £25 a month during contract might jump to
        £45 or even £50 once it ends. That&apos;s an extra £240–£300 a year for
        the exact same service — same speed, same router, same everything. The
        only thing that changes is the price.
      </p>

      <h2 id="loyalty-penalty">The loyalty penalty problem</h2>
      <p>
        This practice is known as the &quot;loyalty penalty&quot; — loyal
        customers who stay with the same provider end up paying more than new
        customers who sign up for introductory deals. Ofcom has taken steps to
        address this, requiring providers to notify you when your contract is
        ending and tell you about the best deals available. But many people miss
        these notifications or simply don&apos;t act on them.
      </p>
      <p>
        On top of that, most broadband providers now include annual mid-contract
        price rises tied to inflation (often CPI + 3.9%). So even if you&apos;re
        still in contract, you might be paying more than you expected when you
        first signed up.
      </p>

      <h2 id="how-to-check">How to check if you&apos;re out of contract</h2>
      <p>There are a few quick ways to find out:</p>
      <ul>
        <li>
          <strong>Check your latest bill</strong> — it should state whether
          you&apos;re in or out of contract.
        </li>
        <li>
          <strong>Log into your provider&apos;s app or website</strong> — most
          show your contract status and end date in your account settings.
        </li>
        <li>
          <strong>Think back to when you signed up</strong> — if it was more
          than two years ago and you haven&apos;t renewed, you&apos;re almost
          certainly out of contract.
        </li>
        <li>
          <strong>Check your email for end-of-contract notifications</strong> —
          your provider is legally required to send one.
        </li>
      </ul>

      <h2 id="what-to-do">What to do about it</h2>
      <p>
        If you&apos;re out of contract, you have several options — and all of
        them are better than doing nothing:
      </p>
      <ul>
        <li>
          <strong>Switch to a new provider</strong> — new customer deals are
          almost always the cheapest option. Switching is managed by the new
          provider and typically takes around two weeks. You won&apos;t lose
          your broadband during the switch.
        </li>
        <li>
          <strong>Negotiate with your current provider</strong> — call their
          retentions team and ask what deals they can offer you as an existing
          customer. They will often match or come close to new customer prices
          to keep you.
        </li>
        <li>
          <strong>Re-contract at a lower rate</strong> — some providers let you
          sign a new contract online at a better rate than your out-of-contract
          price, without needing to call.
        </li>
      </ul>
      <p>
        Since you&apos;re out of contract, there are <strong>no exit fees</strong>{" "}
        to worry about. You&apos;re free to leave at any time, usually with just
        30 days&apos; notice.
      </p>

      <h2 id="how-paybacker-helps">How Paybacker helps</h2>
      <p>
        Keeping track of contract end dates across broadband, mobile, energy and
        insurance is a pain. Paybacker does it automatically. Connect your email
        or bank account, and our AI identifies your broadband provider, detects
        whether you&apos;re in or out of contract, and flags when your renewal
        date is approaching — so you never accidentally roll onto an expensive
        out-of-contract rate.
      </p>
      <p>
        We also surface the best deals available right now, personalised to your
        area and usage, so you can switch in minutes rather than spending an
        afternoon on comparison sites.
      </p>

      <div className="post-cta">
        <h3>Stop overpaying on broadband</h3>
        <p>
          Sign up to Paybacker and we&apos;ll check your contract status and find
          you a better deal. It takes two minutes.
        </p>
        <Link
          className="btn btn-mint"
          href="/dashboard/complaints?type=broadband_complaint&new=1"
        >
          Generate your broadband complaint letter free
        </Link>
      </div>

      <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 24 }}>
        Prefer to browse first? <Link href={SIGNUP_HREF}>Create a free Paybacker account</Link> and connect your email — we&apos;ll scan for your broadband bill in under a minute.
      </p>
    </PostShell>
  );
}
