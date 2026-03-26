import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Compare UK Deals - Energy, Broadband, Mobile, Insurance | Paybacker',
  description: 'Compare 59+ deals from verified UK providers. Energy, broadband, mobile, insurance, mortgages, loans, and more. Find cheaper alternatives and switch.',
};

const categories = [
  { slug: 'energy', name: 'Energy', count: 5, color: 'from-amber-500 to-orange-500', desc: 'Compare gas and electricity tariffs' },
  { slug: 'broadband', name: 'Broadband', count: 10, color: 'from-blue-500 to-cyan-500', desc: 'Find faster, cheaper broadband' },
  { slug: 'mobile', name: 'Mobile', count: 13, color: 'from-green-500 to-emerald-500', desc: 'SIM-only and contract deals' },
  { slug: 'insurance', name: 'Insurance', count: 6, color: 'from-purple-500 to-violet-500', desc: 'Home, car, and life insurance' },
  { slug: 'mortgages', name: 'Mortgages', count: 5, color: 'from-red-500 to-rose-500', desc: 'Compare mortgage rates' },
  { slug: 'loans', name: 'Loans', count: 5, color: 'from-sky-500 to-blue-500', desc: 'Personal and business loans' },
  { slug: 'credit-cards', name: 'Credit Cards', count: 4, color: 'from-indigo-500 to-purple-500', desc: 'Balance transfer and rewards' },
  { slug: 'car-finance', name: 'Car Finance', count: 2, color: 'from-slate-500 to-zinc-500', desc: 'PCP, HP, and lease deals' },
  { slug: 'travel', name: 'Travel', count: 6, color: 'from-teal-500 to-cyan-500', desc: 'Flights, hotels, and packages' },
];

export default function PublicDealsPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      <header className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-bold text-white">Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-slate-400 hover:text-white text-sm">Sign In</Link>
            <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-sm font-semibold px-4 py-2 rounded-xl transition-all">Get Started Free</Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">Compare 59+ UK Deals</h1>
          <p className="text-lg text-slate-300">Find cheaper alternatives to what you are paying now. Free to browse, no signup needed.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map(cat => (
            <Link key={cat.slug} href={`/deals/${cat.slug}`} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 hover:border-mint-400/30 transition-all group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center mb-4`}>
                <span className="text-white font-bold text-lg">{cat.count}</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1 group-hover:text-mint-400 transition-colors">{cat.name}</h2>
              <p className="text-slate-400 text-sm mb-3">{cat.desc}</p>
              <span className="text-mint-400 text-sm font-medium">View {cat.count} deals &rarr;</span>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-slate-500 text-sm mb-4">Already tracking your subscriptions? Sign in to see personalised deal recommendations.</p>
          <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-3 rounded-xl transition-all">Sign Up Free</Link>
        </div>
      </main>
    </div>
  );
}
