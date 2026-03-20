'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Calendar, TrendingDown, X, Mail, Copy, CheckCircle, Plus, Loader2 } from 'lucide-react';

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
}

interface CancellationEmail {
  subject: string;
  body: string;
}

const CATEGORIES = ['streaming', 'software', 'fitness', 'news', 'shopping', 'gaming', 'other'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'one-time'];

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [cancellationEmail, setCancellationEmail] = useState<CancellationEmail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [newSub, setNewSub] = useState({
    provider_name: '',
    category: 'streaming',
    amount: '',
    billing_cycle: 'monthly',
    next_billing_date: '',
    account_email: '',
    usage_frequency: 'sometimes',
  });

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

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const totalMonthly = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => {
      if (s.billing_cycle === 'monthly') return sum + s.amount;
      if (s.billing_cycle === 'yearly') return sum + s.amount / 12;
      if (s.billing_cycle === 'quarterly') return sum + s.amount / 3;
      return sum;
    }, 0);

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

      if (res.ok) {
        const data = await res.json();
        setCancellationEmail(data);
        await fetchSubscriptions();
      }
    } catch (error) {
      console.error('Error generating cancellation email:', error);
    } finally {
      setGenerating(false);
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Subscriptions</h1>
          <p className="text-slate-400">Track and cancel subscriptions costing you money</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-5 py-3 rounded-lg transition-all"
        >
          <Plus className="h-5 w-5" />
          Add Subscription
        </button>
      </div>

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
                        handleDeleteSubscription(sub.id);
                      }}
                      className="text-slate-600 hover:text-red-400 transition-all"
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

          {generating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 text-amber-500 animate-spin mb-4" />
              <p className="text-slate-400">Writing your cancellation email with AI...</p>
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
