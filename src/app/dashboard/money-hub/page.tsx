'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, Building2, Shield, RefreshCw, X, MessageCircle,
  ArrowLeft, ArrowRight, HelpCircle, AlertTriangle, Clock, Send, Mail, Zap, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { fmtNum } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import BankPickerModal from '@/components/BankPickerModal';

import OverviewPanel from './OverviewPanel';
import SpendingPanel from './SpendingPanel';
import GoalsAndBudgetsPanel from './GoalsAndBudgetsPanel';
import NetWorthPanel from './NetWorthPanel';
import ContractsPanel from './ContractsPanel';

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string) {
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

type ExpectedBill = {
  name: string; expected_amount: number; category: string;
  paid: boolean; past_due: boolean; source: string; expected_date?: string;
  billing_day?: number; bill_key?: string;
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MoneyHubPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showFcaBanner, setShowFcaBanner] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expected bills
  const [expectedBills, setExpectedBills] = useState<ExpectedBill[]>([]);
  const [expectedBillsTotal, setExpectedBillsTotal] = useState(0);

  // Bank state
  const [expiredConnections, setExpiredConnections] = useState<any[]>([]);
  const [bankPromptDismissed, setBankPromptDismissed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // AI Chat (Pro)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Email scanning
  const [scanning, setScanning] = useState(false);

  const supabase = createClient();

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  // ─── Data fetching ──────────────────────────────────────────────────────

  const refreshData = useCallback(async (month?: string) => {
    try {
      const targetMonth = month ?? selectedMonth;
      const url = targetMonth ? `/api/money-hub?month=${targetMonth}` : '/api/money-hub';
      const res = await fetch(url);
      const d = await res.json();
      if (!d.error) { setData(d); setError(null); }
      else setError(d.error);
    } catch (e: any) {
      setError(e.message || 'Failed to load Money Hub data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const fetchExpectedBills = async () => {
    try {
      const res = await fetch('/api/money-hub/expected-bills');
      const d = await res.json();
      if (!d.error && d.bills) {
        setExpectedBills(d.bills);
        setExpectedBillsTotal(d.totalExpected || 0);
      }
    } catch { /* silent */ }
  };

  // ─── Initial load ──────────────────────────────────────────────────────

  useEffect(() => {
    refreshData();
    fetchExpectedBills();

    // Check FCA banner
    try { if (!localStorage.getItem('pb_fca_banner_dismissed')) setShowFcaBanner(true); } catch { /* silent */ }

    // Restore chat history
    try {
      const saved = localStorage.getItem('pb_moneyhub_chat_history');
      if (saved) setChatMessages(JSON.parse(saved));
    } catch { /* silent */ }

    // User / bank state
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: conns } = await supabase.from('bank_connections')
          .select('id, bank_name, status')
          .eq('user_id', user.id)
          .in('status', ['expired', 'token_expired', 'expired_legacy']);
        if (conns?.length) setExpiredConnections(conns);

        const stored = localStorage.getItem('bank_prompt_dismissed_at');
        if (stored) {
          const daysSince = (Date.now() - new Date(stored).getTime()) / 86_400_000;
          setBankPromptDismissed(daysSince < 30);
        }
      }
    })();

    // Hide global chat widget on this page for Pro users
    document.body.dataset.hideChat = 'true';
    return () => { delete document.body.dataset.hideChat; };
  }, []);

  useEffect(() => {
    const handler = () => refreshData();
    window.addEventListener('paybacker:dashboard_refresh', handler);
    return () => window.removeEventListener('paybacker:dashboard_refresh', handler);
  }, [refreshData]);

  // ─── Sync ──────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bank/sync-now', { method: 'POST' });
      if (res.status === 429) { const d = await res.json(); showToast(d.error || 'Rate limited.', 'error'); setSyncing(false); return; }
      if (res.status === 403) { showToast('Manual sync requires a Pro plan.', 'error'); setSyncing(false); return; }
      if (res.status === 401) { showToast('Bank connection expired. Please reconnect.', 'error'); setSyncing(false); return; }
      if (!res.ok) { showToast('Sync failed.', 'error'); setSyncing(false); return; }
      const d = await res.json();
      await fetch('/api/money-hub/sync', { method: 'POST' }).catch(() => {});
      await refreshData();
      await fetchExpectedBills();
      const synced = d.synced || 0;
      showToast(synced > 0 ? `Synced ${synced} transaction${synced !== 1 ? 's' : ''}` : 'Sync completed. No new transactions.', synced > 0 ? 'success' : 'info');
    } catch {
      showToast('Sync failed.', 'error');
    }
    setSyncing(false);
  };

  // ─── AI Chat ──────────────────────────────────────────────────────────

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    const updated = [...chatMessages, { role: 'user', content: msg }];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, tier: 'pro' }),
      });
      const d = await res.json();
      if (d.reply) {
        if (d.toolsUsed || d.reply.includes('recategorised') || d.reply.includes('Updated') || d.reply.includes('Dismissed')) refreshData();
        const clean = d.reply.replace(/:::dashboard_refresh:::/g, '').replace(/:::dashboard\s*\{[\s\S]*?\}\s*:::/g, '').replace(/\[WIDGET:[\s\S]*?\]/g, '').trim();
        const newMsgs = [...updated, { role: 'assistant', content: clean }];
        setChatMessages(newMsgs);
        try { localStorage.setItem('pb_moneyhub_chat_history', JSON.stringify(newMsgs)); } catch { /* silent */ }
      } else if (d.error) {
        setChatMessages([...updated, { role: 'assistant', content: d.error }]);
      }
    } catch {
      setChatMessages([...updated, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    }
    setChatLoading(false);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, chatLoading]);

  // ─── Email scan ────────────────────────────────────────────────────────

  const scanInbox = async () => {
    setScanning(true);
    try { await fetch('/api/gmail/scan', { method: 'POST' }); await refreshData(); showToast('Inbox scan complete.', 'success'); }
    catch { showToast('Scan failed.', 'error'); }
    setScanning(false);
  };

  // ─── Loading / Error / Empty states ───────────────────────────────────

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 text-mint-400 animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
          <p className="text-red-400 font-semibold mb-2">Money Hub failed to load</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={() => { setLoading(true); setError(null); refreshData(); }} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-xl text-sm">Retry</button>
        </div>
      </div>
    );
  }

  if (!data?.accounts?.length) {
    return (
      <div className="max-w-7xl">
        <div className="text-center py-10 mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mint-400/10 border border-mint-400/20 mb-4">
            <Wallet className="h-8 w-8 text-mint-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Connect your bank to unlock Money Hub</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            We analyse your Open Banking transactions to build a complete financial picture — spending, income, subscriptions, budgets, and savings goals.
          </p>
          <button onClick={() => setShowBankPicker(true)} className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all">
            <Building2 className="h-5 w-5" /> Connect Bank Account
          </button>
          <p className="text-slate-500 text-xs mt-3">FCA regulated via Yapily · Read-only access · Takes 2 minutes</p>
        </div>
        {/* Demo preview */}
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 text-center">Preview — your data will look like this</p>
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-950/60 to-navy-950 z-10 pointer-events-none" />
          <div className="blur-sm pointer-events-none select-none">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Monthly income', value: '£3,200', color: 'text-green-400' },
                { label: 'Monthly outgoings', value: '£2,140', color: 'text-red-400' },
                { label: 'Savings rate', value: '33.1%', color: 'text-mint-400' },
                { label: 'Subscriptions', value: '£127/mo', color: 'text-amber-400' },
              ].map(item => (
                <div key={item.label} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
                  <p className={`text-3xl font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-slate-400 text-sm mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {[
            { icon: '📊', title: '20+ spending categories', desc: 'See exactly where your money goes each month' },
            { icon: '🔔', title: 'Price increase alerts', desc: 'Know the moment any bill goes up' },
            { icon: '🎯', title: 'Budget planner', desc: 'Set limits and get alerts when approaching them' },
          ].map(f => (
            <div key={f.title} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <span className="text-2xl">{f.icon}</span>
              <p className="text-white font-semibold text-sm mt-2">{f.title}</p>
              <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
        {showBankPicker && <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />}
      </div>
    );
  }

  // ─── Derived values ──────────────────────────────────────────────────

  const isPaid = data.tier === 'essential' || data.tier === 'pro';
  const isPro = data.tier === 'pro';

  const lastSyncedAt = data.accounts.reduce((latest: string | null, acc: any) => {
    if (!acc.last_synced_at) return latest;
    if (!latest) return acc.last_synced_at;
    return new Date(acc.last_synced_at) > new Date(latest) ? acc.last_synced_at : latest;
  }, null as string | null);

  const lastSyncMins = lastSyncedAt ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000) : null;
  const canSync = (() => {
    if (syncing) return false;
    if (!lastSyncMins) return true;
    if (data.tier === 'pro') return lastSyncMins >= 360;
    return lastSyncMins >= 1440;
  })();

  const syncTierText = (() => {
    if (data.tier === 'pro') return `Auto-syncs up to 4× daily${lastSyncedAt ? ` · Last synced: ${formatTimeAgo(lastSyncedAt)}` : ''}`;
    if (data.tier === 'essential') return `Auto-syncs daily${lastSyncedAt ? ` · Last synced: ${formatTimeAgo(lastSyncedAt)}` : ''}`;
    return 'Manual sync · 1× per day';
  })();

  // Actionable alerts
  const alerts = data.alerts || [];
  const priceIncreasAlerts = alerts.filter((a: any) => (a.alert_type || '').includes('price_increase'));

  // Expected bills unpaid
  const unpaidBills = expectedBills.filter(b => !b.paid);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-[slideIn_0.3s_ease] ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-300' :
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-300' :
          'bg-blue-500/20 border-blue-500/30 text-blue-300'
        }`}>
          <p className="text-sm">{toast.message}</p>
          <button onClick={() => setToast(null)} className="hover:opacity-70"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-heading)] flex items-center gap-3">
            <Wallet className="h-9 w-9 text-mint-400" /> Money Hub
          </h1>
          <p className="text-slate-400 mt-1 text-sm">{syncTierText}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month nav */}
          <button
            onClick={() => {
              const months = Array.from({ length: 12 }, (_, i) => {
                const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              });
              const cur = selectedMonth ? months.indexOf(selectedMonth) : -1;
              const next = cur < months.length - 1 ? months[cur + 1] : months[months.length - 1];
              setSelectedMonth(next); refreshData(next);
            }}
            className="text-slate-400 hover:text-white p-1.5 rounded transition-colors"
            title="Previous month"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <select
            value={selectedMonth || data.selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); refreshData(e.target.value); }}
            className="bg-navy-800 border border-navy-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-mint-400"
          >
            <option value="">This month</option>
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return <option key={val} value={val}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>;
            })}
          </select>
          <button
            onClick={() => {
              if (!selectedMonth) return;
              const months = ['', ...Array.from({ length: 12 }, (_, i) => {
                const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              })];
              const cur = months.indexOf(selectedMonth);
              if (cur > 0) { setSelectedMonth(months[cur - 1]); refreshData(months[cur - 1]); }
            }}
            disabled={!selectedMonth}
            className="text-slate-400 hover:text-white p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next month"
          >
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || !canSync}
            className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* FCA Banner */}
      {showFcaBanner && (
        <div className="bg-sky-500/10 border border-sky-400/20 rounded-xl p-3 flex items-start gap-3 relative">
          <Shield className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-sky-300 text-sm flex-1">
            Your financial data is powered by FCA-regulated Open Banking. Read-only access ensures your accounts stay secure. Balances are not shown for regulatory compliance.
          </p>
          <button onClick={() => { setShowFcaBanner(false); try { localStorage.setItem('pb_fca_banner_dismissed', 'true'); } catch { /* silent */ } }} className="text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Expired bank connection warning */}
      {expiredConnections.length > 0 && !bankPromptDismissed && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-amber-300 font-semibold text-sm">Bank connection expired</p>
              <p className="text-slate-400 text-xs">{expiredConnections.map(c => c.bank_name).join(', ')} — reconnect to keep your data up to date</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBankPicker(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-3 py-1.5 rounded-lg text-xs">Reconnect</button>
            <button onClick={() => { setBankPromptDismissed(true); localStorage.setItem('bank_prompt_dismissed_at', new Date().toISOString()); }} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* OVERVIEW (Summary cards + Income breakdown + Monthly trends) */}
      <OverviewPanel data={data} />

      {/* MAIN GRID: Spending + Budgets & Goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SpendingPanel data={data} isPro={isPro} refreshData={refreshData} selectedMonth={selectedMonth || data.selectedMonth} />
        <GoalsAndBudgetsPanel data={data} isPro={isPro} refreshData={refreshData} />
      </div>

      {/* Expected Bills (current month only) */}
      {!selectedMonth && expectedBills.length > 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-400" />
              Expected Bills This Month
              <span className="text-slate-500 text-sm font-normal">£{fmtNum(expectedBillsTotal)} expected</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" /> Paid</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full" /> Past due</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" /> Upcoming</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {expectedBills.slice(0, 12).map((bill: any) => {
              const statusColor = bill.paid
                ? 'border-green-500/30 bg-green-500/5'
                : bill.past_due
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-navy-800';
              const amountColor = bill.paid ? 'text-green-400' : bill.past_due ? 'text-red-400' : 'text-amber-400';
              const catLabel = bill.category !== 'other' ? bill.category.replace(/_/g, ' ') : '';
              return (
                <div key={bill.bill_key || bill.name} className={`rounded-xl p-3 border flex items-center justify-between ${statusColor}`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${bill.paid ? 'text-slate-400 line-through' : 'text-white'}`}>{bill.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {bill.billing_day > 0 && <span className="text-[10px] text-slate-500">Due ~{bill.billing_day}th</span>}
                      {catLabel && <span className="text-[10px] text-slate-500 capitalize">{catLabel}</span>}
                      {bill.paid && <span className="text-[10px] text-green-400 font-medium">✓ Paid</span>}
                      {bill.past_due && !bill.paid && <span className="text-[10px] text-red-400 font-medium">⚠ Not seen</span>}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ml-2 ${amountColor}`}>£{fmtNum(bill.expected_amount)}</span>
                </div>
              );
            })}
          </div>
          {expectedBills.length > 12 && (
            <p className="text-center text-xs text-slate-500 mt-2">+ {expectedBills.length - 12} more expected bills</p>
          )}
        </div>
      )}

      {/* Price Increase Alerts */}
      {priceIncreasAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Price Increases Detected
          </h3>
          <div className="space-y-2">
            {priceIncreasAlerts.slice(0, 5).map((alert: any) => (
              <div key={alert.id} className="bg-navy-950/50 rounded-xl p-3 border border-navy-800 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">{alert.title || 'Price increase'}</p>
                  <p className="text-xs text-slate-500">{alert.details || alert.description || ''}</p>
                </div>
                {alert.value_gbp > 0 && (
                  <span className="text-red-400 text-sm font-semibold whitespace-nowrap ml-2">+£{fmtNum(alert.value_gbp)}/yr</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contracts + Net Worth row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ContractsPanel data={data} isPro={isPro} />
        <NetWorthPanel data={data} isPro={isPro} refreshData={refreshData} />
      </div>

      {/* Financial Action Centre (Pro) */}
      {isPro && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              Financial Action Centre
            </h3>
            <Link href="/dashboard/deals" className="text-mint-400 hover:text-mint-300 text-sm font-medium">Browse deals →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={scanInbox}
              disabled={scanning}
              className="bg-navy-950/50 border border-navy-800 rounded-xl p-4 text-left hover:border-mint-400/30 transition-all disabled:opacity-50"
            >
              <Mail className="h-5 w-5 text-purple-400 mb-2" />
              <p className="text-white font-medium text-sm">{scanning ? 'Scanning...' : 'Scan Inbox'}</p>
              <p className="text-slate-500 text-xs mt-0.5">Detect price increases and overcharges from emails</p>
            </button>
            <Link href="/dashboard/subscriptions" className="bg-navy-950/50 border border-navy-800 rounded-xl p-4 text-left hover:border-mint-400/30 transition-all">
              <Building2 className="h-5 w-5 text-amber-400 mb-2" />
              <p className="text-white font-medium text-sm">Subscription Audit</p>
              <p className="text-slate-500 text-xs mt-0.5">Review and cancel unused subscriptions</p>
            </Link>
            <Link href="/dashboard/deals" className="bg-navy-950/50 border border-navy-800 rounded-xl p-4 text-left hover:border-mint-400/30 transition-all">
              <Zap className="h-5 w-5 text-green-400 mb-2" />
              <p className="text-white font-medium text-sm">Find Better Deals</p>
              <p className="text-slate-500 text-xs mt-0.5">Energy, broadband, mobile and insurance</p>
            </Link>
          </div>
          {alerts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-navy-800">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Active Alerts ({alerts.length})</p>
              <div className="space-y-2">
                {alerts.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{a.title}</span>
                    {a.value_gbp > 0 && <span className="text-mint-400 font-medium">Save £{fmtNum(a.value_gbp)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bank Accounts Info */}
      {data.accounts.length > 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              Connected Accounts ({data.accounts.length})
            </h3>
            <button onClick={() => setShowBankPicker(true)} className="text-mint-400 hover:text-mint-300 text-xs font-medium">+ Add bank</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.accounts.map((acc: any) => (
              <div key={acc.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                acc.status === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {acc.bank_name}
                {acc.status !== 'active' && <AlertTriangle className="h-3 w-3" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRO UPGRADE NUDGE */}
      {!isPro && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-purple-400" />
            <p className="text-slate-300 text-sm">Unlock the AI Financial Assistant, email scanning, and unlimited budgets & goals.</p>
          </div>
          <Link href="/pricing" className="text-purple-400 hover:text-purple-300 text-sm font-semibold whitespace-nowrap">Upgrade to Pro</Link>
        </div>
      )}

      {/* AI Chat Bubble (Pro only) */}
      {isPro && (
        <>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="fixed bottom-6 right-6 z-50 bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 text-white p-4 rounded-full shadow-2xl transition-all"
            title="Financial AI Assistant"
          >
            <MessageCircle className="h-6 w-6" />
          </button>

          {chatOpen && (
            <div className="fixed bottom-20 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl flex flex-col" style={{ height: '480px' }}>
              <div className="p-4 border-b border-navy-800 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold text-sm">AI Financial Assistant</h3>
                  <p className="text-slate-500 text-[10px]">Ask about your finances, recategorise transactions, and more</p>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <MessageCircle className="h-8 w-8 text-purple-400 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Ask me anything about your finances.</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {['Where am I spending the most?', 'Show my income breakdown', 'How can I save more?'].map(q => (
                        <button key={q} onClick={() => { setChatInput(q); }} className="text-xs bg-navy-800 hover:bg-navy-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-purple-500/20 text-purple-100' : 'bg-navy-800 text-slate-200'}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-navy-800 px-3 py-2 rounded-xl"><Loader2 className="h-4 w-4 text-mint-400 animate-spin" /></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-navy-800">
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                    placeholder="Ask about your finances..."
                    className="flex-1 bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400"
                  />
                  <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white p-2 rounded-lg transition-colors">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showBankPicker && <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />}
    </div>
  );
}
