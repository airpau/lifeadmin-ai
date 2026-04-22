import type { Metadata } from "next";
import Link from "next/link";
import { PostShell } from "../_shared";
import "../styles.css";

export const metadata: Metadata = {
  title: "How to Claim Flight Delay Compensation UK 2026 - Up to £520",
  description:
    "Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person for delayed or cancelled flights. Free AI claim letter generator.",
  keywords: [
    "flight delay compensation UK",
    "UK261 claim",
    "flight cancelled compensation",
    "delayed flight refund",
    "how to claim flight delay",
  ],
  openGraph: {
    title: "How to Claim Flight Delay Compensation UK 2026 - Up to £520",
    description:
      "Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person.",
    url: "https://paybacker.co.uk/blog/how-to-claim-flight-delay-compensation-uk",
    type: "article",
    publishedTime: "2026-03-25T00:00:00Z",
    authors: ["Paybacker"],
  },
  twitter: {
    card: "summary",
    title: "How to Claim Flight Delay Compensation UK - Up to £520",
    description: "Complete guide to flight delay compensation under UK261.",
  },
  alternates: {
    canonical:
      "https://paybacker.co.uk/blog/how-to-claim-flight-delay-compensation-uk",
  },
};

const TOC = [
  { id: "what-is-uk261", label: "What is UK261?" },
  { id: "how-much", label: "How much can you claim?" },
  { id: "when", label: "When can you claim?" },
  { id: "extraordinary", label: "Extraordinary circumstances" },
  { id: "step-by-step", label: "How to claim step by step" },
  { id: "how-long", label: "How long do I have?" },
  { id: "connecting", label: "Connecting flights" },
  { id: "faq", label: "FAQ" },
];

