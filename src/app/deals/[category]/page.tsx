import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle, ArrowRight, Clock, Zap, TrendingDown, BarChart3 } from 'lucide-react';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import { CATEGORIES } from '../_data/categories';
import '../../(marketing)/styles.css';
import '../deals.css';

const AWIN_AFF_ID = process.env.NEXT_PUBLIC_AWIN_AFF_ID || '';

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  if (!AWIN_AFF_ID) return providerUrl;
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

export function generateStaticParams() {
  return Object.keys(CATEGORIES).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) return { title: 'Deals - Paybacker' };

  const url = `https://paybacker.co.uk/deals/${category}`;
  return {
    title: cat.title,
    description: cat.description,
    keywords: cat.keywords,
    openGraph: {
      title: cat.title,
      description: cat.description,
      url,
      siteName: 'Paybacker',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: cat.title,
      description: cat.description,
      images: ['/logo.png'],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function CategoryDealsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) notFound();

  const label = category.replace('-', ' ');

  return (
    <div className="m-land-root">
      <MarkNav />
      <main className="deals-shell">
        <div className="wrap">
          <nav className="deal-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span className="sep">/</span>
            <Link href="/deals">Deals</Link>
            <span className="sep">/</span>
            <span className="current">{label}</span>
          </nav>

          <header className="deal-hero">
            <h1>{cat.h1}</h1>
            <p className="intro">{cat.longDescription}</p>
          </header>

          <div className="stat-row">
            <div className="stat-card">
              <TrendingDown className="h-6 w-6" aria-hidden="true" />
              <div className="val">{cat.avgSaving}</div>
              <div className="lab">Average yearly saving</div>
            </div>
            <div className="stat-card">
              <Clock className="h-6 w-6" aria-hidden="true" />
              <div className="val">{cat.switchTime}</div>
              <div className="lab">Typical switch time</div>
            </div>
            <div className="stat-card blue">
              <Zap className="h-6 w-6" aria-hidden="true" />
              <div className="val">{cat.deals.length}</div>
              <div className="lab">Deals to compare</div>
            </div>
          </div>

          <h2 className="deals-section-head">Top {label} deals</h2>
          <div className="deals-list">
            {cat.deals.map((deal) => (
              <div key={deal.id} className="deal-row">
                <div className="body">
                  <p className="provider">{deal.provider}</p>
                  <p className="headline">{deal.headline}</p>
                  {deal.promoCode && (
                    <p className="promo">
                      Promo code: <span className="code">{deal.promoCode}</span>— apply at checkout
                    </p>
                  )}
                </div>
                <div className="right">
                  <span className="saving">{deal.saving}</span>
                  <a
                    href={deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl)}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="cta"
                  >
                    View deal <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {cat.warningText && (
            <div className="warning-box">
              <strong>Important:</strong> {cat.warningText}
            </div>
          )}

          <div className="tip-box">
            <h3>{cat.tipTitle}</h3>
            <p>{cat.tipBody}</p>
          </div>

          <div className="deal-final-cta">
            <div className="icon">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2>Get personalised {label} recommendations</h2>
            <p className="sub">
              Connect your bank account and Paybacker will analyse your actual bills, alert
              you before contracts renew, and show you the best deals based on what you
              really pay.
            </p>
            <div className="tick-row">
              <span><CheckCircle className="h-4 w-4" aria-hidden="true" /> Free to start</span>
              <span><CheckCircle className="h-4 w-4" aria-hidden="true" /> Bank-level security</span>
              <span><CheckCircle className="h-4 w-4" aria-hidden="true" /> Renewal alerts at 30, 14, 7 days</span>
            </div>
            <Link href="/auth/signup" className="btn-mint">
              Create free account
            </Link>
          </div>

          <div className="disclosure">
            <strong>Affiliate disclosure:</strong> Some links on this page are affiliate
            links. If you switch through one of these links, we may receive a commission
            from the provider at no extra cost to you. This helps us keep Paybacker free
            for basic use. We only recommend providers we believe offer genuine value.
          </div>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
