import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'How to Claim Flight Delay Compensation UK 2026 - Up to £520',
  description: 'Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person for delayed or cancelled flights. Free AI claim letter generator.',
  keywords: ['flight delay compensation UK', 'UK261 claim', 'flight cancelled compensation', 'delayed flight refund', 'how to claim flight delay'],
  openGraph: {
    title: 'How to Claim Flight Delay Compensation UK 2026 - Up to £520',
    description: 'Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person.',
    url: 'https://paybacker.co.uk/blog/how-to-claim-flight-delay-compensation-uk',
    type: 'article',
    publishedTime: '2026-03-25T00:00:00Z',
    authors: ['Paybacker'],
  },
  twitter: {
    card: 'summary',
    title: 'How to Claim Flight Delay Compensation UK - Up to £520',
    description: 'Complete guide to flight delay compensation under UK261.',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/blog/how-to-claim-flight-delay-compensation-uk',
  },
};

export default function FlightDelayCompensationPost() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
              <span className="text-xl font-bold text-white">Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span></span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/blog" className="text-slate-400 hover:text-white text-sm">Blog</Link>
              <Link href="/auth/signup" className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all">Get Started Free</Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <article className="max-w-3xl mx-auto">
            <div className="mb-8">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
                <span>/</span>
                <span className="text-slate-400">Flight Delay Compensation</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">How to Claim Flight Delay Compensation in the UK: Up to £520 Per Person</h1>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>25 March 2026</span>
                <span>8 min read</span>
              </div>
            </div>

            <div className="prose prose-invert prose-slate max-w-none">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 mb-8">
                <p className="text-amber-400 font-semibold mb-2">Key takeaway</p>
                <p className="text-slate-300 text-sm">If your flight was delayed by 3+ hours, cancelled with less than 14 days notice, or you were denied boarding, you could be owed between £220 and £520 per person. You can claim for flights in the last 6 years. Over £600 million goes unclaimed by UK passengers every year.</p>
              </div>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">What is UK261?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">After Brexit, the UK replaced EU Regulation 261/2004 with its own version known as UK261. This regulation protects passengers on flights departing from a UK airport, or arriving in the UK on a UK or EU airline.</p>
              <p className="text-slate-300 leading-relaxed mb-4">Under UK261, airlines must compensate you if your flight was significantly delayed, cancelled, or you were denied boarding - unless the disruption was caused by extraordinary circumstances like severe weather or air traffic control strikes.</p>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">How much can you claim?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">Compensation is based on the flight distance, not the ticket price:</p>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden mb-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Flight Distance</th>
                      <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Example Routes</th>
                      <th className="text-right py-3 px-4 text-amber-400 text-sm font-medium">Compensation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800/50">
                      <td className="py-3 px-4 text-white text-sm">Under 1,500km</td>
                      <td className="py-3 px-4 text-slate-400 text-sm">London to Paris, Edinburgh, Amsterdam</td>
                      <td className="py-3 px-4 text-amber-400 text-sm font-bold text-right">£220</td>
                    </tr>
                    <tr className="border-b border-slate-800/50">
                      <td className="py-3 px-4 text-white text-sm">1,500km - 3,500km</td>
                      <td className="py-3 px-4 text-slate-400 text-sm">London to Tenerife, Athens, Istanbul</td>
                      <td className="py-3 px-4 text-amber-400 text-sm font-bold text-right">£350</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 text-white text-sm">Over 3,500km</td>
                      <td className="py-3 px-4 text-slate-400 text-sm">London to New York, Dubai, Bangkok</td>
                      <td className="py-3 px-4 text-amber-400 text-sm font-bold text-right">£520</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-300 leading-relaxed mb-4">This is per person, per flight. A family of four on a long-haul flight could claim up to £2,080.</p>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">When can you claim?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">You can claim compensation if:</p>
              <ul className="text-slate-300 space-y-2 mb-6">
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-1">-</span> Your flight arrived more than 3 hours late at your final destination</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-1">-</span> Your flight was cancelled with less than 14 days notice</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-1">-</span> You were denied boarding (e.g. overbooking)</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-1">-</span> The flight departed from a UK airport (any airline)</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-1">-</span> The flight arrived in the UK on a UK or EU airline</li>
              </ul>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">What counts as extraordinary circumstances?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">Airlines often reject claims citing extraordinary circumstances. Here is what does and does not count:</p>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-red-400 font-semibold text-sm mb-2">NOT extraordinary (you CAN claim)</p>
                  <ul className="text-slate-300 text-sm space-y-1">
                    <li>- Technical faults with the aircraft</li>
                    <li>- Crew shortages or illness</li>
                    <li>- IT system failures</li>
                    <li>- Bird strikes (debated)</li>
                    <li>- Baggage loading issues</li>
                    <li>- Late incoming aircraft</li>
                  </ul>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                  <p className="text-green-400 font-semibold text-sm mb-2">IS extraordinary (airline exempt)</p>
                  <ul className="text-slate-300 text-sm space-y-1">
                    <li>- Severe weather (not just bad weather)</li>
                    <li>- Air traffic control strikes</li>
                    <li>- Security threats or airport closures</li>
                    <li>- Political instability</li>
                    <li>- Medical emergencies on board</li>
                    <li>- Volcanic ash</li>
                  </ul>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">How to claim: step by step</h2>
              <div className="space-y-4 mb-6">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <p className="text-amber-400 font-bold text-sm mb-1">Step 1: Gather your details</p>
                  <p className="text-slate-300 text-sm">You need your flight number, date of travel, departure and arrival airports, and a description of what happened (delay length, cancellation notice, etc.).</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <p className="text-amber-400 font-bold text-sm mb-1">Step 2: Write a formal claim letter</p>
                  <p className="text-slate-300 text-sm">Your claim must cite UK261 regulations specifically and state the compensation amount you are owed based on flight distance. This is where most people get stuck.</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <p className="text-amber-400 font-bold text-sm mb-1">Step 3: Send to the airline</p>
                  <p className="text-slate-300 text-sm">Email the airline's complaints department directly. Most airlines have a dedicated compensation claims form on their website.</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <p className="text-amber-400 font-bold text-sm mb-1">Step 4: Wait for a response</p>
                  <p className="text-slate-300 text-sm">Airlines have 8 weeks to respond. If they reject your claim or do not respond, you can escalate to CEDR (Centre for Effective Dispute Resolution) for free.</p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">How long do I have to claim?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">In the UK, you can claim for flights delayed in the <strong className="text-white">last 6 years</strong>. So if you had a delayed flight in 2020, 2021, 2022, 2023, 2024, or 2025, you could still be owed money now.</p>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">Can I claim for a connecting flight?</h2>
              <p className="text-slate-300 leading-relaxed mb-4">Yes. If your connecting flights were booked as a single itinerary and you arrived at your final destination more than 3 hours late, you can claim based on the total distance from departure to final destination.</p>

              {/* CTA */}
              <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-8 my-10 text-center">
                <h2 className="text-2xl font-bold text-white mb-3">Generate your flight compensation claim in 30 seconds</h2>
                <p className="text-slate-400 mb-6">Our AI writes a formal claim letter citing UK261 regulations with the exact compensation amount you are owed. Free to use.</p>
                <Link href="/dashboard/complaints?type=flight_compensation&new=1" className="inline-block bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-lg">
                  Generate Your Flight Claim Letter Free
                </Link>
                <p className="text-slate-600 text-xs mt-3">No credit card required. 3 free letters per month.</p>
              </div>

              <h2 className="text-2xl font-bold text-white mt-8 mb-4">Frequently asked questions</h2>
              <div className="space-y-4 mb-8">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-2">Do I need a solicitor?</h3>
                  <p className="text-slate-400 text-sm">No. You can claim directly with the airline yourself. A formal letter citing the correct regulations is usually enough. Paybacker generates this letter for you for free.</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-2">What if the airline says no?</h3>
                  <p className="text-slate-400 text-sm">If the airline rejects your claim, you can escalate to CEDR (Centre for Effective Dispute Resolution) or the Aviation ADR scheme for free. Their decision is binding on the airline.</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-2">Does this apply to package holidays?</h3>
                  <p className="text-slate-400 text-sm">Yes, if the flight element was delayed or cancelled. Package holiday flights are covered by UK261 in the same way as standalone flights.</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-2">Can I claim for a flight I took years ago?</h3>
                  <p className="text-slate-400 text-sm">Yes, up to 6 years in the UK. If you had a delayed flight any time from 2020 onwards, check if you are owed compensation.</p>
                </div>
              </div>
            </div>
          </article>
        </main>

        <footer className="border-t border-slate-800 py-8 mt-16">
          <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-slate-500 text-sm">Paybacker LTD - paybacker.co.uk</div>
            <div className="flex gap-4 text-slate-500 text-sm">
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-all">About</Link>
              <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
