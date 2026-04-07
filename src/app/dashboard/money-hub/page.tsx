'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, Settings, Building2, Lock, Shield, ArrowLeft, ArrowRight, RefreshCw, X, MessageCircle } from 'lucide-react';
import Link from 'next/link';

// Core formatting and hooks
import { formatGBP } from '@/lib/format';
import BankPickerModal from '@/components/BankPickerModal';

// Components (We will move these out over time, but structured cleanly here for now)
import OverviewPanel from './OverviewPanel';
import SpendingPanel from './SpendingPanel';
import GoalsAndBudgetsPanel from './GoalsAndBudgetsPanel';
import NetWorthPanel from './NetWorthPanel';
import ContractsPanel from './ContractsPanel';

export default function MoneyHubPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showFcaBanner, setShowFcaBanner] = useState(true);

  const refreshData = useCallback(async (month?: string) => {
    try {
      setLoading(true);
      const targetMonth = month ?? selectedMonth;
      const url = targetMonth ? `/api/money-hub?month=${targetMonth}` : '/api/money-hub';
      const res = await fetch(url);
      const d = await res.json();
      if (!d.error) {
        setData(d);
        setError(null);
      } else {
        setError(d.error);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load Money Hub data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const handler = () => refreshData();
    window.addEventListener('paybacker:dashboard_refresh', handler);
    return () => window.removeEventListener('paybacker:dashboard_refresh', handler);
  }, [refreshData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bank/sync-now', { method: 'POST' });
      if (res.ok) await refreshData();
    } catch {
      // silent
    }
    setSyncing(false);
  };

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mint-400" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
          <p className="text-red-400 font-semibold mb-2">Money Hub failed to load</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={() => refreshData()} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-xl text-sm">Retry</button>
        </div>
      </div>
    );
  }

  if (!data?.accounts?.length) {
    return (
      <div className="max-w-7xl text-center py-20">
        <Building2 className="mx-auto h-12 w-12 text-mint-400 mb-4" />
        <h2 className="text-3xl font-bold text-white mb-2">Connect your bank securely</h2>
        <p className="text-slate-400 mb-6">Money Hub uses Open Banking transactions as your single source of truth.</p>
        <button onClick={() => setShowBankPicker(true)} className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-bold py-3 px-6 rounded-xl">
          Connect Bank
        </button>
        {showBankPicker && <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />}
      </div>
    );
  }

  const isPro = data.tier === 'pro';

  return (
    <div className="max-w-7xl space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-heading)] flex items-center gap-3">
            <Wallet className="h-9 w-9 text-mint-400" /> Money Hub
          </h1>
          <p className="text-slate-400 mt-1">Open Banking Intelligence Dashboard</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth || data.selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); refreshData(e.target.value); }}
            className="bg-navy-800 border border-navy-700/50 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">This month</option>
            {/* Last 12 months generated here */}
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return <option key={val} value={val}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>;
            })}
          </select>
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 text-white px-4 py-2 rounded-lg text-sm">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {showFcaBanner && (
        <div className="bg-sky-500/10 border border-sky-400/20 rounded-xl p-3 flex items-start gap-3">
          <Shield className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-sky-300 text-sm flex-1">
            Data powered by FCA-regulated Open Banking. For regulatory compliance, explicit bank balances are not shown in this aggregated view.
          </p>
          <button onClick={() => setShowFcaBanner(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* DASHBOARD GRID */}
      <OverviewPanel data={data} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SpendingPanel data={data} isPro={isPro} refreshData={refreshData} selectedMonth={selectedMonth || data.selectedMonth} />
        <GoalsAndBudgetsPanel data={data} isPro={isPro} refreshData={refreshData} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ContractsPanel data={data} isPro={isPro} />
        <NetWorthPanel data={data} isPro={isPro} refreshData={refreshData} />
      </div>

      {/* PRO UPGRADE NUDGE */}
      {!isPro && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <MessageCircle className="h-5 w-5 text-purple-400" />
             <p className="text-slate-300 text-sm">Unlock the AI Assistant to recategorise transactions and chat with your money.</p>
          </div>
          <Link href="/pricing" className="text-purple-400 hover:text-purple-300 text-sm font-semibold">Upgrade to Pro</Link>
        </div>
      )}
    </div>
  );
}
