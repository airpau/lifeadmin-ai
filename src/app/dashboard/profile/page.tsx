'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, CreditCard, TrendingUp, Clock, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

interface Profile {
  email: string;
  full_name: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
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
  const supabase = createClient();
  const router = useRouter();

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
  }, [supabase]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Could not open billing portal.');
        setPortalLoading(false);
      }
    } catch {
      alert('Failed to open billing portal. Please try again.');
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
      alert('Failed to delete account. Please contact hello@paybacker.co.uk');
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

  const subscriptionBadge = () => {
    const tier = profile?.subscription_tier || 'free';
    const colors = {
      free: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      essential: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      pro: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${colors[tier as keyof typeof colors]}`}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </span>
    );
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Profile</h1>
        <p className="text-slate-400">Manage your account and view your stats</p>
      </div>

      {/* Account Info */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-slate-950" />
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

        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-800">
          <div>
            <p className="text-sm text-slate-500 mb-1">Member since</p>
            <p className="text-white font-semibold">{memberSince}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Subscription status</p>
            <p className="text-white font-semibold capitalize">{profile?.subscription_status || 'Free'}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <TrendingUp className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            £{profile?.total_money_recovered?.toFixed(2) || '0.00'}
          </h3>
          <p className="text-slate-400 text-sm">Money recovered</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">
            {profile?.total_tasks_completed || 0}
          </h3>
          <p className="text-slate-400 text-sm">Tasks completed</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
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
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 mb-6">
        <h2 className="text-xl font-bold text-white mb-6">Connected Accounts</h2>
        
        <div className="space-y-4">
          {/* Gmail - Coming Soon */}
          <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-lg border border-slate-800">
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
              <span className="text-sm text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Bank - Coming Soon */}
          <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-lg border border-slate-800">
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
              <span className="text-sm text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
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
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
        <h2 className="text-xl font-bold text-white mb-4">Subscription</h2>
        
        {!profile?.subscription_tier || profile.subscription_tier === 'free' ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Upgrade to unlock more</h3>
            <p className="text-slate-400 mb-6">
              Get unlimited complaints, scanning, and lower success fees
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-6 py-3 rounded-lg transition-all"
            >
              Upgrade Plan
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-lg">
              <div>
                <h3 className="text-white font-semibold capitalize">{profile?.subscription_tier} Plan</h3>
                <p className="text-sm text-slate-400">
                  {profile?.subscription_tier === 'essential' ? '£9.99/month' : '£19.99/month'}
                </p>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                {portalLoading ? 'Loading...' : 'Manage Billing'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Your subscription will renew automatically. Manage or cancel anytime via the billing portal.
            </p>
          </div>
        )}
      </div>
      {/* Danger Zone — Delete Account */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-red-900/50 rounded-2xl p-8 mt-6">
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
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg transition-all text-sm"
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
