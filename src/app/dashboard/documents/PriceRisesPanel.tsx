'use client';

// Price rises the vault found by comparing a supplier's bills and
// renewals year on year. Essential and above; Free sees what it does.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, RefreshCw, TrendingUp, X } from 'lucide-react';

interface Rise {
  id: string;
  supplier: string;
  cadence: 'monthly' | 'quarterly' | 'annual';
  old_amount: number;
  new_amount: number;
  old_date: string;
  new_date: string;
  increase_pct: number;
  annual_increase: number;
  price_alert_id: string | null;
}

const PER: Record<Rise['cadence'], string> = { monthly: 'a month', quarterly: 'a quarter', annual: 'a year' };

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function gbp(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

export default function PriceRisesPanel({ enabled }: { enabled: boolean }) {
  const [rises, setRises] = useState<Rise[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch('/api/documents/price-rises');
    if (res.ok) setRises((await res.json()).rises ?? []);
    setLoaded(true);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch('/api/documents/price-rises', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Could not check for price rises.');
        return;
      }
      setRises(data.rises ?? []);
      setMessage(data.created > 0 ? `Found ${data.created} new price rise${data.created === 1 ? '' : 's'}.` : 'No new price rises found.');
    } finally {
      setChecking(false);
    }
  }

  async function dismiss(id: string) {
    const res = await fetch(`/api/documents/price-rises/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }) });
    if (res.ok) setRises((r) => r.filter((x) => x.id !== id));
  }

  if (!enabled) {
    return (
      <div className="flex items-start gap-2 bg-orange-500/5 border border-orange-200 rounded-xl p-3 text-sm text-slate-700">
        <Lock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
        <div>
          Price-rise watch comes with Essential: we compare your bills and renewals with last year&apos;s and tell you when a supplier puts its price up, so you can challenge it or switch.{' '}
          <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">See plans</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/50 rounded-2xl p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" /> Price rises in your bills
        </h2>
        <button onClick={checkNow} disabled={checking} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800 disabled:opacity-60">
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check now
        </button>
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {loaded && rises.length === 0 ? (
        <p className="text-sm text-slate-600">
          No price rises spotted. We compare each supplier&apos;s bills and renewals with the same time last year and flag rises of more than 5% or £50 a year.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rises.map((r) => (
            <li key={r.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-slate-900 font-semibold">
                  {r.supplier} <span className="text-xs bg-red-500/10 text-red-700 px-2 py-0.5 rounded-full font-medium">+{Number(r.increase_pct).toFixed(1)}%</span>
                </p>
                <p className="text-sm text-slate-600">
                  {gbp(r.old_amount)} in {fmtDate(r.old_date)} to {gbp(r.new_amount)} in {fmtDate(r.new_date)} ({PER[r.cadence]}). About {gbp(r.annual_increase)} more a year.
                </p>
                {r.price_alert_id && <p className="text-xs text-slate-500">Also on your dashboard alerts.</p>}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/complaints?new=1&company=${encodeURIComponent(r.supplier)}&issue=${encodeURIComponent(`price increase from ${gbp(r.old_amount)} to ${gbp(r.new_amount)}`)}`}
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800"
                >
                  Challenge it
                </Link>
                <button onClick={() => dismiss(r.id)} title="Dismiss" className="text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
