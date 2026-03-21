'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS, PLANS } from '@/lib/stripe';
import { ShieldAlert } from 'lucide-react';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface AdminStats {
  waitlistCount: number;
  userCount: number;
  complaintsCount: number;
  subscriptionsCount: number;
  bankAccountsCount: number;
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || user.email !== ADMIN_EMAIL) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      const [
        { count: waitlistCount },
        { count: userCount },
        { count: complaintsCount },
        { count: subscriptionsCount },
        { count: bankAccountsCount },
      ] = await Promise.all([
        supabase.from('waitlist_signups').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('agent_type', 'complaint'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
        supabase.from('truelayer_tokens').select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        waitlistCount: waitlistCount ?? 0,
        userCount: userCount ?? 0,
        complaintsCount: complaintsCount ?? 0,
        subscriptionsCount: subscriptionsCount ?? 0,
        bankAccountsCount: bankAccountsCount ?? 0,
      });

      setLoading(false);
    };

    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <p className="text-slate-400">You don't have permission to view this page.</p>
      </div>
    );
  }

  const priceRows = [
    { label: 'Essential Monthly', id: PRICE_IDS.essential_monthly, amount: `£${PLANS.essential.priceMonthly}/mo` },
    { label: 'Essential Yearly',  id: PRICE_IDS.essential_yearly,  amount: `£${PLANS.essential.priceYearly}/yr` },
    { label: 'Pro Monthly',       id: PRICE_IDS.pro_monthly,       amount: `£${PLANS.pro.priceMonthly}/mo` },
    { label: 'Pro Yearly',        id: PRICE_IDS.pro_yearly,        amount: `£${PLANS.pro.priceYearly}/yr` },
  ];

  const statCards = [
    { label: 'Waitlist signups',        value: stats!.waitlistCount },
    { label: 'Registered users',        value: stats!.userCount },
    { label: 'Complaints generated',    value: stats!.complaintsCount },
    { label: 'Subscriptions tracked',   value: stats!.subscriptionsCount },
    { label: 'Connected bank accounts', value: stats!.bankAccountsCount },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Admin</h1>
        <p className="text-slate-400">Pre-launch smoke test dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"
          >
            <p className="text-3xl font-bold text-white mb-1">{card.value}</p>
            <p className="text-slate-400 text-sm">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Stripe Price IDs */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Stripe Price IDs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="pb-3 font-medium">Plan</th>
              <th className="pb-3 font-medium">Price ID</th>
              <th className="pb-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {priceRows.map((row) => (
              <tr key={row.id}>
                <td className="py-3 text-slate-300">{row.label}</td>
                <td className="py-3 font-mono text-amber-400 text-xs">{row.id}</td>
                <td className="py-3 text-slate-300">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deployment info */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Deployment</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Vercel deployment URL</span>
            <span className="text-slate-300 font-mono text-xs">{process.env.NEXT_PUBLIC_VERCEL_URL ?? 'localhost'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Git commit SHA</span>
            <span className="text-slate-300 font-mono text-xs">{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Git branch</span>
            <span className="text-slate-300 font-mono text-xs">{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? 'local'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Environment</span>
            <span className="text-slate-300 font-mono text-xs">{process.env.NODE_ENV}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
