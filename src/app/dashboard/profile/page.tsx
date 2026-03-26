'use client';


import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, CreditCard, TrendingUp, Clock, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { formatGBP } from '@/lib/format';

interface Profile {
  email: string;
  full_name: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  stripe_subscription_id: string | null;
  total_money_recovered: number;
  total_tasks_completed: number;
  total_agents_run: number;
  created_at: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{ type: string; tier?: string; date: string } | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (data) {
            setProfile({
              email: data.email,
              full_name: data.full_name,
              subscription_status: data.subscription_status,
              subscription_tier: data.subscription_tier,
              stripe_subscription_id: data.stripe_subscription_id,
              total_money_recovered: data.total_money_recovered || 0,
              total_tasks_completed: data.total_tasks_completed || 0,
              total_agents_run: data.total_agents_run || 0,
              created_at: data.created_at,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Sync subscription status from Stripe
    fetch('/api/stripe/sync', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.pendingChange) setPendingChange(data.pendingChange);
        if (data.currentPeriodEnd) {
          setRenewalDate(new Date(data.currentPeriodEnd).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          }));
        }
        // If returning from billing portal, refetch profile to show updated tier
        if (searchParams.get('billing') === 'updated' && data.synced) {
          setBillingMessage('Your subscription has been updated.');
          setTimeout(() => setBillingMessage(null), 5000);
          // Refetch profile to pick up any tier changes
          fetchProfile();
        }
      })
      .catch(() => {});
  }, [supabase, searchParams]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.error || 'Please try again or contact support at support@paybacker.co.uk');
        setPortalLoading(false);
      }
    } catch {
      setPortalError('Failed to open billing portal. Please try again or contact support at support@paybacker.co.uk');
      setPortalLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await supabase.auth.signOut();
      router.push('/?deleted=true');
    } catch {
      alert('Failed to delete account. Please contact support@paybacker.co.uk');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading profile...</div>
      </div>
    );
  }

  const memberSince = profile?.created_at 
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : 'Unknown';

  // Trust the DB tier — covers both Stripe-paying and manually upgraded users
  const hasActiveSubscription = profile?.subscription_tier && profile.subscription_tier !== 'free' &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');
  const hasActiveStripe = !!profile?.stripe_subscription_id;
  const effectiveTier = hasActiveSubscription
    ? (profile.subscription_tier || 'free')
    : 'free';

  const subscriptionBadge = () => {
    const colors = {
      free: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      essential: 'bg-mint-400/10 text-mint-400 border-mint-400/30',
      pro: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${colors[effectiveTier as keyof typeof colors]}`}>
        {effectiveTier.charAt(0).toUpperCase() + effectiveTier.slice(1)}
      </span>
    );
  };

  const subscriptionStatusLabel = () => {
    const tier = profile?.subscription_tier;
    const status = profile?.subscription_status;
    const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Free';

    if (!tier || tier === 'free' || !hasActiveStripe) {
      return <span className="text-white font-semibold">Free Plan</span>;
    }
    if (status === 'active') {
      return <span className="text-white font-semibold">{tierLabel} — Active</span>;
    }
    if (status === 'trialing') {
      return <span className="text-white font-semibold">{tierLabel} — Trial</span>;
    }
    if (status === 'past_due') {
      return <span className="text-red-400 font-semibold">{tierLabel} — Payment overdue</span>;
    }
    if (status === 'canceled') {
      return <span className="text-slate-400 font-semibold">{tierLabel} — Cancelled</span>;
    }
    if (status === 'paused') {
      return <span className="text-slate-400 font-semibold">{tierLabel} — Paused</span>;
    }
    return <span className="text-white font-semibold capitalize">{status || 'Free'}</span>;
  };

  return (
    <div className="max-w-4xl">
      {/* Billing update message */}
      {billingMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {billingMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Profile</h1>
        <p className="text-slate-400">Manage your account and view your stats</p>
      </div>

      {/* Account Info */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-mint-400 to-mint-500 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-navy-950" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{profile?.full_name || 'User'}</h2>
              <p className="text-slate-400 flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4" />
                {profile?.email}
              </p>
            </div>
          </div>
          {subscriptionBadge()}
        </div>

        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-navy-700/50">
          <div>
            <p className="text-sm text-slate-500 mb-1">Member since</p>
            <p className="text-white font-semibold">{memberSince}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Subscription status</p>
            {subscriptionStatusLabel()}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
          <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <TrendingUp className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {formatGBP(profile?.total_money_recovered || 0)}
          </h3>
          <p className="text-slate-400 text-sm">Money recovered</p>
        </div>

        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
          <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {profile?.total_tasks_completed || 0}
          </h3>
          <p className="text-slate-400 text-sm">Tasks completed</p>
        </div>

        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
          <div className="bg-purple-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-6 w-6 text-purple-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {profile?.total_agents_run || 0}
          </h3>
          <p className="text-slate-400 text-sm">AI agents run</p>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
        <h2 className="text-xl font-bold text-white mb-6">Connected Accounts</h2>
        
        <div className="space-y-4">
          {/* Gmail - Coming Soon */}
          <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-lg border border-navy-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
                <Mail className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Gmail</h3>
                <p className="text-sm text-slate-400">Scan emails for bills and subscriptions</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-mint-400 bg-mint-400/10 px-3 py-1 rounded-full border border-mint-400/30">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Bank - Coming Soon */}
          <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-lg border border-navy-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Bank Account</h3>
                <p className="text-sm text-slate-400">Automatic transaction categorization</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-mint-400 bg-mint-400/10 px-3 py-1 rounded-full border border-mint-400/30">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Legal links */}
      <div className="flex gap-4 text-xs text-slate-500 mb-6">
        <a href="/legal/privacy" className="hover:text-white transition-all">Privacy Policy</a>
        <a href="/legal/terms" className="hover:text-white transition-all">Terms of Service</a>
      </div>

      {/* Subscription Management */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8">
        <h2 className="text-xl font-bold text-white mb-4">Subscription</h2>
        
        {effectiveTier === 'free' ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Upgrade to unlock more</h3>
            <p className="text-slate-400 mb-6">
              Get unlimited complaints, scanning, and lower success fees
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold px-6 py-3 rounded-lg transition-all"
            >
              Upgrade Plan
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-lg">
              <div>
                <h3 className="text-white font-semibold capitalize">{effectiveTier} Plan</h3>
                <p className="text-sm text-slate-400">
                  {effectiveTier === 'essential' ? '£4.99/month' : '£9.99/month'}
                </p>
                {renewalDate && !pendingChange && (
                  <p className="text-xs text-slate-500 mt-1">Renews {renewalDate}</p>
                )}
              </div>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                {portalLoading ? 'Loading...' : 'Manage Billing'}
              </button>
            </div>

            {/* Pending downgrade or cancellation notice */}
            {pendingChange && (
              <div className="flex items-start gap-3 p-4 rounded-lg border bg-mint-400/5 border-mint-400/20">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-mint-400" />
                <div>
                  {pendingChange.type === 'cancel' ? (
                    <>
                      <p className="text-sm text-mint-400 font-medium">Subscription set to not renew</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Your {effectiveTier} plan will not renew after {pendingChange.date}. You keep full access until then. To continue your subscription, click Manage Billing and reactivate.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-mint-400 font-medium">
                        Changing to {pendingChange.tier?.charAt(0).toUpperCase()}{pendingChange.tier?.slice(1)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Your plan will change to {pendingChange.tier?.charAt(0).toUpperCase()}{pendingChange.tier?.slice(1)} on {pendingChange.date}. You keep {effectiveTier?.charAt(0).toUpperCase()}{effectiveTier?.slice(1)} access until then.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {portalError && (
              <p className="text-xs text-red-400 mt-2">{portalError}</p>
            )}
            <p className="text-xs text-slate-500">
              Manage, upgrade, downgrade or cancel anytime via the billing portal.
            </p>
          </div>
        )}
      </div>
      {/* Danger Zone — Delete Account */}
      <div className="bg-navy-900 backdrop-blur-sm border border-red-900/50 rounded-2xl p-8 mt-6">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-400" />
          Delete Account
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Permanently delete your account and all associated data — complaint letters, subscription history,
          email connections, and usage logs. This action cannot be undone.
        </p>

        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-400 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
          >
            Delete my account and all data
          </button>
        ) : (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-5">
            <p className="text-red-300 font-semibold mb-4">
              Are you sure? This will permanently delete all your data and cannot be reversed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-all text-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="bg-navy-800 hover:bg-navy-700 text-white px-5 py-2.5 rounded-lg transition-all text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
