import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { ShieldCheck, BadgeCheck, Star, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Compare UK Deals - Energy, Broadband, Mobile, Insurance | Paybacker',
  description: 'Compare 53+ deals from verified UK providers. Energy, broadband, mobile, insurance, mortgages, loans, and more. Find cheaper alternatives and switch.',
};

const categories = [
  { slug: 'broadband', name: 'Broadband', count: 10, verifiedCount: 7, color: 'from-blue-500 to-cyan-500', desc: 'Find faster, cheaper broadband', topPartners: 'BT, Sky, Virgin Media, Plusnet', save: 'Save up to £240/yr' },
  { slug: 'mobile', name: 'Mobile', count: 12, verifiedCount: 10, color: 'from-green-500 to-emerald-500', desc: 'SIM-only and contract deals', topPartners: 'EE, Vodafone, O2, Three, giffgaff', save: 'Save up to £180/yr' },
  { slug: 'energy', name: 'Energy', count: 4, verifiedCount: 3, color: 'from-amber-500 to-orange-500', desc: 'Compare gas and electricity tariffs', topPartners: 'E.ON, EDF, OVO', save: 'Save up to £450/yr' },
  { slug: 'insurance', name: 'Insurance', count: 6, verifiedCount: 2, color: 'from-purple-500 to-violet-500', desc: 'Home, car, and life insurance', topPartners: 'RAC, AA', save: 'Save up to £320/yr' },
  { slug: 'mortgages', name: 'Mortgages', count: 4, verifiedCount: 3, color: 'from-red-500 to-rose-500', desc: 'Compare mortgage rates', topPartners: 'Habito, Maze, L&C', save: 'Find best rate' },
  { slug: 'loans', name: 'Loans', count: 5, verifiedCount: 3, color: 'from-sky-500 to-blue-500', desc: 'Personal and business loans', topPartners: 'Freedom Finance, AA, Loan.co.uk', save: 'From 3.9% APR' },
  { slug: 'credit-cards', name: 'Credit Cards', count: 4, verifiedCount: 2, color: 'from-indigo-500 to-purple-500', desc: 'Balance transfer and rewards', topPartners: 'TotallyMoney, MSE', save: '0% up to 30 months' },
  { slug: 'car-finance', name: 'Car Finance', count: 2, verifiedCount: 2, color: 'from-slate-500 to-zinc-500', desc: 'PCP, HP, and lease deals', topPartners: 'Carwow, Zuto', save: 'Beat dealer price' },
  { slug: 'travel', name: 'Travel', count: 6, verifiedCount: 4, color: 'from-teal-500 to-cyan-500', desc: 'Flights, hotels, and packages', topPartners: 'Jet2, Trip.com, Gotogate', save: 'Save up to 40%' },
];

const featuredPartners = [
  { name: 'BT', accent: 'from-purple-500 to-indigo-500' },
  { name: 'Sky', accent: 'from-blue-500 to-sky-500' },
  { name: 'Virgin Media', accent: 'from-red-500 to-rose-500' },
  { name: 'EE', accent: 'from-teal-500 to-cyan-500' },
  { name: 'Vodafone', accent: 'from-red-600 to-red-500' },
  { name: 'O2', accent: 'from-blue-600 to-indigo-500' },
  { name: 'Three', accent: 'from-slate-500 to-slate-400' },
  { name: 'E.ON', accent: 'from-rose-500 to-pink-500' },
  { name: 'EDF', accent: 'from-orange-500 to-amber-500' },
  { name: 'OVO', accent: 'from-emerald-500 to-green-500' },
  { name: 'giffgaff', accent: 'from-lime-500 to-yellow-400' },
  { name: 'Plusnet', accent: 'from-pink-500 to-rose-500' },
  { name: 'RAC', accent: 'from-orange-500 to-red-500' },
  { name: 'Habito', accent: 'from-violet-500 to-purple-500' },
];

export default function PublicDealsPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />
      <div className="h-16" />

      <main className="container mx-auto px-6 py-12 max-w-6xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-3 py-1.5 text-xs text-mint-400 border border-mint-400/20 mb-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Verified UK Partners</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">Compare 53+ Verified UK Deals</h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">Trusted partnerships with the UK&apos;s biggest providers. Free to browse, no signup needed.</p>
        </div>

        {/* Verified partners strip */}
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 md:p-6 mb-10">
          <div className="flex items-center gap-2 justify-center mb-4">
            <BadgeCheck className="h-4 w-4 text-mint-400" />
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Our verified partners include</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {featuredPartners.map((p) => (
              <span
                key={p.name}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-br ${p.accent} shadow-sm whitespace-nowrap`}
              >
                {p.name}
              </span>
            ))}
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-mint-400 bg-navy-800 border border-mint-400/20 whitespace-nowrap">
              +40 more
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <Link key={cat.slug} href={`/deals/${cat.slug}`} className="relative bg-navy-900 border border-navy-700/50 rounded-2xl p-6 hover:border-mint-400/40 transition-all group overflow-hidden shadow-[--shadow-card] hover:shadow-[--shadow-glow-mint]">
              <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${cat.color} opacity-10 group-hover:opacity-20 blur-2xl transition-opacity`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-sm`}>
                    <span className="text-white font-bold text-lg">{cat.count}</span>
                  </div>
                  {cat.verifiedCount > 0 && (
                    <div className="inline-flex items-center gap-1 bg-mint-400/10 text-mint-400 text-[10px] font-semibold px-2 py-1 rounded-full border border-mint-400/20">
                      <ShieldCheck className="h-3 w-3" />
                      {cat.verifiedCount} verified
                    </div>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-mint-400 transition-colors">{cat.name}</h2>
                <p className="text-mint-400 text-xs font-semibold mb-2 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-mint-400" />
                  {cat.save}
                </p>
                <p className="text-slate-400 text-sm mb-3">{cat.desc}</p>
                <p className="text-slate-500 text-xs mb-4 truncate">Featuring {cat.topPartners}</p>
                <span className="inline-flex items-center gap-1 text-mint-400 text-sm font-medium">
                  Compare {cat.count} deals <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center bg-gradient-to-br from-navy-900 to-navy-800 border border-mint-400/20 rounded-2xl p-8">
          <p className="text-white font-semibold text-lg mb-2">Get personalised recommendations</p>
          <p className="text-slate-400 text-sm mb-5 max-w-xl mx-auto">Connect your email or bank and we&apos;ll match you to the verified partners where you can save the most.</p>
          <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-3 rounded-xl transition-all inline-flex items-center gap-2 shadow-[--shadow-glow-mint]">
            Sign Up Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <footer className="border-t border-navy-700/50 bg-navy-950 mt-16">
        <div className="container mx-auto px-6 py-12 max-w-5xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-slate-500 text-sm">&copy; 2026 Paybacker LTD. All rights reserved.</span>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/privacy-policy" className="text-slate-500 hover:text-white transition-all">Privacy Policy</Link>
              <Link href="/terms-of-service" className="text-slate-500 hover:text-white transition-all">Terms of Service</Link>
              <a href="mailto:hello@paybacker.co.uk" className="text-slate-500 hover:text-white transition-all">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
