'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Calendar, TrendingDown, X, Mail, Copy, CheckCircle, Plus, Loader2, Inbox, Sparkles, Pencil, Building2, RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { capture } from '@/lib/posthog';

interface Subscription {
  id: string;
  provider_name: string;
  category: string | null;
  amount: number;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  next_billing_date: string | null;
  last_used_date: string | null;
  usage_frequency: string | null;
  status: 'active' | 'pending_cancellation' | 'cancelled' | 'expired';
  account_email: string | null;
  cancel_requested_at: string | null;
  source?: 'manual' | 'email' | 'bank' | 'bank_and_email';
  bank_description?: string | null;
  notes?: string | null;
  contract_type?: string | null;
  contract_end_date?: string | null;
  contract_term_months?: number | null;
  auto_renews?: boolean | null;
  early_exit_fee?: number | null;
  provider_type?: string | null;
  current_tariff?: string | null;
  logo_url?: string | null;
}

interface BankConnection {
  id: string;
  provider_id: string | null;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
  account_ids: string[] | null;
  bank_name: string | null;
  account_display_names: string[] | null;
}

interface CancellationEmail {
  subject: string;
  body: string;
}

const CATEGORIES = ['streaming', 'software', 'fitness', 'news', 'shopping', 'gaming', 'energy', 'broadband', 'mobile', 'insurance', 'mortgage', 'loan', 'council_tax', 'water', 'tv', 'other'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'one-time'];
const CONTRACT_TYPES = ['subscription', 'fixed_contract', 'mortgage', 'loan', 'insurance', 'lease', 'membership', 'utility', 'other'];
const PROVIDER_TYPES = ['energy', 'broadband', 'mobile', 'tv', 'insurance', 'mortgage', 'loan', 'credit_card', 'streaming', 'software', 'fitness', 'council_tax', 'water', 'other'];

