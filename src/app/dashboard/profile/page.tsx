'use client';


import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, CreditCard, TrendingUp, Clock, CheckCircle2, AlertCircle, Trash2, Pencil, Save, MapPin, FileText, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { formatGBP } from '@/lib/format';
import FinancialReport from '@/components/reports/FinancialReport';
import type { AnnualReportData, OnDemandReportData } from '@/lib/report-generator';

interface Profile {
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  stripe_subscription_id: string | null;
  total_money_recovered: number;
  total_tasks_completed: number;
  total_agents_run: number;
  created_at: string;
  trial_ends_at: string | null;
  founding_member: boolean;
}

function ProfileStatsSection({ supabase, fallbackRecovered }: { supabase: ReturnType<typeof createClient>; fallbackRecovered: number }) {
  const [lettersWritten, setLettersWritten] = useState(0);
  const [moneyRecovered, setMoneyRecovered] = useState(fallbackRecovered);
  const [activeDisputes, setActiveDisputes] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      const [letters, resolved, disputes] = await Promise.all([
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('tasks').select('money_recovered').eq('user_id', user.id).eq('status', 'resolved'),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'open'),
      ]);
      setLettersWritten(letters.count || 0);
      const totalRecovered = (resolved.data || []).reduce((sum, t) => sum + (parseFloat(String(t.money_recovered)) || 0), 0);
      setMoneyRecovered(Math.max(totalRecovered, fallbackRecovered));
      setActiveDisputes(disputes.count || 0);
      setLoaded(true);
    };
    load();
  }, [supabase, fallbackRecovered]);

  return (
    <div className="grid md:grid-cols-3 gap-6 mb-6">
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
        <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
          <TrendingUp className="h-6 w-6 text-green-500" />
        </div>
        <h3 className="text-3xl font-bold text-white mb-1">
          {formatGBP(moneyRecovered)}
        </h3>
        <p className="text-slate-400 text-sm">Money recovered</p>
      </div>

      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
        <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="h-6 w-6 text-blue-500" />
        </div>
        <h3 className="text-3xl font-bold text-white mb-1">
          {lettersWritten}
        </h3>
        <p className="text-slate-400 text-sm">Letters written</p>
      </div>

      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
        <div className="bg-purple-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-purple-500" />
        </div>
        <h3 className="text-3xl font-bold text-white mb-1">
          {activeDisputes}
        </h3>
        <p className="text-slate-400 text-sm">Active disputes</p>
      </div>
    </div>
  );
}

