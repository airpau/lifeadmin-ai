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

        const [profile, subs, tasks, banks, userTasks] = await Promise.all([
          supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
          supabase.from('subscriptions').select('amount, billing_cycle, contract_end_date, status')
            .eq('user_id', user.id).eq('status', 'active').is('dismissed_at', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'complaint_letter'),
          supabase.from('bank_connections').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('status', 'active'),
          supabase.from('tasks').select('id, title, description, type, provider_name, disputed_amount, status, created_at')
            .eq('user_id', user.id).eq('status', 'pending_review')
            .order('created_at', { ascending: false }).limit(20),
        ]);

        setUserTier(profile.data?.subscription_tier || 'free');
        setBankConnected((banks.count || 0) > 0);
        setComplaintsGenerated(tasks.count || 0);
        setPendingTasks(userTasks.data || []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
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
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Welcome to Paybacker! Get started:</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {steps.map(step => (
                <Link key={step.href + step.num} href={step.href} className={`flex items-center gap-3 p-3 rounded-lg transition-all ${step.done ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-800/50 border border-slate-700 hover:border-amber-500/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.done ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
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
        <h1 className="text-4xl font-bold text-white mb-2">Overview</h1>
        <p className="text-slate-400">Your financial snapshot and quick actions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <CreditCard className="h-6 w-6 text-amber-500 mb-3" />
          <p className="text-3xl font-bold text-white">{subscriptionCount}</p>
          <p className="text-slate-400 text-sm">Subscriptions tracked</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <BarChart3 className="h-6 w-6 text-red-400 mb-3" />
          <p className="text-3xl font-bold text-white">{formatGBP(monthlySpend)}</p>
          <p className="text-slate-400 text-sm">Monthly spend</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <FileText className="h-6 w-6 text-blue-400 mb-3" />
          <p className="text-3xl font-bold text-white">{complaintsGenerated}</p>
          <p className="text-slate-400 text-sm">Complaints generated</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <Building2 className="h-6 w-6 text-green-400 mb-3" />
          <p className="text-3xl font-bold text-white">{bankConnected ? 'Connected' : 'Not set up'}</p>
          <p className="text-slate-400 text-sm">Bank account</p>
        </div>
      </div>

      {/* Alerts */}
      {expiringContracts > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-white font-semibold text-sm">{expiringContracts} contract{expiringContracts > 1 ? 's' : ''} expiring within 30 days</p>
              <p className="text-slate-400 text-xs">Review these before they auto-renew at a higher rate</p>
            </div>
          </div>
          <Link href="/dashboard/subscriptions" className="text-amber-400 hover:text-amber-300 text-sm font-medium flex items-center gap-1">
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
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
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
                : needsDeal ? { text: 'Switch and Save', color: 'bg-amber-500/10 text-amber-400' }
                : needsSubscription ? { text: 'Track Subscription', color: 'bg-blue-500/10 text-blue-400' }
                : isLoan ? { text: 'Review Terms', color: 'bg-purple-500/10 text-purple-400' }
                : isAdmin ? { text: 'Admin Task', color: 'bg-slate-700 text-slate-300' }
                : { text: 'Review', color: 'bg-slate-700 text-slate-400' };

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
                <div key={task.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
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
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800 flex-wrap">
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
                      <Link href="/dashboard/deals" className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
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
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark as Done
                      </button>
                    )}
                    {!needsComplaint && !needsDeal && !needsSubscription && !isFlightDelay && !isLoan && !isAdmin && (
                      <Link href={complaintUrl} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
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
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-amber-500" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href="/dashboard/complaints"
          className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all group"
        >
          <FileText className="h-8 w-8 text-amber-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-all">Write a Complaint Letter</h3>
          <p className="text-slate-400 text-sm">Generate a formal letter citing UK consumer law. Energy bills, broadband, debt, refunds, and more.</p>
          <span className="text-amber-400 text-sm mt-3 flex items-center gap-1">Get started <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/subscriptions"
          className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all group"
        >
          <CreditCard className="h-8 w-8 text-green-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-all">Track Subscriptions</h3>
          <p className="text-slate-400 text-sm">See every subscription in one place. Sync from your bank or add manually. Cancel what you don't need.</p>
          <span className="text-amber-400 text-sm mt-3 flex items-center gap-1">Manage <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/forms"
          className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all group"
        >
          <Building2 className="h-8 w-8 text-purple-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-all">Generate Legal Forms</h3>
          <p className="text-slate-400 text-sm">HMRC tax rebates, council tax challenges, parking appeals, flight delay claims, and more.</p>
          <span className="text-amber-400 text-sm mt-3 flex items-center gap-1">Browse forms <ArrowRight className="h-3 w-3" /></span>
        </Link>

        {userTier !== 'free' && (
          <Link
            href="/dashboard/spending"
            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all group"
          >
            <BarChart3 className="h-8 w-8 text-sky-500 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-all">Spending Insights</h3>
            <p className="text-slate-400 text-sm">See where every pound goes. Category breakdown, monthly trends, and smart savings suggestions.</p>
            <span className="text-amber-400 text-sm mt-3 flex items-center gap-1">View insights <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}

        {userTier === 'free' && (
          <Link
            href="/pricing"
            className="bg-slate-900/50 border border-amber-500/30 rounded-2xl p-6 hover:border-amber-500/50 transition-all group"
          >
            <Sparkles className="h-8 w-8 text-amber-500 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-all">Upgrade Your Plan</h3>
            <p className="text-slate-400 text-sm">Get unlimited complaints, daily bank sync, spending insights, cancellation emails, and renewal reminders.</p>
            <span className="text-amber-400 text-sm mt-3 flex items-center gap-1">View plans <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/dashboard/deals" className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Browse 59 Deals</h3>
          <p className="text-slate-500 text-xs">Compare energy, broadband, mobile, insurance, and more. Find cheaper alternatives to your current providers.</p>
        </Link>
        <Link href="/dashboard/subscriptions" className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Track Contracts</h3>
          <p className="text-slate-500 text-xs">Add your subscriptions and contracts with end dates. Get alerts before renewals and find better deals.</p>
        </Link>
      </div>
    </div>
  );
}
