import { Metadata } from 'next';
import Link from 'next/link';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import '../(marketing)/styles.css';
import './deals.css';

export const metadata: Metadata = {
  title: 'Compare UK Deals - Energy, Broadband, Mobile, Insurance | Paybacker',
  description:
    'Compare 53+ deals from verified UK providers. Energy, broadband, mobile, insurance, mortgages, loans, and more. Find cheaper alternatives and switch.',
};

const categories = [
  { slug: 'energy',       name: 'Energy',       count: 4,  desc: 'Compare gas and electricity tariffs' },
  { slug: 'broadband',    name: 'Broadband',    count: 10, desc: 'Find faster, cheaper broadband' },
  { slug: 'mobile',       name: 'Mobile',       count: 12, desc: 'SIM-only and contract deals' },
  { slug: 'insurance',    name: 'Insurance',    count: 6,  desc: 'Home, car, and life insurance' },
  { slug: 'mortgages',    name: 'Mortgages',    count: 4,  desc: 'Compare mortgage rates' },
  { slug: 'loans',        name: 'Loans',        count: 5,  desc: 'Personal and business loans' },
  { slug: 'credit-cards', name: 'Credit Cards', count: 4,  desc: 'Balance transfer and rewards' },
  { slug: 'car-finance',  name: 'Car Finance',  count: 2,  desc: 'PCP, HP, and lease deals' },
  { slug: 'travel',       name: 'Travel',       count: 6,  desc: 'Flights, hotels, and packages' },
];

export default function PublicDealsPage() {
  return (
    <div className="m-land-root">
      <MarkNav />
      <main className="deals-shell">
        <div className="wrap">
          <header className="deals-head">
            <h1>Compare 53+ UK deals</h1>
            <p>
              Find cheaper alternatives to what you&apos;re paying now. Free to browse, no
              signup needed.
            </p>
          </header>

          <div className="cat-grid">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/deals/${cat.slug}`}
                className="cat-card"
                aria-label={`${cat.name} deals — ${cat.count} to compare`}
              >
                <div className="badge">{cat.count}</div>
                <h2>{cat.name}</h2>
                <p>{cat.desc}</p>
                <span className="view">View {cat.count} deals &rarr;</span>
              </Link>
            ))}
          </div>

          <div className="cat-hint">
            <p>
              Already tracking your subscriptions? Sign in to see personalised deal
              recommendations.
            </p>
            <Link href="/auth/signup" className="btn-mint">
              Sign up free
            </Link>
          </div>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
