'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FolderLock, Plus, AlertTriangle, Clock, CheckCircle, Calendar, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Contract {
  id: string;
  provider_name: string;
  category: string | null;
  contract_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  amount: number;
  billing_cycle: string;
  auto_renews: boolean | null;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  const now = new Date();
  return Math.floor((end.getTime() - now.getTime()) / 86400000);
}

function StatusBadge({ endDate }: { endDate: string | null }) {
  if (!endDate) return <span className="text-xs text-slate-500">No end date</span>;
  const days = daysUntil(endDate);
  if (days < 0) return <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Expired</span>;
  if (days <= 30) return <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">Expires in {days}d</span>;
  return <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>;
}

const TYPE_LABELS: Record<string, string> = {
  energy: 'Energy', broadband: 'Broadband', mobile: 'Mobile',
  insurance: 'Insurance', gym: 'Gym', streaming: 'Streaming',
  finance: 'Finance', other: 'Other',
};

export default function ContractVaultPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('subscriptions')
        .select('id, provider_name, category, contract_type, contract_start_date, contract_end_date, amount, billing_cycle, auto_renews')
        .eq('user_id', user.id)
        .not('contract_end_date', 'is', null)
        .neq('status', 'cancelled')
        .order('contract_end_date', { ascending: true });

      setContracts(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const expiringSoon = contracts.filter(c => c.contract_end_date && daysUntil(c.contract_end_date) <= 30 && daysUntil(c.contract_end_date) >= 0);
  const active = contracts.filter(c => !c.contract_end_date || daysUntil(c.contract_end_date) > 30);
  const expired = contracts.filter(c => c.contract_end_date && daysUntil(c.contract_end_date) < 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)] flex items-center gap-2">
            <FolderLock className="h-6 w-6 text-amber-400" /> Contract Vault
          </h1>
          <p className="text-slate-400 text-sm mt-1">Track contracts and get alerted before they auto-renew</p>
        </div>
        <Link
          href="/dashboard/subscriptions"
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-navy-950 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Contract
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-12 text-center">
          <FolderLock className="h-10 w-10 text-slate-600 mx-auto mb-4" />
          <p className="text-white font-semibold mb-1">No contracts tracked yet</p>
          <p className="text-slate-400 text-sm mb-6">Add a contract end date to any subscription to track it here.</p>
          <Link
            href="/dashboard/subscriptions"
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-navy-950 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> Go to Subscriptions
          </Link>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{contracts.length}</p>
              <p className="text-slate-400 text-xs mt-0.5">Total Contracts</p>
            </div>
            <div className="bg-navy-900 border border-amber-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{expiringSoon.length}</p>
              <p className="text-slate-400 text-xs mt-0.5">Expiring Soon</p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">£{contracts.reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}</p>
              <p className="text-slate-400 text-xs mt-0.5">Monthly Value</p>
            </div>
          </div>

          {/* Expiring soon alert */}
          {expiringSoon.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 font-semibold text-sm">
                  {expiringSoon.length} contract{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days
                </p>
                <p className="text-slate-400 text-xs mt-0.5">Review these before they auto-renew at potentially higher rates.</p>
              </div>
            </div>
          )}

          {/* Expiring soon section */}
          {expiringSoon.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Expiring Soon
              </h2>
              <div className="space-y-3">
                {expiringSoon.map(c => <ContractRow key={c.id} contract={c} />)}
              </div>
            </section>
          )}

          {/* Active */}
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Active Contracts
              </h2>
              <div className="space-y-3">
                {active.map(c => <ContractRow key={c.id} contract={c} />)}
              </div>
            </section>
          )}

          {/* Expired */}
          {expired.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Expired
              </h2>
              <div className="space-y-3 opacity-60">
                {expired.map(c => <ContractRow key={c.id} contract={c} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ContractRow({ contract: c }: { contract: Contract }) {
  const daysLeft = c.contract_end_date ? daysUntil(c.contract_end_date) : null;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

  return (
    <Link
      href={`/dashboard/subscriptions?highlight=${c.id}`}
      className={`block bg-navy-900 border rounded-xl p-4 hover:border-amber-400/40 transition-colors ${
        isExpiringSoon ? 'border-amber-500/30' : 'border-navy-700/50'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold text-sm truncate">{c.provider_name}</span>
            {c.contract_type && (
              <span className="text-xs text-slate-500 bg-navy-800 px-2 py-0.5 rounded-full flex-shrink-0">
                {TYPE_LABELS[c.contract_type] ?? c.contract_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {c.contract_start_date && <span>From {formatDate(c.contract_start_date)}</span>}
            {c.contract_end_date && <span>To {formatDate(c.contract_end_date)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-white font-semibold text-sm">£{c.amount.toFixed(2)}/mo</span>
          <StatusBadge endDate={c.contract_end_date} />
        </div>
      </div>
    </Link>
  );
}
