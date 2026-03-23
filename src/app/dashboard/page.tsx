'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCard, FileText, Building2, BarChart3, CheckCircle,
  ArrowRight, Loader2, AlertTriangle, Clock, Sparkles,
} from 'lucide-react';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [complaintsGenerated, setComplaintsGenerated] = useState(0);
  const [bankConnected, setBankConnected] = useState(false);
  const [expiringContracts, setExpiringContracts] = useState(0);
  const [userTier, setUserTier] = useState('free');
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Awin tracking for free signups
  useEffect(() => {
    if (searchParams.get('signup') === '1') {
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
          amount: '1.00', orderRef: ref, parts: 'LEAD:1.00',
          voucher: '', currency: 'GBP', channel: 'aw', customerAcquisition: 'NEW',
        };
        if (typeof w.AWIN?.Tracking?.saleSubmit === 'function') {
          w.AWIN.Tracking.saleSubmit();
        } else {
          const pixel = new window.Image(0, 0);
          pixel.src = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=125502&amount=1.00&cr=GBP&ref=${encodeURIComponent(ref)}&parts=LEAD:1.00&vc=&ch=aw&customeracquisition=NEW${awc ? `&cks=${encodeURIComponent(awc)}` : ''}`;
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

  // Sync subscription after Stripe checkout
  useEffect(() => {
    if (searchParams.get('success') === 'true' || searchParams.get('upgraded')) {
      fetch('/api/stripe/sync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.synced && data.tier && data.tier !== 'free') {
            setSyncMessage(`Welcome to Paybacker ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}!`);
            setTimeout(() => setSyncMessage(null), 5000);
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

        const [profile, subs, tasks, banks] = await Promise.all([
          supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
          supabase.from('subscriptions').select('amount, billing_cycle, contract_end_date, status')
            .eq('user_id', user.id).eq('status', 'active').is('dismissed_at', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'complaint_letter'),
          supabase.from('bank_connections').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('status', 'active'),
        ]);

        setUserTier(profile.data?.subscription_tier || 'free');
        setBankConnected((banks.count || 0) > 0);
        setComplaintsGenerated(tasks.count || 0);

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
          <p className="text-3xl font-bold text-white">£{monthlySpend.toFixed(0)}</p>
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

      {/* What's Coming */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-slate-400" />
          Coming Soon
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
            <p className="text-white font-medium text-sm mb-1">Deal Comparison</p>
            <p className="text-slate-500 text-xs">Compare energy, broadband, insurance, and more. Switch and save directly from your dashboard.</p>
          </div>
          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
            <p className="text-white font-medium text-sm mb-1">Email Inbox Scanning</p>
            <p className="text-slate-500 text-xs">Connect Gmail or Outlook to automatically find subscriptions, overcharges, and renewal dates from your emails.</p>
          </div>
          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
            <p className="text-white font-medium text-sm mb-1">Automated Cancellations</p>
            <p className="text-slate-500 text-xs">Let our AI handle the cancellation process for you. We'll contact the provider and confirm once it's done.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
