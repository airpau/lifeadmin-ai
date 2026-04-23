'use client';

/**
 * /dashboard/admin/analytics
 *
 * Platform-wide aggregate analytics across every Paybacker user.
 * Shows spending patterns, income mix, supplier concentration, deals
 * coming up, dispute success rate, subscription distribution, price
 * hike pressure, retention, feature adoption, health-score spread
 * and AI-usage cost.
 *
 * Privacy: the API suppresses any segment with fewer than 2 users
 * (MIN_SEGMENT_SIZE). We never render individual user data here —
 * just aggregates.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, RefreshCw, Users, TrendingDown, TrendingUp,
  Receipt, Wallet, Calendar, Scale, Layers, AlertTriangle,
  Plug, Sparkles, HeartPulse, Bot,
} from 'lucide-react';

type TierCounts = Record<string, number>;

interface Analytics {
  generated_at: string;
  privacy_note: string;
  this_month: string;
  last_month: string;
  user_counts: {
    total: number;
    by_tier: TierCounts;
    new_signups_this_month: number;
    active_last_7d: number;
    active_last_30d: number;
  };
  platform_money_flow: {
    spend_this_month: number;
    income_this_month: number;
    spend_last_month: number;
    spend_mom_pct: number;
    avg_spend_per_active_user: number;
    avg_income_per_active_user: number;
    total_transactions_this_month: number;
    users_with_spending_this_month: number;
  };
  top_spending_categories: Array<{
    category: string;
    total: number;
    user_count: number;
    avg_per_user: number;
    pct_of_total: number;
  }>;
  top_merchants: Array<{
    merchant: string;
    total: number;
    user_count: number;
    avg_per_user: number;
  }>;
  income_mix: Array<{
    type: string;
    total: number;
    user_count: number;
    avg_per_user: number;
  }>;
  deals_pipeline: {
    contracts_ending_7d: number;
    contracts_ending_14d: number;
    contracts_ending_30d: number;
    potential_annual_saving_across_all_users: number;
  };
  disputes: {
    total_open: number;
    total_resolved: number;
    total_won: number;
    success_pct: number;
    avg_days_to_resolve: number;
    total_under_dispute: number;
    total_recovered: number;
    top_providers_disputed: Array<{ provider: string; count: number }>;
  };
  subscriptions: {
    total_tracked: number;
    users_with_subs: number;
    avg_subs_per_user: number;
    total_monthly_sub_spend: number;
    top_providers: Array<{ provider: string; user_count: number; avg_monthly: number }>;
  };
  price_increases: {
    active_alerts: number;
    users_affected: number;
    total_extra_spend_pa: number;
    avg_hike_amount: number;
  };
  retention: {
    users_with_active_bank: number;
    users_with_active_email: number;
    users_with_telegram: number;
    expired_bank_consents: number;
    email_needs_reauth: number;
    users_with_spending_this_month: number;
  };
  feature_adoption: {
    connected_bank: number;
    connected_email: number;
    wrote_letter_ever: number;
    tracked_subscription: number;
    created_dispute: number;
    used_telegram: number;
    created_category_override: number;
  };
  health_scores: {
    avg: number;
    distribution: { excellent: number; good: number; fair: number; poor: number };
  };
  ai_usage: {
    runs_this_month: number;
    cost_this_month_gbp: number;
    runs_by_agent: Record<string, number>;
  };
}

function gbp(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n > 0 ? '+' : ''}${Math.round(n)}%`;
}

function labelise(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as Analytics;
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tiers = data.user_counts.by_tier;
  const topCatTotal = data.top_spending_categories.reduce((s, c) => s + c.total, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link href="/dashboard/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to admin
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Platform Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Generated {new Date(data.generated_at).toLocaleString('en-GB')} · {data.privacy_note}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm text-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ─ USERS ─────────────────────────────────────────────────────── */}
      <Section icon={Users} title="Users" subtitle="Who's on the platform">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total users" value={data.user_counts.total} />
          <Stat label="New this month" value={data.user_counts.new_signups_this_month} tone="mint" />
          <Stat label="Active last 7d" value={data.user_counts.active_last_7d} />
          <Stat label="Active last 30d" value={data.user_counts.active_last_30d} />
          <Stat label="By tier" value={`F:${tiers.free ?? 0} · E:${tiers.essential ?? 0} · P:${tiers.pro ?? 0}`} />
        </div>
      </Section>

      {/* ─ MONEY FLOW ───────────────────────────────────────────────── */}
      <Section icon={Wallet} title="Platform money flow" subtitle={`This month (${data.this_month}) vs last`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Spend this month" value={gbp(data.platform_money_flow.spend_this_month)} />
          <Stat label="Spend last month" value={gbp(data.platform_money_flow.spend_last_month)} />
          <Stat
            label="MoM change"
            value={pct(data.platform_money_flow.spend_mom_pct)}
            tone={data.platform_money_flow.spend_mom_pct > 0 ? 'red' : 'mint'}
            icon={data.platform_money_flow.spend_mom_pct > 0 ? TrendingUp : TrendingDown}
          />
          <Stat label="Income this month" value={gbp(data.platform_money_flow.income_this_month)} tone="mint" />
          <Stat label="Avg spend / active user" value={gbp(data.platform_money_flow.avg_spend_per_active_user)} />
          <Stat label="Avg income / active user" value={gbp(data.platform_money_flow.avg_income_per_active_user)} />
          <Stat label="Transactions this month" value={data.platform_money_flow.total_transactions_this_month.toLocaleString('en-GB')} />
          <Stat label="Users with spending" value={data.platform_money_flow.users_with_spending_this_month} />
        </div>
      </Section>

      {/* ─ TOP CATEGORIES ───────────────────────────────────────────── */}
      <Section icon={Layers} title="Top spending categories" subtitle="Where the platform is spending this month">
        {data.top_spending_categories.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            columns={['Category', 'Total', '% of total', 'Users', 'Avg / user']}
            rows={data.top_spending_categories.map((c) => [
              labelise(c.category),
              gbp(c.total),
              `${c.pct_of_total}%`,
              String(c.user_count),
              gbp(c.avg_per_user),
            ])}
            bars={data.top_spending_categories.map((c) => (topCatTotal > 0 ? c.total / topCatTotal : 0))}
          />
        )}
      </Section>

      {/* ─ TOP MERCHANTS ────────────────────────────────────────────── */}
      <Section icon={Receipt} title="Top merchants" subtitle="Merchants with the highest platform-wide spend this month">
        {data.top_merchants.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            columns={['Merchant', 'Total', 'Users', 'Avg / user']}
            rows={data.top_merchants.map((m) => [
              m.merchant,
              gbp(m.total),
              String(m.user_count),
              gbp(m.avg_per_user),
            ])}
          />
        )}
      </Section>

      {/* ─ INCOME MIX ───────────────────────────────────────────────── */}
      <Section icon={TrendingUp} title="Income mix" subtitle="What kinds of money are landing in accounts this month">
        {data.income_mix.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            columns={['Type', 'Total', 'Users', 'Avg / user']}
            rows={data.income_mix.map((i) => [
              labelise(i.type),
              gbp(i.total),
              String(i.user_count),
              gbp(i.avg_per_user),
            ])}
          />
        )}
      </Section>

      {/* ─ DEALS PIPELINE ───────────────────────────────────────────── */}
      <Section icon={Calendar} title="Deals pipeline" subtitle="Contracts ending soon — the Paybacker switching opportunity">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Ending in 7d" value={data.deals_pipeline.contracts_ending_7d} tone="amber" />
          <Stat label="Ending in 14d" value={data.deals_pipeline.contracts_ending_14d} />
          <Stat label="Ending in 30d" value={data.deals_pipeline.contracts_ending_30d} />
          <Stat
            label="Potential saving p.a. (20%)"
            value={gbp(data.deals_pipeline.potential_annual_saving_across_all_users)}
            tone="mint"
          />
        </div>
      </Section>

      {/* ─ DISPUTES ─────────────────────────────────────────────────── */}
      <Section icon={Scale} title="Disputes" subtitle="How the complaint engine is performing">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Open" value={data.disputes.total_open} tone="amber" />
          <Stat label="Resolved" value={data.disputes.total_resolved} />
          <Stat label="Won / partial" value={data.disputes.total_won} tone="mint" />
          <Stat label="Success %" value={`${data.disputes.success_pct}%`} tone="mint" />
          <Stat label="Avg days to resolve" value={data.disputes.avg_days_to_resolve} />
          <Stat label="Under dispute" value={gbp(data.disputes.total_under_dispute)} />
          <Stat label="Recovered" value={gbp(data.disputes.total_recovered)} tone="mint" />
        </div>
        {data.disputes.top_providers_disputed.length > 0 && (
          <DataTable
            columns={['Most-disputed provider', 'Disputes']}
            rows={data.disputes.top_providers_disputed.map((p) => [p.provider, String(p.count)])}
          />
        )}
      </Section>

      {/* ─ SUBSCRIPTIONS ────────────────────────────────────────────── */}
      <Section icon={Receipt} title="Subscriptions" subtitle="Recurring commitments users are tracking">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Total tracked" value={data.subscriptions.total_tracked} />
          <Stat label="Users with subs" value={data.subscriptions.users_with_subs} />
          <Stat label="Avg subs / user" value={data.subscriptions.avg_subs_per_user} />
          <Stat label="Monthly sub spend" value={gbp(data.subscriptions.total_monthly_sub_spend)} />
        </div>
        {data.subscriptions.top_providers.length > 0 && (
          <DataTable
            columns={['Top providers', 'Users', 'Avg £/month']}
            rows={data.subscriptions.top_providers.map((p) => [
              p.provider,
              String(p.user_count),
              gbp(p.avg_monthly),
            ])}
          />
        )}
      </Section>

      {/* ─ PRICE INCREASES ──────────────────────────────────────────── */}
      <Section icon={AlertTriangle} title="Price increases" subtitle="Hikes detected across the platform">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Active alerts" value={data.price_increases.active_alerts} tone="amber" />
          <Stat label="Users affected" value={data.price_increases.users_affected} />
          <Stat label="Extra spend p.a." value={gbp(data.price_increases.total_extra_spend_pa)} tone="red" />
          <Stat label="Avg hike" value={gbp(data.price_increases.avg_hike_amount)} />
        </div>
      </Section>

      {/* ─ RETENTION & CONNECTIONS ─────────────────────────────────── */}
      <Section icon={Plug} title="Retention & connections" subtitle="Who's still plugged in">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Active bank" value={data.retention.users_with_active_bank} />
          <Stat label="Active email" value={data.retention.users_with_active_email} />
          <Stat label="Telegram users" value={data.retention.users_with_telegram} />
          <Stat label="Expired bank consents" value={data.retention.expired_bank_consents} tone="amber" />
          <Stat label="Email needs reauth" value={data.retention.email_needs_reauth} tone="amber" />
          <Stat label="Users spending this month" value={data.retention.users_with_spending_this_month} />
        </div>
      </Section>

      {/* ─ FEATURE ADOPTION ─────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Feature adoption" subtitle="Distinct users who've used each feature">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Connected bank" value={data.feature_adoption.connected_bank} />
          <Stat label="Connected email" value={data.feature_adoption.connected_email} />
          <Stat label="Wrote a letter" value={data.feature_adoption.wrote_letter_ever} />
          <Stat label="Tracked sub" value={data.feature_adoption.tracked_subscription} />
          <Stat label="Created dispute" value={data.feature_adoption.created_dispute} />
          <Stat label="Used Telegram" value={data.feature_adoption.used_telegram} />
          <Stat label="Recategorised txns" value={data.feature_adoption.created_category_override} />
        </div>
      </Section>

      {/* ─ HEALTH SCORES ────────────────────────────────────────────── */}
      <Section icon={HeartPulse} title="Financial health scores" subtitle="User-level 0-100 composite score distribution">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Avg score" value={data.health_scores.avg} />
          <Stat label="Excellent (80+)" value={data.health_scores.distribution.excellent} tone="mint" />
          <Stat label="Good (60-79)" value={data.health_scores.distribution.good} />
          <Stat label="Fair (40-59)" value={data.health_scores.distribution.fair} tone="amber" />
          <Stat label="Poor (<40)" value={data.health_scores.distribution.poor} tone="red" />
        </div>
      </Section>

      {/* ─ AI USAGE ─────────────────────────────────────────────────── */}
      <Section icon={Bot} title="AI usage" subtitle="Agent runs and cost this month">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Stat label="Runs this month" value={data.ai_usage.runs_this_month} />
          <Stat label="Cost this month" value={gbp(data.ai_usage.cost_this_month_gbp)} />
          <Stat label="Unique agents" value={Object.keys(data.ai_usage.runs_by_agent).length} />
        </div>
        {Object.keys(data.ai_usage.runs_by_agent).length > 0 && (
          <DataTable
            columns={['Agent', 'Runs']}
            rows={Object.entries(data.ai_usage.runs_by_agent)
              .sort(([, a], [, b]) => b - a)
              .map(([agent, count]) => [agent, String(count)])}
          />
        )}
      </Section>
    </div>
  );
}

/* ── Shared building blocks ─────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'mint' | 'amber' | 'red';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneCls =
    tone === 'mint' ? 'border-emerald-200 bg-emerald-50' :
    tone === 'amber' ? 'border-amber-200 bg-amber-50' :
    tone === 'red' ? 'border-red-200 bg-red-50' :
    'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border ${toneCls} p-4`}>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-xl font-bold text-slate-900 break-words">{value}</p>
    </div>
  );
}

function DataTable({
  columns,
  rows,
  bars,
}: {
  columns: string[];
  rows: string[][];
  bars?: number[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-slate-800 relative">
                  {j === 0 && bars?.[i] != null ? (
                    <div className="relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-100 rounded"
                        style={{ width: `${Math.max(2, Math.round(bars[i] * 100))}%` }}
                      />
                      <span className="relative">{cell}</span>
                    </div>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return (
    <p className="text-sm text-slate-500 italic">
      No data yet (segments with &lt;2 users are suppressed for privacy).
    </p>
  );
}