export default function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [cancelInfo, setCancelInfo] = useState<{ email?: string; phone?: string; url?: string; method: string; tips?: string } | null>(null);
  const [cancellationEmail, setCancellationEmail] = useState<CancellationEmail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [detectingFromInbox, setDetectingFromInbox] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [detectedSubs, setDetectedSubs] = useState<any[]>([]);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({
    provider_name: '',
    category: 'other',
    amount: '',
    billing_cycle: 'monthly',
    next_billing_date: '',
    account_email: '',
    contract_type: '',
    contract_end_date: '',
    auto_renews: true,
    provider_type: '',
    current_tariff: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [newSub, setNewSub] = useState({
    provider_name: '',
    category: 'streaming',
    amount: '',
    billing_cycle: 'monthly',
    next_billing_date: '',
    account_email: '',
    usage_frequency: 'sometimes',
    contract_type: '',
    contract_end_date: '',
    auto_renews: true,
    provider_type: '',
    current_tariff: '',
  });
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [bankToast, setBankToast] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data);
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const [expiredBanks, setExpiredBanks] = useState<BankConnection[]>([]);
  const fetchBankConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/connection');
      if (res.ok) {
        const data = await res.json();
        setBankConnections(data.connections || []);
        setExpiredBanks(data.expired || []);
      }
    } catch (error) {
      console.error('Error fetching bank connection:', error);
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
    fetchBankConnection();
  }, [fetchSubscriptions, fetchBankConnection]);

  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setBankToast('Bank connected! We\'ve synced your last 12 months of transactions.');
      capture('bank_connected');
      const t = setTimeout(() => setBankToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const totalMonthly = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => {
      if (s.billing_cycle === 'monthly') return sum + s.amount;
      if (s.billing_cycle === 'yearly') return sum + s.amount / 12;
      if (s.billing_cycle === 'quarterly') return sum + s.amount / 3;
      return sum;
    }, 0);

  const handleDetectFromInbox = async () => {
    setDetectingFromInbox(true);
    setDetectedSubs([]);
    try {
      const res = await fetch('/api/gmail/detect-subscriptions', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Filter out already-tracked ones
        const tracked = subscriptions.map((s) => s.provider_name.toLowerCase());
        const novel = (data.subscriptions || []).filter(
          (s: any) => !tracked.includes(s.provider_name.toLowerCase())
        );
        setDetectedSubs(novel);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetectingFromInbox(false);
    }
  };

  const handleAddDetected = async (detected: any) => {
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_name: detected.provider_name,
        category: detected.category || 'other',
        amount: detected.amount || 0,
        billing_cycle: detected.billing_cycle || 'monthly',
        usage_frequency: 'sometimes',
      }),
    });
    if (res.ok) {
      setDetectedSubs((prev) => prev.filter((s) => s.provider_name !== detected.provider_name));
      await fetchSubscriptions();
    }
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingSubscription(true);
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSub,
          amount: parseFloat(newSub.amount),
          next_billing_date: newSub.next_billing_date || null,
          account_email: newSub.account_email || null,
          contract_type: newSub.contract_type || null,
          contract_end_date: newSub.contract_end_date || null,
          auto_renews: newSub.auto_renews,
          provider_type: newSub.provider_type || null,
          current_tariff: newSub.current_tariff || null,
        }),
      });
      if (res.ok) {
        await fetchSubscriptions();
        setShowAddForm(false);
        setNewSub({
          provider_name: '',
          category: 'streaming',
          amount: '',
          billing_cycle: 'monthly',
          next_billing_date: '',
          account_email: '',
          usage_frequency: 'sometimes',
          contract_type: '',
          contract_end_date: '',
          auto_renews: true,
          provider_type: '',
          current_tariff: '',
        });
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
    } finally {
      setAddingSubscription(false);
    }
  };

  const [cancelFeedback, setCancelFeedback] = useState('');
  const [showCancelFeedback, setShowCancelFeedback] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleCancelRequest = async (subscription: Subscription, feedback?: string, previousEmail?: string) => {
    setSelectedSub(subscription);
    if (!feedback) {
      setGenerating(true);
      setCancellationEmail(null);
    } else {
      setRegenerating(true);
    }
    setCancellationError(null);

    try {
      const res = await fetch('/api/subscriptions/cancellation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          providerName: subscription.provider_name,
          amount: subscription.amount,
          billingCycle: subscription.billing_cycle,
          accountEmail: subscription.account_email || cancelInfo?.email,
          category: subscription.category,
          cancelMethod: cancelInfo?.method,
          cancelEmail: cancelInfo?.email,
          cancelPhone: cancelInfo?.phone,
          feedback,
          previousEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancellationError(data.error || 'Failed to generate cancellation email. Please try again.');
      } else {
        setCancellationEmail(data);
        setCancelFeedback('');
        setShowCancelFeedback(false);
        capture('cancellation_email_generated', { provider: subscription.provider_name, category: subscription.category });
        await fetchSubscriptions();
      }
    } catch (error: any) {
      setCancellationError(error.message || 'Failed to generate cancellation email. Please try again.');
    } finally {
      setGenerating(false);
      setRegenerating(false);
    }
  };

  const openEditModal = (sub: Subscription) => {
    setEditSub(sub);
    setEditForm({
      provider_name: sub.provider_name,
      category: sub.category || 'other',
      amount: sub.amount.toString(),
      billing_cycle: sub.billing_cycle,
      next_billing_date: sub.next_billing_date ? sub.next_billing_date.split('T')[0] : '',
      account_email: sub.account_email || '',
      contract_type: sub.contract_type || '',
      contract_end_date: sub.contract_end_date ? sub.contract_end_date.split('T')[0] : '',
      auto_renews: sub.auto_renews !== false,
      provider_type: sub.provider_type || '',
      current_tariff: sub.current_tariff || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSub) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/subscriptions/${editSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: editForm.provider_name,
          category: editForm.category,
          amount: parseFloat(editForm.amount),
          billing_cycle: editForm.billing_cycle,
          next_billing_date: editForm.next_billing_date || null,
          account_email: editForm.account_email || null,
          contract_type: editForm.contract_type || null,
          contract_end_date: editForm.contract_end_date || null,
          auto_renews: editForm.auto_renews,
          provider_type: editForm.provider_type || null,
          current_tariff: editForm.current_tariff || null,
        }),
      });
      if (res.ok) {
        await fetchSubscriptions();
        setEditSub(null);
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSub?.id === id) {
        setSelectedSub(null);
        setCancellationEmail(null);
      }
    } catch (error) {
      console.error('Error deleting subscription:', error);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncBank = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bank/sync', { method: 'POST' });
      if (res.ok) {
        await fetchBankConnection();
        await fetchSubscriptions();
        setBankToast('Sync complete!');
        capture('bank_synced');
        setTimeout(() => setBankToast(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setBankToast(`Sync failed: ${data.error || 'Please try again.'}`);
        setTimeout(() => setBankToast(null), 5000);
      }
    } catch {
      setBankToast('Sync failed. Please check your connection and try again.');
      setTimeout(() => setBankToast(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectBank = async (connectionId?: string) => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/bank/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        setBankConnections((prev) => prev.filter((c) => c.id !== connectionId));
      }
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  const getSourceBadges = (source?: string) => {
    if (!source || source === 'manual') {
      return <span className="text-xs bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded" title="Manually added">✏️</span>;
    }
    return (
      <span className="flex gap-1">
        {(source === 'bank' || source === 'bank_and_email') && (
          <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded" title="Detected from bank">🏦</span>
        )}
        {(source === 'email' || source === 'bank_and_email') && (
          <span className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded" title="Detected from email">📧</span>
        )}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded font-medium">Active</span>;
      case 'pending_cancellation':
        return <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-1 rounded font-medium">Cancelling</span>;
      case 'cancelled':
        return <span className="text-xs bg-slate-500/10 text-slate-400 px-2 py-1 rounded font-medium">Cancelled</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Bank toast (success or error) */}
      {bankToast && (
        <div className={`fixed top-6 right-6 z-50 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${bankToast.toLowerCase().includes('fail') || bankToast.toLowerCase().includes('error') ? 'bg-red-600' : 'bg-green-500'}`}>
          <CheckCircle className="h-5 w-5" />
          {bankToast}
        </div>
      )}

      {/* Bank connections */}
      {!bankLoading && (
        <div className="mb-8 space-y-3">
          {/* Show each connected bank */}
          {bankConnections.map((conn) => (
            <div key={conn.id} className="bg-slate-900/50 backdrop-blur-sm border border-green-500/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-green-500/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <Wifi className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-green-400 font-semibold text-sm">
                      {conn.bank_name || 'Bank connected'}
                    </span>
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Active</span>
                    {conn.account_ids && conn.account_ids.length > 1 && (
                      <span className="text-xs text-slate-500">{conn.account_ids.length} accounts</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs">
                    {conn.account_display_names && conn.account_display_names.length > 0 && (
                      <span>{conn.account_display_names.join(', ')} · </span>
                    )}
                    {conn.last_synced_at
                      ? `Last synced: ${new Date(conn.last_synced_at).toLocaleString('en-GB')}`
                      : 'Never synced'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSyncBank}
                    disabled={syncing}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-all text-sm"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    onClick={() => handleDisconnectBank(conn.id)}
                    disabled={disconnecting}
                    className="flex items-center gap-2 text-slate-500 hover:text-red-400 disabled:opacity-50 text-sm transition-all"
                  >
                    <WifiOff className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Expired bank connections */}
          {expiredBanks.length > 0 && bankConnections.length === 0 && (
            expiredBanks.map((conn) => (
              <div key={conn.id} className="bg-slate-900/50 backdrop-blur-sm border border-amber-500/30 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="bg-amber-500/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                    <WifiOff className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-amber-400 font-semibold text-sm">{conn.bank_name || 'Bank'}</span>
                      <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded">Expired</span>
                    </div>
                    <p className="text-slate-500 text-xs">
                      Connection expired. Your existing data is safe. Reconnect to resume auto-sync.
                    </p>
                  </div>
                  <a
                    href="/api/auth/truelayer"
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reconnect
                  </a>
                </div>
              </div>
            ))
          )}

          {/* Add another bank button */}
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {bankConnections.length === 0 && expiredBanks.length === 0
                    ? 'Connect your bank for automatic detection'
                    : 'Connect another bank account'}
                </h3>
                <p className="text-slate-400 text-sm mb-1">
                  We use TrueLayer (FCA regulated) to securely read your transactions. We never store your credentials.
                </p>
                {bankConnections.length === 0 && expiredBanks.length === 0 && (
                  <p className="text-slate-500 text-xs">
                    Supported banks: Barclays, HSBC, Lloyds, NatWest, Santander, Monzo, Starling, and more
                  </p>
                )}
              </div>
              <a
                href="/api/auth/truelayer"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl transition-all text-sm shrink-0"
              >
                <Building2 className="h-4 w-4" />
                {bankConnections.length === 0 ? 'Connect Bank Account' : 'Add Bank'}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Subscriptions</h1>
          <p className="text-slate-400">Track and cancel subscriptions costing you money</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDetectFromInbox}
            disabled={detectingFromInbox}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium px-4 py-3 rounded-lg transition-all text-sm"
          >
            {detectingFromInbox
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Inbox className="h-4 w-4" />}
            {detectingFromInbox ? 'Scanning...' : 'Detect from Inbox'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-3 rounded-lg transition-all text-sm"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Detected subscriptions from inbox */}
      {detectedSubs.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-white font-semibold">Detected from your inbox ({detectedSubs.length})</h2>
          </div>
          <div className="space-y-3">
            {detectedSubs.map((s) => (
              <div key={s.provider_name} className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white font-medium">{s.provider_name}</p>
                  <p className="text-slate-400 text-sm capitalize">
                    {s.category} · £{s.amount > 0 ? s.amount.toFixed(2) : '?'}/{s.billing_cycle}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddDetected(s)}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    Track
                  </button>
                  <button
                    onClick={() => setDetectedSubs((prev) => prev.filter((d) => d.provider_name !== s.provider_name))}
                    className="text-slate-500 hover:text-slate-300 px-2 py-2 text-sm"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-red-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <TrendingDown className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">£{totalMonthly.toFixed(2)}</h3>
          <p className="text-slate-400 text-sm">Monthly spend (est.)</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <CreditCard className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {subscriptions.filter((s) => s.status === 'active').length}
          </h3>
          <p className="text-slate-400 text-sm">Active subscriptions</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <Calendar className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            £{(totalMonthly * 12).toFixed(0)}
          </h3>
          <p className="text-slate-400 text-sm">Annual spend (est.)</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-orange-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {subscriptions.filter(s => {
              if (!s.contract_end_date || s.status !== 'active') return false;
              const daysLeft = Math.ceil((new Date(s.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return daysLeft > 0 && daysLeft <= 90;
            }).length}
          </h3>
          <p className="text-slate-400 text-sm">Renewing within 90 days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Subscriptions list */}
        <div className="space-y-4">
          {subscriptions.length === 0 ? (
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-12 text-center">
              <CreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No subscriptions tracked yet</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-6 py-3 rounded-lg transition-all"
              >
                Add your first subscription
              </button>
            </div>
          ) : (
            subscriptions.map((sub) => (
              <div
                key={sub.id}
                className={`bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-6 transition-all cursor-pointer ${
                  selectedSub?.id === sub.id
                    ? 'border-amber-500/50'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
                onClick={() => {
                  setSelectedSub(sub);
                  setCancellationEmail(null);
                  setCancelInfo(null);
                  fetch(`/api/subscriptions/cancel-info?provider=${encodeURIComponent(sub.provider_name)}`)
                    .then(r => r.json())
                    .then(d => setCancelInfo(d.info || null))
                    .catch(() => {});
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {sub.logo_url ? (
                        <Image
                          src={sub.logo_url}
                          alt={sub.provider_name}
                          width={24}
                          height={24}
                          className="rounded-md shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                        />
                      ) : null}
                      {!sub.logo_url && (
                        <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
                          {sub.provider_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <h3 className="text-lg font-semibold text-white">{sub.provider_name}</h3>
                      {getStatusBadge(sub.status)}
                      {getSourceBadges(sub.source)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      {sub.category && (
                        <span className="capitalize bg-slate-800 px-2 py-0.5 rounded text-xs">{sub.category.replace('_', ' ')}</span>
                      )}
                      <span>£{sub.amount.toFixed(2)}/{sub.billing_cycle === 'one-time' ? 'once' : sub.billing_cycle}</span>
                      {sub.next_billing_date && (
                        <span>Next: {new Date(sub.next_billing_date).toLocaleDateString('en-GB')}</span>
                      )}
                      {sub.contract_end_date && (() => {
                        const daysLeft = Math.ceil((new Date(sub.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        const urgency = daysLeft <= 7 ? 'text-red-400 bg-red-500/10' : daysLeft <= 30 ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10';
                        return (
                          <span className={`${urgency} px-2 py-0.5 rounded text-xs font-medium`}>
                            {daysLeft > 0 ? `Ends in ${daysLeft}d` : 'Expired'}
                          </span>
                        );
                      })()}
                      {sub.contract_type && sub.contract_type !== 'subscription' && (
                        <span className="text-xs bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded capitalize">{sub.contract_type.replace('_', ' ')}</span>
                      )}
                      {sub.auto_renews === false && (
                        <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">No auto-renew</span>
                      )}
                    </div>
                    {sub.source === 'bank' && (
                      <p className="text-xs text-slate-500 mt-1 truncate max-w-md" title={sub.bank_description || ''}>
                        <Building2 className="h-3 w-3 inline mr-1" />
                        {sub.bank_description || 'Detected from bank account'}
                      </p>
                    )}
                    {sub.source === 'manual' && (
                      <p className="text-xs text-slate-500 mt-1">
                        <Pencil className="h-3 w-3 inline mr-1" />Added manually
                      </p>
                    )}
                    {sub.source === 'email' && (
                      <p className="text-xs text-slate-500 mt-1">
                        <Mail className="h-3 w-3 inline mr-1" />Detected from email
                      </p>
                    )}
                    {sub.last_used_date && (
                      <p className="text-xs text-slate-500 mt-1">
                        Last used: {new Date(sub.last_used_date).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-white">£{sub.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">{sub.billing_cycle}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(sub);
                      }}
                      className="text-slate-600 hover:text-amber-400 transition-all"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSubscription(sub.id);
                      }}
                      className="text-slate-600 hover:text-red-400 transition-all"
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {sub.status === 'active' && (
                  <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(sub);
                      }}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-all text-sm"
                    >
                      <Mail className="h-4 w-4" />
                      Generate Cancellation Email
                    </button>
                    {sub.provider_type && ['energy', 'broadband', 'mobile', 'insurance', 'mortgage', 'loan'].includes(sub.provider_type) && (
                      <a
                        href={`/deals/${sub.provider_type === 'mortgage' ? 'mortgages' : sub.provider_type === 'loan' ? 'loans' : sub.provider_type}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 px-4 py-2 rounded-lg transition-all text-sm border border-green-500/20"
                      >
                        <TrendingDown className="h-4 w-4" />
                        Find Better Deal
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Cancellation email panel */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-500" />
            Cancellation Email
          </h2>

          {cancellationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
              {cancellationError}
            </div>
          )}

          {generating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 text-amber-500 animate-spin mb-4" />
              <p className="text-slate-400">Writing your cancellation email...</p>
            </div>
          ) : cancellationEmail ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Saved to your complaint history
              </div>

              <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                <p className="text-xs text-slate-500 mb-1">Subject</p>
                <p className="text-white font-medium">{cancellationEmail.subject}</p>
              </div>

              <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 max-h-72 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-2">Email body</p>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">
                  {cancellationEmail.body}
                </pre>
              </div>

              {/* Edit/Feedback section */}
              {showCancelFeedback ? (
                <div className="space-y-2">
                  <textarea
                    value={cancelFeedback}
                    onChange={(e) => setCancelFeedback(e.target.value)}
                    placeholder="Tell the AI what to change (e.g. 'Make it more formal', 'Add reference to my 2 year contract ending', 'Include my account number 12345')"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectedSub && handleCancelRequest(selectedSub, cancelFeedback, cancellationEmail.body)}
                      disabled={!cancelFeedback.trim() || regenerating}
                      className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold py-2 rounded-lg transition-all text-sm"
                    >
                      {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {regenerating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                    <button
                      onClick={() => { setShowCancelFeedback(false); setCancelFeedback(''); }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelFeedback(true)}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg transition-all text-sm"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Request changes
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    handleCopy(
                      `Subject: ${cancellationEmail.subject}\n\n${cancellationEmail.body}`
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Email
                    </>
                  )}
                </button>
                {selectedSub?.account_email && (
                  <a
                    href={`mailto:${selectedSub.account_email}?subject=${encodeURIComponent(cancellationEmail.subject)}&body=${encodeURIComponent(cancellationEmail.body)}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold py-3 rounded-lg transition-all"
                  >
                    <Mail className="h-4 w-4" />
                    Open in Email
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cancellation method info */}
              {selectedSub && cancelInfo && (
                <div className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                  <h4 className="text-sm font-semibold text-amber-400 mb-3">How to cancel {selectedSub.provider_name}</h4>
                  <p className="text-sm text-slate-300 mb-3">{cancelInfo.method}</p>
                  {cancelInfo.tips && (
                    <p className="text-xs text-slate-400 mb-3">{cancelInfo.tips}</p>
                  )}
                  <div className="space-y-2">
                    {cancelInfo.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                        <a href={`mailto:${cancelInfo.email}`} className="text-amber-400 hover:text-amber-300 underline">{cancelInfo.email}</a>
                      </div>
                    )}
                    {cancelInfo.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs">Tel</span>
                        <a href={`tel:${cancelInfo.phone.split('/')[0].trim().replace(/\s/g, '')}`} className="text-amber-400 hover:text-amber-300">{cancelInfo.phone}</a>
                      </div>
                    )}
                    {cancelInfo.url && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs">Web</span>
                        <a href={cancelInfo.url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline truncate">{cancelInfo.url.replace('https://', '')}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedSub && !cancelInfo && (
                <div className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Cancel {selectedSub.provider_name}</h4>
                  <p className="text-xs text-slate-500">Generate a cancellation letter below. Our AI will suggest the best approach based on the subscription type.</p>
                </div>
              )}

              {!selectedSub && (
                <div className="text-center py-12">
                  <Mail className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">
                    Select a subscription to see cancellation options and generate a cancellation letter
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit subscription modal */}
      {editSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Subscription</h2>
              <button onClick={() => setEditSub(null)} className="text-slate-400 hover:text-white transition-all">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Provider Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.provider_name}
                  onChange={(e) => setEditForm({ ...editForm, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    placeholder="9.99"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Billing Cycle *</label>
                  <select
                    value={editForm.billing_cycle}
                    onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Next Billing Date</label>
                  <input
                    type="date"
                    value={editForm.next_billing_date}
                    onChange={(e) => setEditForm({ ...editForm, next_billing_date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Support Email</label>
                <input
                  type="email"
                  value={editForm.account_email}
                  onChange={(e) => setEditForm({ ...editForm, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract details (collapsible) */}
              <details className="border border-slate-800 rounded-lg">
                <summary className="px-4 py-3 text-sm font-medium text-slate-300 cursor-pointer hover:text-white">
                  Contract Details (optional)
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                      <select
                        value={editForm.contract_type}
                        onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Provider Type</label>
                      <select
                        value={editForm.provider_type}
                        onChange={(e) => setEditForm({ ...editForm, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract End Date</label>
                      <input
                        type="date"
                        value={editForm.contract_end_date}
                        onChange={(e) => setEditForm({ ...editForm, contract_end_date: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Current Tariff</label>
                      <input
                        type="text"
                        value={editForm.current_tariff}
                        onChange={(e) => setEditForm({ ...editForm, current_tariff: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        placeholder="e.g. Standard Variable"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="auto_renews_edit"
                      checked={editForm.auto_renews}
                      onChange={(e) => setEditForm({ ...editForm, auto_renews: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="auto_renews_edit" className="text-sm text-slate-300">Auto-renews at end of contract</label>
                  </div>
                </div>
              </details>

              <button
                type="submit"
                disabled={savingEdit}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {savingEdit ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add subscription modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Add Subscription</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-white transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddSubscription} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Provider Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSub.provider_name}
                  onChange={(e) => setNewSub({ ...newSub, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="e.g. Netflix, Adobe, Spotify"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Amount (£) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newSub.amount}
                    onChange={(e) => setNewSub({ ...newSub, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    placeholder="9.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Billing Cycle *
                  </label>
                  <select
                    value={newSub.billing_cycle}
                    onChange={(e) => setNewSub({ ...newSub, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    {BILLING_CYCLES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Category
                  </label>
                  <select
                    value={newSub.category}
                    onChange={(e) => setNewSub({ ...newSub, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    How often used?
                  </label>
                  <select
                    value={newSub.usage_frequency}
                    onChange={(e) => setNewSub({ ...newSub, usage_frequency: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="never">Never</option>
                    <option value="rarely">Rarely</option>
                    <option value="sometimes">Sometimes</option>
                    <option value="often">Often</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Next Billing Date
                </label>
                <input
                  type="date"
                  value={newSub.next_billing_date}
                  onChange={(e) => setNewSub({ ...newSub, next_billing_date: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Support Email (for mailto link)
                </label>
                <input
                  type="email"
                  value={newSub.account_email}
                  onChange={(e) => setNewSub({ ...newSub, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract details (collapsible) */}
              <details className="border border-slate-800 rounded-lg">
                <summary className="px-4 py-3 text-sm font-medium text-slate-300 cursor-pointer hover:text-white">
                  Contract Details (optional)
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                      <select
                        value={newSub.contract_type}
                        onChange={(e) => setNewSub({ ...newSub, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Provider Type</label>
                      <select
                        value={newSub.provider_type}
                        onChange={(e) => setNewSub({ ...newSub, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract End Date</label>
                      <input
                        type="date"
                        value={newSub.contract_end_date}
                        onChange={(e) => setNewSub({ ...newSub, contract_end_date: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Current Tariff</label>
                      <input
                        type="text"
                        value={newSub.current_tariff}
                        onChange={(e) => setNewSub({ ...newSub, current_tariff: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        placeholder="e.g. Standard Variable"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="auto_renews_new"
                      checked={newSub.auto_renews}
                      onChange={(e) => setNewSub({ ...newSub, auto_renews: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="auto_renews_new" className="text-sm text-slate-300">Auto-renews at end of contract</label>
                  </div>
                </div>
              </details>

              <button
                type="submit"
                disabled={addingSubscription}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {addingSubscription ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Add Subscription
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