function ConnectedAccountsSection({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [bankConns, setBankConns] = useState<Array<{ id: string; bank_name: string | null; status: string; connected_at: string }>>([]);
  const [emailConns, setEmailConns] = useState<Array<{ id: string; email_address: string; provider_type: string; status: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      const [banks, emails] = await Promise.all([
        supabase.from('bank_connections').select('id, bank_name, status, connected_at').eq('user_id', user.id),
        supabase.from('email_connections').select('id, email_address, provider_type, status').eq('user_id', user.id),
      ]);
      setBankConns(banks.data || []);
      setEmailConns(emails.data || []);
      setLoaded(true);
    };
    load();
  }, [supabase]);

  const activeBanks = bankConns.filter(b => b.status === 'active');
  const activeEmails = emailConns.filter(e => e.status === 'active');

  return (
    <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
      <h2 className="text-xl font-bold text-white mb-6">Connected Accounts</h2>
      <div className="space-y-4">
        {/* Email */}
        <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-lg border border-navy-700/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
              <Mail className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Email</h3>
              <p className="text-sm text-slate-400">
                {activeEmails.length > 0 ? activeEmails.map(e => e.email_address).join(', ') : 'Scan emails for bills and subscriptions'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeEmails.length > 0 ? (
              <span className="text-sm text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </span>
            ) : (
              <a href="/dashboard/scanner" className="text-sm text-mint-400 bg-mint-400/10 px-3 py-1 rounded-full border border-mint-400/30 hover:bg-mint-400/20 transition-all">
                Connect
              </a>
            )}
          </div>
        </div>

        {/* Bank */}
        <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-lg border border-navy-700/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Bank Account</h3>
              <p className="text-sm text-slate-400">
                {activeBanks.length > 0 ? activeBanks.map(b => b.bank_name || 'Bank Account').join(', ') : 'Automatic transaction categorisation'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeBanks.length > 0 ? (
              <span className="text-sm text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected ({activeBanks.length})
              </span>
            ) : (
              <a href="/dashboard/subscriptions" className="text-sm text-mint-400 bg-mint-400/10 px-3 py-1 rounded-full border border-mint-400/30 hover:bg-mint-400/20 transition-all">
                Connect
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    postcode: '',
  });
  const [pendingChange, setPendingChange] = useState<{ type: string; tier?: string; date: string } | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AnnualReportData | OnDemandReportData | null>(null);
  const [reportType, setReportType] = useState<'annual' | 'on_demand' | 'sample'>('sample');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<Array<{ id: string; report_type: string; year: number; month: number | null; created_at: string }>>([]);
  const [showReport, setShowReport] = useState(false);
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
              first_name: data.first_name,
              last_name: data.last_name,
              phone: data.phone,
              address: data.address,
              postcode: data.postcode,
              subscription_status: data.subscription_status,
              subscription_tier: data.subscription_tier,
              stripe_subscription_id: data.stripe_subscription_id,
              total_money_recovered: data.total_money_recovered || 0,
              total_tasks_completed: data.total_tasks_completed || 0,
              total_agents_run: data.total_agents_run || 0,
              created_at: data.created_at,
              trial_ends_at: data.trial_ends_at || null,
              founding_member: data.founding_member || false,
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

  const startEditing = () => {
    setEditForm({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      postcode: profile?.postcode || '',
    });
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fullName = [editForm.first_name, editForm.last_name].filter(Boolean).join(' ');

      await supabase.from('profiles').update({
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        full_name: fullName || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
        postcode: editForm.postcode?.toUpperCase().trim() || null,
      }).eq('id', user.id);

      setProfile(prev => prev ? {
        ...prev,
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        full_name: fullName || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
        postcode: editForm.postcode?.toUpperCase().trim() || null,
      } : null);

      setEditing(false);
      setSaveMessage('Profile updated');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

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

  const fetchSavedReports = async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.reports) setSavedReports(data.reports);
    } catch {
      // Silently fail
    }
  };

  const handleGenerateReport = async (type: 'annual' | 'on_demand') => {
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, year: new Date().getFullYear() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportError(data.error || 'Failed to generate report');
        return;
      }
      setReportData(data.data);
      setReportType(type);
      setShowReport(true);
      if (type === 'annual') fetchSavedReports();
    } catch {
      setReportError('Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch saved reports for Pro users
  useEffect(() => {
    const isPro = profile?.subscription_tier &&
      profile.subscription_tier === 'pro' &&
      ['active', 'trialing'].includes(profile?.subscription_status ?? '');
    if (profile && isPro) {
      fetchSavedReports();
    }
  }, [profile]);

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

      {/* Personal Details */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-mint-400" />
            Personal Details
          </h2>
          {!editing && (
            <button onClick={startEditing} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-all">
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>

        {saveMessage && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {saveMessage}
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">First name</label>
                <input
                  type="text"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Last name</label>
                <input
                  type="text"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone number</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm"
                placeholder="07xxx xxxxxx"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
              <input
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-4 py-2.5 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm"
                placeholder="House number, street, city"
              />
            </div>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Postcode</label>
              <input
                type="text"
                value={editForm.postcode}
                onChange={(e) => setEditForm({ ...editForm, postcode: e.target.value })}
                className="w-full px-4 py-2.5 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm uppercase"
                placeholder="SW1A 1AA"
                maxLength={8}
              />
            </div>

            <p className="text-xs text-slate-500">Your address is used to auto-fill complaint letters. We never share your personal details.</p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditing(false)}
                className="px-5 py-2.5 bg-navy-800 hover:bg-navy-700 text-white rounded-xl transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-xl transition-all text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Name</p>
              <p className="text-white text-sm">{profile?.full_name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Phone</p>
              <p className="text-white text-sm">{profile?.phone || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Address</p>
              <p className="text-white text-sm">{profile?.address || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Postcode</p>
              <p className="text-white text-sm">{profile?.postcode || 'Not set'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Profile Completeness */}
      {(() => {
        const fields = [
          { label: 'Name', filled: !!profile?.full_name },
          { label: 'Phone', filled: !!profile?.phone },
          { label: 'Address', filled: !!profile?.address },
          { label: 'Postcode', filled: !!profile?.postcode },
        ];
        const filledCount = fields.filter(f => f.filled).length;
        const percent = Math.round((filledCount / fields.length) * 100);
        if (percent === 100) return null;
        return (
          <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Profile {percent}% complete</p>
              <p className="text-xs text-slate-500">{filledCount}/{fields.length} fields</p>
            </div>
            <div className="w-full bg-navy-800 rounded-full h-2 mb-3">
              <div
                className="bg-gradient-to-r from-mint-400 to-mint-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Complete your profile to auto-fill complaint letters.
              {!profile?.full_name && ' Add your name.'}
              {!profile?.phone && ' Add your phone number.'}
              {!profile?.address && ' Add your address.'}
              {!profile?.postcode && ' Add your postcode.'}
            </p>
            {!editing && (
              <button onClick={startEditing} className="mt-2 text-xs text-mint-400 hover:text-mint-300 font-medium transition-all">
                Complete profile
              </button>
            )}
          </div>
        );
      })()}

      {/* Stats */}
      <ProfileStatsSection supabase={supabase} fallbackRecovered={profile?.total_money_recovered || 0} />

      {/* Your Plan */}
      {(() => {
        const isTrialUser = profile?.subscription_status === 'trialing' && !profile?.stripe_subscription_id && effectiveTier !== 'free';
        const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
        const trialDays = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

        return (
          <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-mint-400" />
              Your Plan
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full ${
                  isTrialUser ? 'bg-amber-400/10 text-amber-400' :
                  effectiveTier === 'pro' ? 'bg-brand-400/10 text-brand-400' :
                  effectiveTier === 'essential' ? 'bg-mint-400/10 text-mint-400' :
                  'bg-slate-400/10 text-slate-400'
                }`}>
                  {isTrialUser ? 'Pro Trial' : effectiveTier === 'pro' ? 'Pro' : effectiveTier === 'essential' ? 'Essential' : 'Free'}
                </span>
                <p className="text-slate-400 text-sm mt-2">
                  {isTrialUser
                    ? `Free for 14 days${trialDays !== null ? ` — ${trialDays} days left on your free trial` : ''}`
                    : effectiveTier === 'free'
                    ? '3 letters/month, one-time scans. Upgrade for unlimited access.'
                    : effectiveTier === 'essential'
                    ? 'Unlimited letters, daily bank sync, full spending dashboard.'
                    : 'Everything in Essential plus unlimited bank accounts and priority support.'}
                </p>
              </div>
              {isTrialUser ? (
                <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap">
                  Subscribe to keep Pro
                </Link>
              ) : effectiveTier === 'free' ? (
                <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap">
                  Upgrade Plan
                </Link>
              ) : (
                <button onClick={handleManageBilling} disabled={portalLoading} className="bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap">
                  {portalLoading ? 'Loading...' : 'Manage Billing'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Connected Accounts */}
      <ConnectedAccountsSection supabase={supabase} />

      {/* Financial Reports */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-8 mb-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-mint-400" />
          Financial Reports
        </h2>

        {effectiveTier === 'pro' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleGenerateReport('annual')}
                disabled={reportLoading}
                className="flex items-center gap-2 bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {reportLoading ? 'Generating...' : 'Generate Annual Report'}
              </button>
              <button
                onClick={() => handleGenerateReport('on_demand')}
                disabled={reportLoading}
                className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                Quick Summary
              </button>
            </div>

            {reportError && (
              <p className="text-sm text-red-400">{reportError}</p>
            )}

            {/* Saved reports list */}
            {savedReports.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Saved Reports</h3>
                <div className="space-y-2">
                  {savedReports.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-mint-400" />
                        <div>
                          <p className="text-white text-sm font-medium capitalize">
                            {r.report_type === 'annual' ? `${r.year} Annual Report` : 'Summary Report'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(r.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report display */}
            {showReport && reportData && (
              <div className="mt-4 pt-4 border-t border-navy-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    {reportType === 'annual' ? 'Annual Report' : 'Financial Summary'}
                  </h3>
                  <button
                    onClick={() => setShowReport(false)}
                    className="text-sm text-slate-400 hover:text-white transition-all"
                  >
                    Close
                  </button>
                </div>
                <FinancialReport data={reportData} type={reportType} />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-sm mb-4">
              {effectiveTier === 'essential'
                ? 'Upgrade to Pro to unlock personalised annual financial reports with PDF download.'
                : 'Pro users get personalised annual financial reports with spending analysis, savings tracking, and PDF download.'}
            </p>
            <FinancialReport type="sample" />
          </div>
        )}
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
      {/* Pocket Agent */}
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-8 mt-6">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Mail className="h-5 w-5 text-amber-500" />
          Pocket Agent
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Connect your Paybacker account to Pocket Agent for proactive alerts, spending queries, and complaint letters — all from your phone.
        </p>
        <Link
          href="/dashboard/pocket-agent"
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-sm font-medium transition-colors"
        >
          Set Up Pocket Agent
        </Link>
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
