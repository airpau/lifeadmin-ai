'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldAlert, Users, CreditCard, TrendingUp, BarChart3,
  Building2, FileText, Bot, Loader2, ChevronRight, ArrowLeft,
  Banknote, Clock, Mail, Database, Ticket, Brain,
} from 'lucide-react';
import TicketList from '@/components/admin/TicketList';
import AITeamPanel from '@/components/admin/AITeamPanel';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface Metrics {
  overview: Record<string, number>;
  revenue: { mrr: number; arr: number; paying_customers: number; free_users: number };
  tier_breakdown: Record<string, number>;
  recent_signups: Array<{ id: string; email: string; name: string; tier: string; status: string; joined: string }>;
}

interface Member {
  id: string;
  email: string;
  full_name: string;
  subscription_tier: string;
  subscription_status: string;
  created_at: string;
  total_money_recovered: number;
  total_tasks_completed: number;
  opportunity_score: number;
  subscriptions_tracked: number;
  tasks_created: number;
  bank_transactions: number;
}

interface MemberDetail {
  profile: any;
  stats: Record<string, number>;
  subscriptions: Array<{ provider: string; amount: number; category: string; cycle: string; source: string; status: string }>;
  tasks: Array<{ id: string; type: string; title: string; status: string; created_at: string }>;
  bank_connections: Array<{ id: string; status: string; bank_name: string; last_synced_at: string }>;
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'members' | 'tickets' | 'ai_team'>('overview');
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      // Fetch via admin API (uses service role, bypasses RLS)
      const cronSecret = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';
      const metricsRes = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${cronSecret}` },
      }).then(r => r.json());

      if (metricsRes.overview) {
        setMetrics(metricsRes);
      }

      setLoading(false);
    };
    load();
  }, [supabase]);

  const loadMembers = async () => {
    const cronSecret = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';
    const res = await fetch('/api/admin/members', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).then(r => r.json());

    if (res.members) {
      setMembers(res.members.map((m: any) => ({
        ...m,
        full_name: m.full_name || '',
        subscription_tier: m.subscription_tier || 'free',
        subscription_status: m.subscription_status || '',
        total_money_recovered: m.total_money_recovered || 0,
        total_tasks_completed: m.total_tasks_completed || 0,
        opportunity_score: m.opportunity_score || 0,
        subscriptions_tracked: m.subscriptions_tracked || 0,
        tasks_created: m.tasks_created || 0,
        bank_transactions: m.bank_transactions || 0,
      })));
    }
  };

  const loadMemberDetail = async (memberId: string) => {
    setSelectedMemberId(memberId);

    const cronSecret = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';
    const res = await fetch(`/api/admin/members?id=${memberId}`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).then(r => r.json());

    if (res.profile) {
      setSelectedMember(res);
      return;
    }

    // Fallback to client-side (shouldn't reach here)
    const [profile, subs, tasks, runs, banks, txCount] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).single(),
      supabase.from('subscriptions').select('*').eq('user_id', memberId).is('dismissed_at', null).order('amount', { ascending: false }),
      supabase.from('tasks').select('id, type, title, status, provider_name, disputed_amount, created_at').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_runs').select('id, agent_type, model_name, status, created_at, input_tokens, output_tokens, estimated_cost').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('bank_connections').select('id, status, bank_name, last_synced_at, connected_at').eq('user_id', memberId),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', memberId),
    ]);

    const subsList = subs.data || [];
    const monthlySpend = subsList.reduce((sum, s: any) => {
      const amt = parseFloat(s.amount) || 0;
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      if (s.billing_cycle === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

    const runsList = runs.data || [];
    // Use actual tracked cost if available, fall back to estimates
    const actualCost = runsList.reduce((sum: number, r: any) => sum + (parseFloat(r.estimated_cost) || 0), 0);
    const haikuCost = actualCost > 0 ? 0 : runsList.filter((r: any) => r.model_name?.includes('haiku')).length * 0.003;
    const sonnetCost = actualCost > 0 ? 0 : runsList.filter((r: any) => r.model_name?.includes('sonnet')).length * 0.02;
    const totalCost = actualCost > 0 ? actualCost : (haikuCost + sonnetCost);

    setSelectedMember({
      profile: profile.data,
      stats: {
        total_subscriptions: subsList.length,
        monthly_spend: parseFloat(monthlySpend.toFixed(2)),
        total_complaints: (tasks.data || []).filter((t: any) => t.type === 'complaint_letter').length,
        total_cancellation_emails: (tasks.data || []).filter((t: any) => t.type === 'cancellation_email').length,
        total_agent_runs: runsList.length,
        bank_transactions: txCount.count || 0,
        estimated_api_cost: parseFloat(totalCost.toFixed(4)),
      },
      subscriptions: subsList.map((s: any) => ({
        provider: s.provider_name,
        amount: s.amount,
        category: s.category,
        cycle: s.billing_cycle,
        source: s.source,
        status: s.status,
      })),
      tasks: tasks.data || [],
      bank_connections: banks.data || [],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <ShieldAlert className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400">Admin access only.</p>
        </div>
      </div>
    );
  }

  const tierColor = (tier: string) => {
    if (tier === 'pro') return 'text-purple-400 bg-purple-500/10';
    if (tier === 'essential') return 'text-amber-400 bg-amber-500/10';
    return 'text-slate-400 bg-slate-500/10';
  };

  return (
    <div className="max-w-7xl">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <ShieldAlert className="h-10 w-10 text-red-500" />
          Admin Dashboard
        </h1>
        <p className="text-slate-400">Business metrics and member management</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => { setTab('overview'); setSelectedMember(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'overview' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Overview
        </button>
        <button onClick={() => { setTab('members'); loadMembers(); setSelectedMember(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'members' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Members
        </button>
        <button onClick={() => { setTab('tickets'); setSelectedMember(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'tickets' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          <Ticket className="h-4 w-4" /> Tickets
        </button>
        <button onClick={() => { setTab('ai_team'); setSelectedMember(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'ai_team' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          <Brain className="h-4 w-4" /> AI Team
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && metrics && (
        <>
          {/* Revenue Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-900/50 border border-green-500/30 rounded-2xl p-5">
              <Banknote className="h-6 w-6 text-green-500 mb-2" />
              <p className="text-3xl font-bold text-white">£{metrics.revenue.mrr}</p>
              <p className="text-slate-400 text-sm">MRR</p>
            </div>
            <div className="bg-slate-900/50 border border-green-500/30 rounded-2xl p-5">
              <TrendingUp className="h-6 w-6 text-green-500 mb-2" />
              <p className="text-3xl font-bold text-white">£{metrics.revenue.arr}</p>
              <p className="text-slate-400 text-sm">ARR</p>
            </div>
            <div className="bg-slate-900/50 border border-amber-500/30 rounded-2xl p-5">
              <CreditCard className="h-6 w-6 text-amber-500 mb-2" />
              <p className="text-3xl font-bold text-white">{metrics.revenue.paying_customers}</p>
              <p className="text-slate-400 text-sm">Paying customers</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-5">
              <Users className="h-6 w-6 text-slate-400 mb-2" />
              <p className="text-3xl font-bold text-white">{metrics.revenue.free_users}</p>
              <p className="text-slate-400 text-sm">Free users</p>
            </div>
          </div>

          {/* Tier Breakdown */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 mb-6">
            <h3 className="text-white font-semibold mb-3">Plan Distribution</h3>
            <div className="flex gap-4">
              {Object.entries(metrics.tier_breakdown).map(([tier, count]) => (
                <div key={tier} className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${tierColor(tier)}`}>{tier}</span>
                  <span className="text-white font-bold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Users', value: metrics.overview.total_users, icon: Users, color: 'text-blue-500' },
              { label: 'Waitlist', value: metrics.overview.waitlist_signups, icon: Mail, color: 'text-amber-500' },
              { label: 'Subscriptions Tracked', value: metrics.overview.active_subscriptions, icon: CreditCard, color: 'text-green-500' },
              { label: 'Bank Connections', value: metrics.overview.bank_connections, icon: Building2, color: 'text-purple-500' },
              { label: 'Bank Transactions', value: metrics.overview.bank_transactions, icon: Database, color: 'text-cyan-500' },
              { label: 'Complaints Generated', value: metrics.overview.complaints_generated, icon: FileText, color: 'text-orange-500' },
              { label: 'AI Agent Runs', value: metrics.overview.agent_runs, icon: Bot, color: 'text-pink-500' },
              { label: 'Merchant Rules', value: metrics.overview.merchant_rules, icon: BarChart3, color: 'text-emerald-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <Icon className={`h-5 w-5 ${color} mb-2`} />
                <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
                <p className="text-slate-500 text-xs">{label}</p>
              </div>
            ))}
          </div>

          {/* Recent Signups */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Recent Signups</h3>
            <div className="space-y-2">
              {metrics.recent_signups.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-white text-sm font-medium">{u.name || u.email}</p>
                      <p className="text-slate-500 text-xs">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tierColor(u.tier)}`}>{u.tier}</span>
                    <span className="text-slate-500 text-xs">{new Date(u.joined).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MEMBERS TAB */}
      {tab === 'members' && !selectedMember && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">All Members ({members.length})</h3>
          <div className="space-y-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => loadMemberDetail(m.id)}
                className="w-full flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-3 border border-slate-800 hover:border-amber-500/50 transition-all text-left"
              >
                <div>
                  <p className="text-white text-sm font-medium">{m.full_name || m.email}</p>
                  <p className="text-slate-500 text-xs">{m.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  {m.opportunity_score > 0 && (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      m.opportunity_score >= 100 ? 'bg-red-500/20 text-red-400' :
                      m.opportunity_score >= 50 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      Score: {m.opportunity_score}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tierColor(m.subscription_tier)}`}>{m.subscription_tier}</span>
                  <span className="text-slate-500 text-xs">{new Date(m.created_at).toLocaleDateString('en-GB')}</span>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MEMBER DETAIL */}
      {tab === 'members' && selectedMember && (
        <div>
          <button onClick={() => setSelectedMember(null)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to members
          </button>

          {/* Profile Header */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedMember.profile?.full_name || selectedMember.profile?.email}</h2>
                <p className="text-slate-400">{selectedMember.profile?.email}</p>
                <p className="text-slate-500 text-xs mt-1">
                  Joined {new Date(selectedMember.profile?.created_at).toLocaleDateString('en-GB')} ·
                  Stripe: {selectedMember.profile?.stripe_customer_id || 'none'}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${tierColor(selectedMember.profile?.subscription_tier || 'free')}`}>
                {selectedMember.profile?.subscription_tier || 'free'}
              </span>
            </div>
          </div>

          {/* Member Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">£{selectedMember.stats.monthly_spend}</p>
              <p className="text-slate-500 text-xs">Monthly spend tracked</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{selectedMember.stats.total_subscriptions}</p>
              <p className="text-slate-500 text-xs">Subscriptions</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{selectedMember.stats.total_agent_runs}</p>
              <p className="text-slate-500 text-xs">AI agent runs</p>
            </div>
            <div className="bg-slate-900/50 border border-red-500/30 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">£{selectedMember.stats.estimated_api_cost}</p>
              <p className="text-slate-500 text-xs">Estimated API cost</p>
            </div>
          </div>

          {/* Bank Connections */}
          {selectedMember.bank_connections.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 mb-6">
              <h3 className="text-white font-semibold mb-3">Bank Connections</h3>
              {selectedMember.bank_connections.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2 border border-slate-800">
                  <span className="text-white text-sm">{b.bank_name || 'Unknown Bank'}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${b.status === 'active' ? 'text-green-400' : 'text-slate-500'}`}>{b.status}</span>
                    <span className="text-slate-500 text-xs">{selectedMember.stats.bank_transactions.toLocaleString()} transactions</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Subscriptions */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 mb-6">
            <h3 className="text-white font-semibold mb-3">Subscriptions ({selectedMember.subscriptions.length})</h3>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {selectedMember.subscriptions.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2 border border-slate-800 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-white">{s.provider}</span>
                    {s.category && <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{s.category}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium">£{parseFloat(String(s.amount)).toFixed(2)}</span>
                    <span className="text-slate-500 text-xs">{s.cycle}</span>
                    {s.source && <span className="text-xs text-slate-500">{s.source}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Task History */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-3">Task History ({selectedMember.tasks.length})</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {selectedMember.tasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2 border border-slate-800 text-sm">
                  <div>
                    <span className="text-white">{t.title}</span>
                    <span className="text-slate-500 text-xs ml-2">{t.type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${t.status === 'completed' ? 'text-green-400' : 'text-amber-400'}`}>{t.status}</span>
                    <span className="text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
              ))}
              {selectedMember.tasks.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">No tasks yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TICKETS TAB */}
      {tab === 'tickets' && <TicketList />}

      {/* AI TEAM TAB */}
      {tab === 'ai_team' && <AITeamPanel />}
    </div>
  );
}
