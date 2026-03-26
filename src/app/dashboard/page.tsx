'use client';


import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCard, FileText, Building2, BarChart3, CheckCircle, CheckCircle2,
  ArrowRight, Loader2, AlertTriangle, Clock, Sparkles,
} from 'lucide-react';
import { formatGBP } from '@/lib/format';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [complaintsGenerated, setComplaintsGenerated] = useState(0);
  const [bankConnected, setBankConnected] = useState(false);
  const [expiringContracts, setExpiringContracts] = useState(0);
  const [userTier, setUserTier] = useState('free');
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [moneySaved, setMoneySaved] = useState(0);
  const [potentialSavings, setPotentialSavings] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [unconfirmedSavings, setUnconfirmedSavings] = useState<{ id: string; provider_name: string; money_saved: number }[]>([]);
  const [editingSavingId, setEditingSavingId] = useState<string | null>(null);
  const [editingSavingAmount, setEditingSavingAmount] = useState('');
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Meta Pixel + Awin tracking for free signups
  useEffect(() => {
    if (searchParams.get('signup') === '1') {
      // Meta Pixel Lead event
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'Lead');
      }
      const ref = sessionStorage.getItem('awin_ref') || '';
      const awc = sessionStorage.getItem('awin_awc') || '';
      sessionStorage.removeItem('awin_ref');
      sessionStorage.removeItem('awin_awc');
      if (!ref) return;

      let fired = false;
      let attempts = 0;
      const fire = () => {
        if (fired) return;
        fired = true;
        const w = window as any;
        w.AWIN = w.AWIN || {};
        w.AWIN.Tracking = w.AWIN.Tracking || {};
        w.AWIN.Tracking.Sale = {
          amount: '1', orderRef: ref, parts: 'LEAD:1',
          voucher: '', currency: 'GBP', channel: 'aw', customerAcquisition: 'NEW',
        };
        if (typeof w.AWIN?.Tracking?.saleSubmit === 'function') {
          w.AWIN.Tracking.saleSubmit();
        } else {
          const pixel = new window.Image(0, 0);
          pixel.src = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=125502&amount=1&cr=GBP&ref=${encodeURIComponent(ref)}&parts=LEAD:1&vc=&ch=aw&customeracquisition=NEW${awc ? `&cks=${encodeURIComponent(awc)}` : ''}`;
        }
      };
      const poll = () => {
        const w = window as any;
        if (typeof w.AWIN?.Tracking?.saleSubmit === 'function' || attempts >= 40) { fire(); }
        else { attempts++; setTimeout(poll, 250); }
      };
      poll();
    }
  }, [searchParams]);

  // Sync subscription after Stripe checkout + Awin/Meta conversion tracking
  useEffect(() => {
    if (searchParams.get('success') === 'true' || searchParams.get('upgraded')) {
      // Recall transaction data stored before Stripe redirect
      const savedCheckout = (() => {
        try {
          const raw = sessionStorage.getItem('awin_checkout');
          if (raw) {
            sessionStorage.removeItem('awin_checkout');
            return JSON.parse(raw);
          }
        } catch {}
        return null;
      })();

      fetch('/api/stripe/sync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.synced && data.tier && data.tier !== 'free') {
            setSyncMessage(`Welcome to Paybacker ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}!`);
            setTimeout(() => setSyncMessage(null), 5000);

            // Use subscription ID from sync to match S2S tracking ref exactly
            const tier = data.tier;
            const amount = tier === 'pro' ? '9.99' : '4.99';
            const commGroup = tier === 'pro' ? 'PRO' : 'ESSENTIAL';
            const orderRef = data.subscriptionId ? `sub-${data.subscriptionId}` : (savedCheckout?.orderRef || `conversion-${tier}-${Date.now()}`);

            // Meta Pixel Purchase event
            if (typeof (window as any).fbq === 'function') {
              (window as any).fbq('track', 'Purchase', {
                value: parseFloat(amount),
                currency: 'GBP',
              });
            }

            // Push to dataLayer for GTM/Awin
            const w = window as any;
            w.dataLayer = w.dataLayer || [];
            w.dataLayer.push({ event: 'OrderReference', value: orderRef });
            w.dataLayer.push({ event: 'TotalOrderValue', value: amount });
            w.dataLayer.push({ event: 'CommissionGroup', value: commGroup });

            // Awin conversion tracking (client-side via mastertag)
            w.AWIN = w.AWIN || {};
            w.AWIN.Tracking = w.AWIN.Tracking || {};
            w.AWIN.Tracking.Sale = {
              amount,
              orderRef,
              parts: `${commGroup}:${amount}`,
              voucher: '',
              currency: 'GBP',
              channel: 'aw',
              customerAcquisition: 'NEW',
            };
            if (typeof w.AWIN?.Tracking?.saleSubmit === 'function') {
              w.AWIN.Tracking.saleSubmit();
            } else {
              // Fallback image pixel if mastertag hasn't loaded
              const pixel = new window.Image(0, 0);
              pixel.src = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=125502&amount=${amount}&cr=GBP&ref=${encodeURIComponent(orderRef)}&parts=${commGroup}:${amount}&vc=&ch=aw&customeracquisition=NEW`;
            }
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profile, subs, tasks, banks, userTasks, cancelledSubs, resolvedTasks] = await Promise.all([
          supabase.from('profiles').select('subscription_tier, total_money_recovered, founding_member, founding_member_expires, subscription_status, stripe_subscription_id').eq('id', user.id).single(),
          supabase.from('subscriptions').select('amount, billing_cycle, contract_end_date, status')
            .eq('user_id', user.id).eq('status', 'active').is('dismissed_at', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'complaint_letter'),
          supabase.from('bank_connections').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('status', 'active'),
          supabase.from('tasks').select('id, title, description, type, provider_name, disputed_amount, status, created_at')
            .eq('user_id', user.id).eq('status', 'pending_review')
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('subscriptions').select('id, provider_name, amount, billing_cycle, money_saved, cancelled_at, notes')
            .eq('user_id', user.id).eq('status', 'cancelled'),
          supabase.from('tasks').select('money_recovered')
            .eq('user_id', user.id).eq('status', 'resolved'),
        ]);

        setUserTier(profile.data?.subscription_tier || 'free');
        setBankConnected((banks.count || 0) > 0);

        // Check trial status
        if (profile.data?.founding_member && profile.data?.founding_member_expires && !profile.data?.stripe_subscription_id) {
          const expiresAt = new Date(profile.data.founding_member_expires);
          const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          if (daysLeft > 0) {
            setTrialDaysLeft(daysLeft);
          } else {
            setTrialExpired(true);
          }
        }
        setComplaintsGenerated(tasks.count || 0);
        // Filter out Paybacker's own transactions from action items
        setPendingTasks((userTasks.data || []).filter((t: any) =>
          !((t.provider_name || '').toLowerCase().includes('paybacker'))
        ));

        // Calculate Money Recovery Score
        let saved = parseFloat(String(profile.data?.total_money_recovered || 0));

        // Add cancelled subscription savings
        for (const sub of (cancelledSubs.data || [])) {
          if (sub.money_saved) {
            saved += parseFloat(String(sub.money_saved));
          } else if (sub.cancelled_at && sub.amount) {
            // Estimate: monthly amount x months since cancellation
            const monthsSince = Math.max(1, Math.floor(
              (Date.now() - new Date(sub.cancelled_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
            ));
            const monthlyAmt = sub.billing_cycle === 'yearly'
              ? parseFloat(String(sub.amount)) / 12
              : sub.billing_cycle === 'quarterly'
                ? parseFloat(String(sub.amount)) / 3
                : parseFloat(String(sub.amount));
            saved += monthlyAmt * monthsSince;
          }
        }

        // Add resolved task recoveries
        for (const t of (resolvedTasks.data || [])) {
          if (t.money_recovered) {
            saved += parseFloat(String(t.money_recovered));
          }
        }
        setMoneySaved(saved);

        // Find cancelled subs where user hasn't confirmed the saving yet
        const unconfirmed = (cancelledSubs.data || [])
          .filter(s => s.money_saved && s.money_saved > 0 && s.notes !== 'savings_confirmed')
          .map(s => ({
            id: s.id,
            provider_name: s.provider_name,
            money_saved: parseFloat(String(s.money_saved)),
          }));
        setUnconfirmedSavings(unconfirmed);

        // Potential savings: estimate from active subscriptions (assume 15% could be saved by switching)
        const activeSubs = subs.data || [];
        const annualSpend = activeSubs.reduce((sum, s) => {
          const amt = parseFloat(String(s.amount)) || 0;
          if (s.billing_cycle === 'yearly') return sum + amt;
          if (s.billing_cycle === 'quarterly') return sum + amt * 4;
          return sum + amt * 12;
        }, 0);
        setPotentialSavings(annualSpend * 0.15);

        const subsList = subs.data || [];
        setSubscriptionCount(subsList.length);

        // Calculate monthly spend
        const monthly = subsList.reduce((sum, s) => {
          const amt = parseFloat(String(s.amount)) || 0;
          if (s.billing_cycle === 'yearly') return sum + amt / 12;
          if (s.billing_cycle === 'quarterly') return sum + amt / 3;
          return sum + amt;
        }, 0);
        setMonthlySpend(monthly);

        // Count contracts expiring within 30 days
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiring = subsList.filter(s =>
          s.contract_end_date &&
          new Date(s.contract_end_date) >= now &&
          new Date(s.contract_end_date) <= thirtyDays
        ).length;
        setExpiringContracts(expiring);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase]);

  const handleSavingAction = async (subId: string, action: 'confirm' | 'reject' | 'amend', newAmount?: number) => {
    const updates: Record<string, any> = { notes: 'savings_confirmed' };
    if (action === 'reject') {
      updates.money_saved = 0;
    } else if (action === 'amend' && newAmount !== undefined) {
      updates.money_saved = newAmount;
    }

    await fetch(`/api/subscriptions/${subId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    setUnconfirmedSavings(prev => prev.filter(s => s.id !== subId));
    setEditingSavingId(null);

    // Recalculate total
    if (action === 'reject') {
      const sub = unconfirmedSavings.find(s => s.id === subId);
      if (sub) setMoneySaved(prev => prev - sub.money_saved);
    } else if (action === 'amend' && newAmount !== undefined) {
      const sub = unconfirmedSavings.find(s => s.id === subId);
      if (sub) setMoneySaved(prev => prev - sub.money_saved + newAmount);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {syncMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {syncMessage}
        </div>
      )}

      {/* Trial expiry banner */}
      {trialExpired && (
        <div className="mb-6 bg-brand-400/10 border border-brand-400/30 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">Your free Pro trial has ended</p>
            <p className="text-slate-400 text-xs mt-1">Upgrade to keep unlimited letters, daily bank sync, spending intelligence, and all Pro features. All your data is safe.</p>
          </div>
          <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all text-sm whitespace-nowrap ml-4">
            Upgrade Now
          </Link>
        </div>
      )}

      {trialDaysLeft !== null && trialDaysLeft <= 7 && (
        <div className="mb-6 bg-mint-400/10 border border-mint-400/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-mint-400" />
            <p className="text-white text-sm">
              Pro trial ends in <span className="text-mint-400 font-semibold">{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</span>. Upgrade to keep all features.
            </p>
          </div>
          <Link href="/pricing" className="text-mint-400 hover:text-mint-300 text-sm font-medium whitespace-nowrap ml-4">
            View Plans
          </Link>
        </div>
      )}

      {/* Onboarding checklist - only show for new users who haven't completed all steps */}
      {(() => {
        const steps = [
          { num: 1, label: 'Connect your bank', href: '/dashboard/subscriptions', done: bankConnected },
          { num: 2, label: 'Review your subscriptions', href: '/dashboard/subscriptions', done: subscriptionCount > 0 },
          { num: 3, label: 'Generate your first complaint letter', href: '/dashboard/complaints', done: complaintsGenerated > 0 },
          { num: 4, label: 'Browse deals', href: '/dashboard/deals', done: false },
        ];
        const allDone = steps.filter(s => s.num !== 4).every(s => s.done);
        if (allDone) return null;
        return (
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-mint-400/20 rounded-2xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">Welcome to Paybacker! Get started:</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {steps.map(step => (
                <Link key={step.href + step.num} href={step.href} className={`flex items-center gap-3 p-3 rounded-lg transition-all ${step.done ? 'bg-green-500/10 border border-green-500/20' : 'bg-navy-800/50 border border-navy-700/50 hover:border-mint-400/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.done ? 'bg-green-500 text-white' : 'bg-navy-700 text-slate-400'}`}>
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs">{step.num}</span>}
                  </div>
                  <span className={`text-sm ${step.done ? 'text-green-400' : 'text-white'}`}>{step.label}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Overview</h1>
        <p className="text-slate-400">Your financial snapshot and quick actions</p>
      </div>

      {/* Money Recovery Score */}
      <div className="bg-gradient-to-r from-mint-400/10 to-brand-400/5 border border-mint-400/20 rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-mint-400" />
              <h2 className="text-sm font-semibold text-mint-400 uppercase tracking-wider">Money Recovery Score</h2>
            </div>
            <p className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-heading)]">
              {formatGBP(moneySaved)}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {moneySaved > 0
                ? 'saved through cancelled subscriptions and recovered money'
                : 'Start saving by cancelling unused subscriptions or disputing unfair charges'}
            </p>
          </div>
          {potentialSavings > 0 && (
            <div className="bg-navy-900/50 rounded-xl px-5 py-3 text-center sm:text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Potential savings</p>
              <p className="text-xl font-bold text-brand-400">{formatGBP(potentialSavings)}<span className="text-sm font-normal text-slate-500">/yr</span></p>
              <Link href="/dashboard/deals" className="text-xs text-mint-400 hover:text-mint-300 flex items-center justify-center sm:justify-end gap-1 mt-1">
                Find deals <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
        {/* Unconfirmed savings to review */}
        {unconfirmedSavings.length > 0 && (
          <div className="mt-4 border-t border-navy-700/50 pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Review your savings</p>
            <div className="space-y-2">
              {unconfirmedSavings.map(sub => (
                <div key={sub.id} className="flex items-center justify-between bg-navy-900/50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-white font-medium">{sub.provider_name}</p>
                    <p className="text-xs text-slate-400">
                      {editingSavingId === sub.id ? (
                        <span className="inline-flex items-center gap-1">
                          <span>&pound;</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingSavingAmount}
                            onChange={(e) => setEditingSavingAmount(e.target.value)}
                            className="w-20 bg-navy-800 border border-navy-700 rounded px-2 py-0.5 text-white text-xs focus:outline-none focus:border-mint-400"
                            autoFocus
                          />
                          <span>/month</span>
                        </span>
                      ) : (
                        <span>Estimated saving: {formatGBP(sub.money_saved)}/month</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editingSavingId === sub.id ? (
                      <button
                        onClick={() => handleSavingAction(sub.id, 'amend', parseFloat(editingSavingAmount) || 0)}
                        className="text-xs bg-mint-400 text-navy-950 px-3 py-1.5 rounded-lg font-medium"
                      >
                        Save
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSavingAction(sub.id, 'confirm')}
                          className="text-xs bg-mint-400/10 text-mint-400 px-3 py-1.5 rounded-lg hover:bg-mint-400/20 transition-all"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setEditingSavingId(sub.id);
                            setEditingSavingAmount(String(sub.money_saved));
                          }}
                          className="text-xs bg-navy-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-navy-700 transition-all"
                        >
                          Amend
                        </button>
                        <button
                          onClick={() => handleSavingAction(sub.id, 'reject')}
                          className="text-xs text-slate-500 hover:text-red-400 px-2 py-1.5 transition-all"
                          title="Not a real saving"
                        >
                          &times;
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {moneySaved > 0 && potentialSavings > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Recovered</span>
              <span>Potential total: {formatGBP(moneySaved + potentialSavings)}</span>
            </div>
            <div className="w-full bg-navy-800 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-mint-400 to-mint-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (moneySaved / (moneySaved + potentialSavings)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card]">
          <CreditCard className="h-6 w-6 text-mint-400 mb-3" />
          <p className="text-3xl font-bold text-white">{subscriptionCount}</p>
          <p className="text-slate-400 text-sm">Subscriptions tracked</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card]">
          <BarChart3 className="h-6 w-6 text-red-400 mb-3" />
          <p className="text-3xl font-bold text-white">{formatGBP(monthlySpend)}</p>
          <p className="text-slate-400 text-sm">Monthly spend</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card]">
          <FileText className="h-6 w-6 text-blue-400 mb-3" />
          <p className="text-3xl font-bold text-white">{complaintsGenerated}</p>
          <p className="text-slate-400 text-sm">Complaints generated</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card]">
          <Building2 className="h-6 w-6 text-green-400 mb-3" />
          <p className="text-3xl font-bold text-white">{bankConnected ? 'Connected' : 'Not set up'}</p>
          <p className="text-slate-400 text-sm">Bank account</p>
        </div>
      </div>

      {/* Alerts */}
      {expiringContracts > 0 && (
        <div className="bg-mint-400/10 border border-mint-400/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-mint-400" />
            <div>
              <p className="text-white font-semibold text-sm">{expiringContracts} contract{expiringContracts > 1 ? 's' : ''} expiring within 30 days</p>
              <p className="text-slate-400 text-xs">Review these before they auto-renew at a higher rate</p>
            </div>
          </div>
          <Link href="/dashboard/subscriptions" className="text-mint-400 hover:text-mint-300 text-sm font-medium flex items-center gap-1">
            View <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {!bankConnected && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-white font-semibold text-sm">Connect your bank account</p>
              <p className="text-slate-400 text-xs">Automatically detect all your subscriptions and recurring payments</p>
            </div>
          </div>
          <Link href="/dashboard/subscriptions" className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1">
            Connect <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Action Items */}
      {pendingTasks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 font-[family-name:var(--font-heading)]">
            <Clock className="h-5 w-5 text-mint-400" />
            Your Action Items ({pendingTasks.length})
          </h2>
          <div className="space-y-3">
            {pendingTasks.map((task) => {
              // Parse JSON description if present
              const parsedDesc = (() => { try { return JSON.parse(task.description || '{}'); } catch { return null; } })();
              const oppType = parsedDesc?.type || '';
              const descText = parsedDesc?.description || task.description || '';
              const descLower = descText.toLowerCase();
              const provider = task.provider_name || parsedDesc?.provider || '';
              const amount = task.disputed_amount || parsedDesc?.amount || parsedDesc?.paymentAmount || '';

              // Intelligent action classification
              const isSubscription = oppType === 'subscription' || oppType === 'forgotten_subscription' || descLower.includes('subscription') || descLower.includes('direct debit') || descLower.includes('recurring');
              const isOvercharge = ['overcharge', 'price_increase', 'utility_bill', 'refund_opportunity'].includes(oppType) || descLower.includes('overcharg') || descLower.includes('refund');
              const isRenewal = oppType === 'renewal' || descLower.includes('renewal') || descLower.includes('contract end') || descLower.includes('expir');
              const isFlightDelay = oppType === 'flight_delay' || descLower.includes('flight') || descLower.includes('delay') || descLower.includes('eu261') || descLower.includes('uk261');
              const isDebt = descLower.includes('debt') || descLower.includes('collection') || descLower.includes('bailiff');
              const isAdmin = oppType === 'admin_task' || descLower.includes('confirmation statement') || descLower.includes('companies house') || descLower.includes('hmrc') || descLower.includes('dvla');
              const isInsurance = oppType === 'insurance' || descLower.includes('insurance') || descLower.includes('claim');
              const isLoan = oppType === 'loan' || oppType === 'credit_card' || descLower.includes('loan') || descLower.includes('mortgage') || descLower.includes('credit card');
              const needsComplaint = isOvercharge || task.type === 'complaint_letter' || isDebt;
              const needsDeal = isRenewal || isInsurance;
              const needsSubscription = isSubscription;

              // Determine badge
              const badge = isFlightDelay ? { text: 'Flight Compensation', color: 'bg-sky-500/10 text-sky-400' }
                : needsComplaint ? { text: 'Dispute', color: 'bg-red-500/10 text-red-400' }
                : needsDeal ? { text: 'Switch and Save', color: 'bg-mint-400/10 text-mint-400' }
                : needsSubscription ? { text: 'Track Subscription', color: 'bg-blue-500/10 text-blue-400' }
                : isLoan ? { text: 'Review Terms', color: 'bg-purple-500/10 text-purple-400' }
                : isAdmin ? { text: 'Admin Task', color: 'bg-navy-700 text-slate-300' }
                : { text: 'Review', color: 'bg-navy-700 text-slate-400' };

              // Build correct action URL with proper params for each destination
              const complaintParams = new URLSearchParams();
              if (provider) complaintParams.set('company', provider);
              if (descText && descText.length < 500) complaintParams.set('issue', descText);
              if (amount) complaintParams.set('amount', String(amount));
              const complaintUrl = `/dashboard/complaints?${complaintParams.toString()}`;

              const subscriptionParams = new URLSearchParams();
              if (provider) subscriptionParams.set('name', provider);
              if (amount) subscriptionParams.set('amount', String(amount));

              return (
                <div key={task.id} className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>{badge.text}</span>
                        {provider && <span className="text-slate-500 text-xs">{provider}</span>}
                        {amount && Number(amount) > 0 && <span className="text-green-400 text-xs font-medium">{formatGBP(parseFloat(String(amount)))}</span>}
                      </div>
                      <p className="text-white text-sm font-medium">{task.title}</p>
                      <p className="text-slate-400 text-xs mt-1 line-clamp-2">{descText}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-navy-700/50 flex-wrap">
                    {/* Context-aware primary action */}
                    {needsComplaint && (
                      <Link href={complaintUrl} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Write Complaint Letter
                      </Link>
                    )}
                    {isFlightDelay && (
                      <Link href={`/dashboard/forms?type=flight_delay${provider ? `&airline=${encodeURIComponent(provider)}` : ''}`} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Claim £520 Compensation
                      </Link>
                    )}
                    {needsDeal && (
                      <Link href="/dashboard/deals" className="bg-mint-400/10 hover:bg-mint-400/20 text-mint-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Find Better Deal
                      </Link>
                    )}
                    {needsSubscription && (
                      <Link href="/dashboard/subscriptions" className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Track Subscription
                      </Link>
                    )}
                    {isLoan && (
                      <Link href={complaintUrl} className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Review and Dispute
                      </Link>
                    )}
                    {isAdmin && !needsComplaint && !needsDeal && !needsSubscription && !isFlightDelay && !isLoan && (
                      <button
                        onClick={async () => {
                          await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
                        }}
                        className="bg-navy-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark as Done
                      </button>
                    )}
                    {!needsComplaint && !needsDeal && !needsSubscription && !isFlightDelay && !isLoan && !isAdmin && (
                      <Link href={complaintUrl} className="bg-navy-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Take Action
                      </Link>
                    )}

                    <div className="flex-1" />

                    <button
                      onClick={async () => {
                        await supabase.from('tasks').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', task.id);
                        setPendingTasks(prev => prev.filter(t => t.id !== task.id));
                      }}
                      className="text-slate-500 hover:text-slate-400 text-xs transition-all px-3 py-1.5"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 font-[family-name:var(--font-heading)]">
        <Sparkles className="h-5 w-5 text-mint-400" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href="/dashboard/complaints"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <FileText className="h-8 w-8 text-mint-400 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Write a Complaint Letter</h3>
          <p className="text-slate-400 text-sm">Generate a formal letter citing UK consumer law. Energy bills, broadband, debt, refunds, and more.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Get started <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/subscriptions"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <CreditCard className="h-8 w-8 text-green-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Track Subscriptions</h3>
          <p className="text-slate-400 text-sm">See every subscription in one place. Sync from your bank or add manually. Cancel what you don't need.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Manage <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/forms"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <Building2 className="h-8 w-8 text-purple-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Generate Legal Forms</h3>
          <p className="text-slate-400 text-sm">HMRC tax rebates, council tax challenges, parking appeals, flight delay claims, and more.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Browse forms <ArrowRight className="h-3 w-3" /></span>
        </Link>

        {userTier !== 'free' && (
          <Link
            href="/dashboard/spending"
            className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
          >
            <BarChart3 className="h-8 w-8 text-sky-500 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Spending Insights</h3>
            <p className="text-slate-400 text-sm">See where every pound goes. Category breakdown, monthly trends, and smart savings suggestions.</p>
            <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">View insights <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}

        {userTier === 'free' && (
          <Link
            href="/pricing"
            className="bg-navy-900 border border-mint-400/30 rounded-2xl p-6 hover:border-mint-400/50 transition-all group"
          >
            <Sparkles className="h-8 w-8 text-mint-400 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Upgrade Your Plan</h3>
            <p className="text-slate-400 text-sm">Get unlimited complaints, daily bank sync, spending insights, cancellation emails, and renewal reminders.</p>
            <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">View plans <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/dashboard/deals" className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Browse 59 Deals</h3>
          <p className="text-slate-500 text-xs">Compare energy, broadband, mobile, insurance, and more. Find cheaper alternatives to your current providers.</p>
        </Link>
        <Link href="/dashboard/subscriptions" className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Track Contracts</h3>
          <p className="text-slate-500 text-xs">Add your subscriptions and contracts with end dates. Get alerts before renewals and find better deals.</p>
        </Link>
      </div>
    </div>
  );
}
