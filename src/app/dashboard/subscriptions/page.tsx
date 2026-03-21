'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Calendar, TrendingDown, X, Mail, Copy, CheckCircle, Plus, Loader2, Inbox, Sparkles, Pencil, Building2, RefreshCw, Wifi, WifiOff } from 'lucide-react';

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
}

interface BankConnection {
  id: string;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
}

interface CancellationEmail {
  subject: string;
  body: string;
}

const CATEGORIES = ['streaming', 'software', 'fitness', 'news', 'shopping', 'gaming', 'other'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'one-time'];

export default function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
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
  });
  const [bankConnection, setBankConnection] = useState<BankConnection | null>(null);
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

  const fetchBankConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/connection');
      if (res.ok) {
        const data = await res.json();
        setBankConnection(data.connection || null);
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
        });
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
    } finally {
      setAddingSubscription(false);
    }
  };

  const handleCancelRequest = async (subscription: Subscription) => {
    setSelectedSub(subscription);
    setGenerating(true);
    setCancellationEmail(null);
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
          accountEmail: subscription.account_email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancellationError(data.error || 'Failed to generate cancellation email. Please try again.');
      } else {
        setCancellationEmail(data);
        await fetchSubscriptions();
      }
    } catch (error: any) {
      setCancellationError(error.message || 'Failed to generate cancellation email. Please try again.');
    } finally {
      setGenerating(false);
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

  const handleDisconnectBank = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/bank/disconnect', { method: 'POST' });
      if (res.ok) {
        setBankConnection(null);
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

      {/* Bank connection card */}
      {!bankLoading && (
        <div className="mb-8">
          {!bankConnection ? (
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">🏦 Connect your bank for automatic detection</h3>
                  <p className="text-slate-400 text-sm mb-1">
                    We use TrueLayer (FCA regulated) to securely read your transactions. We never store your credentials.
                  </p>
                  <p className="text-slate-500 text-xs">
                    Supported banks: Barclays, HSBC, Lloyds, NatWest, Santander, Monzo, Starling, and more
                  </p>
                </div>
                <a
                  href="/api/auth/truelayer"
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl transition-all text-sm shrink-0"
                >
                  <Building2 className="h-4 w-4" />
                  Connect Bank Account
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 backdrop-blur-sm border border-green-500/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-green-500/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <Wifi className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-green-400 font-semibold text-sm">Bank connected</span>
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Active</span>
                  </div>
                  <p className="text-slate-500 text-xs">
                    {bankConnection.last_synced_at
                      ? `Last synced: ${new Date(bankConnection.last_synced_at).toLocaleString('en-GB')}`
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
                    onClick={handleDisconnectBank}
                    disabled={disconnecting}
                    className="flex items-center gap-2 text-slate-500 hover:text-red-400 disabled:opacity-50 text-sm transition-all"
                  >
                    <WifiOff className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          )}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{sub.provider_name}</h3>
                      {getStatusBadge(sub.status)}
                      {getSourceBadges(sub.source)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      {sub.category && (
                        <span className="capitalize">{sub.category}</span>
                      )}
                      <span>£{sub.amount.toFixed(2)}/{sub.billing_cycle === 'one-time' ? 'once' : sub.billing_cycle}</span>
                      {sub.next_billing_date && (
                        <span>Next: {new Date(sub.next_billing_date).toLocaleDateString('en-GB')}</span>
                      )}
                    </div>
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
                  <div className="mt-4 pt-4 border-t border-slate-800">
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
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Cancellation email panel */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
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
            <div className="text-center py-12">
              <Mail className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                {selectedSub
                  ? `Click "Generate Cancellation Email" on ${selectedSub.provider_name}`
                  : 'Select a subscription and click Generate to create an AI cancellation email'}
              </p>
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
