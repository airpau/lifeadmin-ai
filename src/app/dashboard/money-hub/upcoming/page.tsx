'use client';
// src/app/dashboard/money-hub/upcoming/page.tsx
//
// Full forward timeline. Same component as the Money Hub home slot, in
// its expanded form: every day in the window, nothing collapsed.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import UpcomingForwardView from '../UpcomingForwardView';

export default function UpcomingPaymentsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/dashboard/money-hub"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Money Hub
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          What happens next
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Every payment we expect to land in or leave your accounts, day by day.
          Money coming in is counted too, not just what you owe.
        </p>
      </header>

      <UpcomingForwardView variant="page" initialWindow={30} />

      <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Where this comes from</h2>
        <dl className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-600">
          <div>
            <dt className="font-semibold text-slate-800">Scheduled by your bank</dt>
            <dd>
              Payments your bank has already booked for a future date, plus
              anything sitting as pending. This is the strongest signal there is:
              the money is committed, we&apos;re just telling you before it moves.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Regular payment</dt>
            <dd>
              Standing orders and direct debit mandates on your account, read
              read-only through Open Banking. The date is fixed; the amount can
              change between cycles.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Predicted</dt>
            <dd>
              Patterns we found in your own history, both money out and money
              in, including salary, regular client payments and benefits. We need
              to see a pattern at least three times before we&apos;ll show it, and
              where the amount swings around we say so rather than pretending
              it&apos;s fixed.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Updated daily at 06:00. When the same payment shows up from more than
          one of these sources, we keep the most certain one so nothing is
          counted twice.
        </p>
      </section>
    </div>
  );
}
