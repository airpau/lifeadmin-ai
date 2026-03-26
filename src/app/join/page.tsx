'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Gift, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="Paybacker" width={40} height={40} className="rounded-lg" />
          <span className="text-2xl font-bold text-white">Pay<span className="text-amber-500">backer</span></span>
        </Link>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
          <Gift className="h-8 w-8 text-amber-400" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">You have been invited</h1>
        <p className="text-slate-400 text-lg mb-8">
          A Paybacker member has invited you to join. Sign up free and start claiming money back on your bills, subscriptions, and contracts.
        </p>

        <div className="space-y-3 text-left mb-8">
          {[
            'AI complaint letters citing UK consumer law',
            'Find hidden subscriptions draining your bank',
            'Compare 56 deals from top UK providers',
            'Track contract end dates with renewal alerts',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-300 text-sm">{item}</span>
            </div>
          ))}
        </div>

        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-lg w-full justify-center"
        >
          Create Free Account <ArrowRight className="h-5 w-5" />
        </Link>

        <p className="text-slate-600 text-xs mt-4">Free forever. No credit card required.</p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="h-8 w-8 text-amber-500 animate-spin" /></div>}>
      <JoinContent />
    </Suspense>
  );
}