export default function FlightDelayCompensationPost() {
  return (
    <PostShell
      category="Flight delays"
      title="How to Claim Flight Delay Compensation in the UK: Up to £520 Per Person"
      dek="If your flight was delayed by 3+ hours, cancelled with less than 14 days notice, or you were denied boarding, you could be owed between £220 and £520 per person — and you can go back 6 years."
      dateLabel="25 March 2026"
      readTime="8 min read"
      toc={TOC}
      aside={{
        eyebrow: "Try Paybacker",
        title: "Generate your UK261 claim in 30 seconds",
        description: "Our AI writes a formal claim letter citing UK261 regulations with the exact compensation amount you're owed. Free to use.",
        ctaLabel: "Generate your letter free",
        ctaHref: "/dashboard/complaints?type=flight_compensation&new=1",
      }}
    >
      <div className="callout">
        <div className="label">Key takeaway</div>
        <p style={{ margin: 0 }}>
          If your flight was delayed by 3+ hours, cancelled with less than 14
          days notice, or you were denied boarding, you could be owed between
          £220 and £520 per person. You can claim for flights in the last 6
          years. Over £600 million goes unclaimed by UK passengers every year.
        </p>
      </div>

      <h2 id="what-is-uk261">What is UK261?</h2>
      <p>
        After Brexit, the UK replaced EU Regulation 261/2004 with its own
        version known as UK261. This regulation protects passengers on flights
        departing from a UK airport, or arriving in the UK on a UK or EU airline.
      </p>
      <p>
        Under UK261, airlines must compensate you if your flight was
        significantly delayed, cancelled, or you were denied boarding — unless
        the disruption was caused by extraordinary circumstances like severe
        weather or air traffic control strikes.
      </p>

      <h2 id="how-much">How much can you claim?</h2>
      <p>Compensation is based on the flight distance, not the ticket price:</p>

      <table className="post-table">
        <thead>
          <tr>
            <th>Flight distance</th>
            <th>Example routes</th>
            <th className="num">Compensation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Under 1,500km</td>
            <td>London to Paris, Edinburgh, Amsterdam</td>
            <td className="num">£220</td>
          </tr>
          <tr>
            <td>1,500km – 3,500km</td>
            <td>London to Tenerife, Athens, Istanbul</td>
            <td className="num">£350</td>
          </tr>
          <tr>
            <td>Over 3,500km</td>
            <td>London to New York, Dubai, Bangkok</td>
            <td className="num">£520</td>
          </tr>
        </tbody>
      </table>

      <p>
        This is per person, per flight. A family of four on a long-haul flight
        could claim up to £2,080.
      </p>

      <h2 id="when">When can you claim?</h2>
      <p>You can claim compensation if:</p>
      <ul>
        <li>Your flight arrived more than 3 hours late at your final destination.</li>
        <li>Your flight was cancelled with less than 14 days notice.</li>
        <li>You were denied boarding (e.g. overbooking).</li>
        <li>The flight departed from a UK airport (any airline).</li>
        <li>The flight arrived in the UK on a UK or EU airline.</li>
      </ul>

      <h2 id="extraordinary">What counts as extraordinary circumstances?</h2>
      <p>
        Airlines often reject claims citing extraordinary circumstances. Here is
        what does and does not count:
      </p>

      <div className="pair-grid">
        <div className="pair-card warn">
          <div className="label">Not extraordinary (you CAN claim)</div>
          <ul>
            <li>Technical faults with the aircraft</li>
            <li>Crew shortages or illness</li>
            <li>IT system failures</li>
            <li>Bird strikes (debated)</li>
            <li>Baggage loading issues</li>
            <li>Late incoming aircraft</li>
          </ul>
        </div>
        <div className="pair-card ok">
          <div className="label">Is extraordinary (airline exempt)</div>
          <ul>
            <li>Severe weather (not just bad weather)</li>
            <li>Air traffic control strikes</li>
            <li>Security threats or airport closures</li>
            <li>Political instability</li>
            <li>Medical emergencies on board</li>
            <li>Volcanic ash</li>
          </ul>
        </div>
      </div>

      <h2 id="step-by-step">How to claim: step by step</h2>
      <div className="step-card">
        <div className="step-num">1</div>
        <div className="step-title">Gather your details</div>
        <p>
          You need your flight number, date of travel, departure and arrival
          airports, and a description of what happened (delay length,
          cancellation notice, etc.).
        </p>
      </div>
      <div className="step-card">
        <div className="step-num">2</div>
        <div className="step-title">Write a formal claim letter</div>
        <p>
          Your claim must cite UK261 regulations specifically and state the
          compensation amount you are owed based on flight distance. This is
          where most people get stuck.
        </p>
      </div>
      <div className="step-card">
        <div className="step-num">3</div>
        <div className="step-title">Send to the airline</div>
        <p>
          Email the airline&apos;s complaints department directly. Most airlines
          have a dedicated compensation claims form on their website.
        </p>
      </div>
      <div className="step-card">
        <div className="step-num">4</div>
        <div className="step-title">Wait for a response</div>
        <p>
          Airlines have 8 weeks to respond. If they reject your claim or do not
          respond, you can escalate to CEDR (Centre for Effective Dispute
          Resolution) for free.
        </p>
      </div>

      <h2 id="how-long">How long do I have to claim?</h2>
      <p>
        In the UK, you can claim for flights delayed in the{" "}
        <strong>last 6 years</strong>. So if you had a delayed flight in 2020,
        2021, 2022, 2023, 2024, or 2025, you could still be owed money now.
      </p>

      <h2 id="connecting">Can I claim for a connecting flight?</h2>
      <p>
        Yes. If your connecting flights were booked as a single itinerary and
        you arrived at your final destination more than 3 hours late, you can
        claim based on the total distance from departure to final destination.
      </p>

      <div className="post-cta">
        <h3>Generate your flight compensation claim in 30 seconds</h3>
        <p>
          Our AI writes a formal claim letter citing UK261 regulations with the
          exact compensation amount you are owed. Free to use.
        </p>
        <Link
          className="btn btn-mint"
          href="/dashboard/complaints?type=flight_compensation&new=1"
        >
          Generate your flight claim letter free
        </Link>
        <p style={{ fontSize: 12, marginTop: 12, color: "var(--text-on-ink-dim)" }}>
          No credit card required. 3 free letters per month.
        </p>
      </div>

      <h2 id="faq">Frequently asked questions</h2>
      <div className="faq-card">
        <h3>Do I need a solicitor?</h3>
        <p>
          No. You can claim directly with the airline yourself. A formal letter
          citing the correct regulations is usually enough. Paybacker generates
          this letter for you for free.
        </p>
      </div>
      <div className="faq-card">
        <h3>What if the airline says no?</h3>
        <p>
          If the airline rejects your claim, you can escalate to CEDR (Centre
          for Effective Dispute Resolution) or the Aviation ADR scheme for free.
          Their decision is binding on the airline.
        </p>
      </div>
      <div className="faq-card">
        <h3>Does this apply to package holidays?</h3>
        <p>
          Yes, if the flight element was delayed or cancelled. Package holiday
          flights are covered by UK261 in the same way as standalone flights.
        </p>
      </div>
      <div className="faq-card">
        <h3>Can I claim for a flight I took years ago?</h3>
        <p>
          Yes, up to 6 years in the UK. If you had a delayed flight any time
          from 2020 onwards, check if you are owed compensation.
        </p>
      </div>
    </PostShell>
  );
}
