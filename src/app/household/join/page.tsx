/**
 * /household/join?token=…
 *
 * Where a Household seat invite lands. Minimal on purpose: this exists so
 * the invite email in /api/household is not a dead link. The OWNER-side
 * member-management UI is still to be built (see the header of
 * src/lib/household.ts), which is why the Household plan is gated behind
 * NEXT_PUBLIC_HOUSEHOLD_PLAN_ENABLED.
 *
 * Flow: signed out, we bounce to signup with the token preserved so the
 * invitee lands back here after confirming their email. Signed in, one
 * POST to /api/household binds their auth user to the seat. The API
 * enforces that the signed-in email matches the invited address, so a
 * forwarded invite cannot seat someone the owner did not choose.
 */

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react';

function JoinInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const supabase = useMemo(() => createClient(), []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        // Preserve the token through signup so they come straight back.
        window.location.href = `/auth/signup?next=${encodeURIComponent(`/household/join?token=${token}`)}`;
        return;
      }
      setAuthed(true);
    }).catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, [supabase, token]);

  const accept = async () => {
    setStatus('working');
    setMessage(null);
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not accept this invite.');
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Could not accept this invite.');
    }
  };

  if (!token) {
    return <Card title="This link is incomplete" body="The invite link is missing its token. Ask the plan owner to send it again." />;
  }
  if (authed === null) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <h1 className="mb-2 text-xl font-semibold text-slate-900">You are in</h1>
        <p className="mb-6 text-sm text-slate-600">
          Your seat is active. Everything on your account is private to you.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Users className="mb-3 h-9 w-9 text-slate-700" />
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Accept your Household seat</h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        You have been given a seat on someone else&rsquo;s Paybacker Household plan.
        Accepting unlocks unlimited dispute letters, unlimited bank and email
        connections, the Money Hub and the Pocket Agent, at no cost to you.
      </p>
      <p className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        <strong>Your money stays private.</strong> Your account is completely
        separate from everyone else on the plan. They cannot see your accounts,
        transactions, budgets or disputes, and you cannot see theirs. The only
        thing shared is the bill.
      </p>

      {status === 'error' && message && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <button
        onClick={accept}
        disabled={status === 'working'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
      >
        {status === 'working' && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === 'working' ? 'Accepting…' : 'Accept my seat'}
      </button>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
      <h1 className="mb-2 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}

export default function HouseholdJoinPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}>
            <JoinInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
