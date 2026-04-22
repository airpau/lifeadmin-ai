'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Gift, CheckCircle, ArrowRight } from 'lucide-react';
import { MarkNav } from '@/app/blog/_shared';
import '../(marketing)/styles.css';
import '../auth/auth.css';

function JoinContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  useEffect(() => {
    // Store referral code in cookie (30 days)
    if (ref) {
      document.cookie = `pb_ref=${ref};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
      // Also store in localStorage as backup
      localStorage.setItem('pb_ref', ref);
    }
  }, [ref]);

  const perks = [
    'AI complaint letters citing UK consumer law',
    'Find hidden subscriptions draining your bank',
    'Compare deals from top UK providers',
    'Track contract end dates with renewal alerts',
  ];

  return (
    <main className="auth-shell">
      <div className="auth-wrap">
        <Link href="/" className="auth-brand">
          <span className="pay">Pay</span>
          <span className="backer">backer</span>
        </Link>

        <div className="auth-card">
          <div className="join-hero">
            <div className="gift">
              <Gift className="h-7 w-7" />
            </div>
            <h1>You&apos;ve been invited</h1>
            <p className="lead">
              A Paybacker member has invited you to join. Sign up free and start
              claiming money back on your bills, subscriptions, and contracts.
            </p>
          </div>

          <ul className="join-perks">
            {perks.map((item) => (
              <li key={item}>
                <CheckCircle className="h-5 w-5" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Link href="/auth/signup" className="join-cta">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>

          <p className="join-note">Free forever. No credit card required.</p>
        </div>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <div className="m-land-root">
      <MarkNav />
      <Suspense
        fallback={
          <div className="auth-loading" aria-busy="true">
            <div className="spinner" />
          </div>
        }
      >
        <JoinContent />
      </Suspense>
    </div>
  );
}
