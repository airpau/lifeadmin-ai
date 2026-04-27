'use client';

/**
 * /dashboard/action-centre
 *
 * Single launchpad that consolidates everything Paybacker has spotted that
 * is worth the user's attention:
 *
 *   1. Disputes in progress — open complaints with their latest activity
 *      so the user knows replies have arrived / a follow-up is due.
 *   2. Subscriptions needing attention — contracts ending in <=30d,
 *      renewals due in <=14d, and items the bank scan flagged as
 *      `needs_review`.
 *   3. Price increase alerts — direct debits that have silently gone up,
 *      detected from bank transactions.
 *   4. Cheaper alternatives — top matched switch-deals from
 *      /api/subscriptions/compare, with a CTA out to /dashboard/deals
 *      for the full catalogue.
 *
 * Replaces the inline "Action Centre" block on /dashboard so the same
 * data isn't duplicated across two surfaces. The Deals page stays as a
 * browse-all catalogue reachable from this page and the sidebar.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, AlertTriangle, FileText, CreditCard, Tag, Mail,
  Loader2, ArrowRight, Clock, RefreshCw, MessageCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import PriceIncreaseCard from '@/components/alerts/PriceIncreaseCard';
import { isDealValid } from '@/lib/savings-utils';

// ─── Types ──────────────────────────────────────────────────────────────

interface Dispute {
  id: string;
  provider_name: string;
  issue_type: string;
  issue_summary: string;
  status: string;
  disputed_amount: number | null;
  money_recovered: number | null;
  last_activity: string | null;
  latest_snippet: string | null;
  message_count: number;
  letter_count: number;
}

interface SubscriptionAttn {
  id: string;
  provider_name: string;
  amount: number;
  billing_cycle: string | null;
  category: string | null;
  next_billing_date: string | null;
  contract_end_date: string | null;
  needs_review: boolean | null;
  reason: 'contract_ending' | 'renewal_due' | 'needs_review';
  daysUntil: number | null;
}

interface PriceAlert {
  id: string;
  merchant_name: string;
  merchant_normalized: string;
  old_amount: number;
  new_amount: number;
  increase_pct: number;
  annual_impact: number;
  old_date: string;
  new_date: string;
  status: string;
}

interface CheaperAlt {
  subscriptionName: string;
  currentPrice: number;
  dealProvider: string;
  dealPrice: number;
  annualSaving: number;
  dealUrl: string;
  category: string;
}

// Resolved-status set mirrors /api/disputes/summary so we don't drift.
const RESOLVED_DISPUTE_STATUSES = new Set([
  'resolved_won', 'resolved_partial', 'resolved_lost',
  'closed', 'won', 'partial', 'lost', 'withdrawn',
]);

function fmtGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function ActionCentrePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [subsAttn, setSubsAttn] = useState<SubscriptionAttn[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [cheaperAlts, setCheaperAlts] = useState<CheaperAlt[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [disputesRes, subsRes, alertsRes, dealsRes] = await Promise.all([
        fetch('/api/disputes', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
        supabase.from('subscriptions').select('id, provider_name, amount, billing_cycle, category, next_billing_date, contract_end_date, needs_review').eq('user_id', user.id).eq('status', 'active'),
        fetch('/api/price-alerts', { credentials: 'include' }).then(r => r.ok ? r.json() : { alerts: [] }).catch(() => ({ alerts: [] })),
        fetch('/api/subscriptions/compare?all=1').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (cancelled) return;

      // ── Disputes: keep open ones, sort by most recent activity ──
      const openDisputes = (Array.isArray(disputesRes) ? disputesRes : [])
        .filter((d: any) => !RESOLVED_DISPUTE_STATUSES.has(d.status))
        .sort((a: any, b: any) => new Date(b.last_activity || 0).getTime() - new Date(a.last_activity || 0).getTime())
        .slice(0, 5);
      setDisputes(openDisputes as Dispute[]);

      // ── Subscriptions needing attention ──
      const subRows = (subsRes.data as any[]) || [];
      const flagged: SubscriptionAttn[] = [];
      for (const s of subRows) {
        const endDays = daysFromNow(s.contract_end_date);
        const renewDays = daysFromNow(s.next_billing_date);
        if (s.needs_review) {
          flagged.push({ ...s, reason: 'needs_review', daysUntil: null });
        } else if (endDays != null && endDays >= 0 && endDays <= 30) {
          flagged.push({ ...s, reason: 'contract_ending', daysUntil: endDays });
        } else if (renewDays != null && renewDays >= 0 && renewDays <= 14) {
          flagged.push({ ...s, reason: 'renewal_due', daysUntil: renewDays });
        }
      }
      // Most urgent first: smaller daysUntil = more urgent. needs_review pinned to top.
      flagged.sort((a, b) => {
        if (a.reason === 'needs_review' && b.reason !== 'needs_review') return -1;
        if (b.reason === 'needs_review' && a.reason !== 'needs_review') return 1;
        const aDays = a.daysUntil ?? 999;
        const bDays = b.daysUntil ?? 999;
        return aDays - bDays;
      });
      setSubsAttn(flagged.slice(0, 5));

      // ── Price alerts ──
      setPriceAlerts(alertsRes?.alerts ?? []);

      // ── Cheaper alternatives: top 3 by annual saving ──
      const dealsList: CheaperAlt[] = [];
      const compared = dealsRes?.comparedSubscriptions || dealsRes?.subscriptions || [];
      for (const sub of compared) {
        const best = sub.bestDeal || sub.deals?.[0];
        if (!best) continue;
        const saving = Number(best.annualSaving ?? best.annual_saving ?? 0);
        if (!Number.isFinite(saving) || saving <= 0) continue;
        const candidate = {
          subscriptionName: sub.subscriptionName || sub.providerName || sub.provider_name || 'Subscription',
          currentPrice: Number(sub.currentPrice ?? sub.amount ?? 0),
          dealProvider: best.provider || best.dealProvider || 'Provider',
          dealPrice: Number(best.price ?? best.dealPrice ?? 0),
          annualSaving: saving,
          dealUrl: best.url || best.dealUrl || '/dashboard/deals',
          category: sub.category || best.category || '',
        };
        if (isDealValid(candidate)) dealsList.push(candidate);
      }
      dealsList.sort((a, b) => b.annualSaving - a.annualSaving);
      setCheaperAlts(dealsList.slice(0, 3));

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const totalCount = disputes.length + subsAttn.length + priceAlerts.length + cheaperAlts.length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-[family-name:var(--font-heading)]">
          <Sparkles className="h-6 w-6 text-mint-400" />
          Action Centre
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Everything Paybacker has spotted that's worth a few minutes of your time — disputes that need a follow-up, contracts about to renew, price increases on your bills, and cheaper alternatives we've matched to your subscriptions.
        </p>
      </div>

      {loading ? (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-mint-400 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Loading your action items…</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 text-center">
          <Sparkles className="h-8 w-8 text-mint-400 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">You're all caught up.</p>
          <p className="text-slate-400 text-sm">No open disputes, no subscriptions due soon, no price increases detected. Connect your bank or email if you haven't yet — that's where most actionable items come from.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Disputes In Progress ─────────────────────────────────── */}
          {disputes.length > 0 && (
            <Section
              icon={<FileText className="h-4 w-4 text-red-400" />}
              title={`Disputes In Progress (${disputes.length})`}
              subtitle="Open complaint letters and the latest reply we've seen on each."
              accent="red"
            >
              <div className="space-y-2">
                {disputes.map((d) => (
                  <Link
                    key={d.id}
                    href={`/dashboard/disputes/${d.id}`}
                    className="block bg-navy-950/50 hover:bg-navy-800 border border-navy-700/50 rounded-xl p-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white text-sm font-medium truncate">{d.provider_name}</span>
                          <span className="text-[10px] uppercase tracking-widest text-slate-400 bg-navy-800 px-1.5 py-0.5 rounded">{d.status.replace(/_/g, ' ')}</span>
                          {d.disputed_amount && d.disputed_amount > 0 && (
                            <span className="text-amber-400 text-xs font-medium">{fmtGBP(d.disputed_amount)} disputed</span>
                          )}
                        </div>
                        <p className="text-slate-300 text-xs line-clamp-2">
                          {d.latest_snippet || d.issue_summary}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{d.message_count} entries</span>
                          {d.last_activity && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(d.last_activity)}</span>}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/dashboard/disputes" className="inline-flex items-center gap-1 text-xs text-mint-400 hover:text-white mt-3">
                View all disputes <ArrowRight className="h-3 w-3" />
              </Link>
            </Section>
          )}

          {/* ── Subscriptions Needing Attention ──────────────────────── */}
          {subsAttn.length > 0 && (
            <Section
              icon={<CreditCard className="h-4 w-4 text-amber-400" />}
              title={`Subscriptions Needing Attention (${subsAttn.length})`}
              subtitle="Contracts ending soon, renewals about to charge, and items the bank scan flagged."
              accent="amber"
            >
              <div className="space-y-2">
                {subsAttn.map((s) => (
                  <Link
                    key={s.id}
                    href="/dashboard/subscriptions"
                    className="block bg-navy-950/50 hover:bg-navy-800 border border-navy-700/50 rounded-xl p-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white text-sm font-medium truncate">{s.provider_name}</span>
                          {s.amount && (
                            <span className="text-slate-400 text-xs">{fmtGBP(s.amount)}{s.billing_cycle ? `/${s.billing_cycle === 'monthly' ? 'mo' : s.billing_cycle === 'yearly' ? 'yr' : s.billing_cycle}` : ''}</span>
                          )}
                        </div>
                        <p className="text-amber-400 text-xs">
                          {s.reason === 'contract_ending' && `Contract ends in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'} — switch or renegotiate now`}
                          {s.reason === 'renewal_due' && `Renews in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'} — review before it auto-charges`}
                          {s.reason === 'needs_review' && `Bank scan flagged this — confirm it's a real subscription`}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/dashboard/subscriptions" className="inline-flex items-center gap-1 text-xs text-mint-400 hover:text-white mt-3">
                Manage all subscriptions <ArrowRight className="h-3 w-3" />
              </Link>
            </Section>
          )}

          {/* ── Price Increase Alerts ────────────────────────────────── */}
          {priceAlerts.length > 0 && (
            <Section
              icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
              title={`Price Increase Alerts (${priceAlerts.length})`}
              subtitle="Direct debits that have silently gone up, detected from your bank transactions."
              accent="red"
            >
              <div className="space-y-3">
                {priceAlerts.slice(0, 5).map((alert) => (
                  <PriceIncreaseCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={async (id) => {
                      await fetch('/api/price-alerts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'dismissed' }),
                      });
                      setPriceAlerts(prev => prev.filter(a => a.id !== id));
                    }}
                    onAction={async (id) => {
                      await fetch('/api/price-alerts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'actioned' }),
                      });
                      setPriceAlerts(prev => prev.filter(a => a.id !== id));
                    }}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* ── Cheaper Alternatives ─────────────────────────────────── */}
          {cheaperAlts.length > 0 && (
            <Section
              icon={<Tag className="h-4 w-4 text-mint-400" />}
              title="Cheaper Alternatives"
              subtitle="Switch deals matched to subscriptions you already have. Top picks shown — browse the full catalogue for more."
              accent="mint"
            >
              <div className="space-y-2">
                {cheaperAlts.map((d, i) => (
                  <a
                    key={i}
                    href={d.dealUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-navy-950/50 hover:bg-navy-800 border border-navy-700/50 rounded-xl p-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">
                          Switch <span className="text-slate-400">{d.subscriptionName}</span> → <span className="text-mint-400">{d.dealProvider}</span>
                        </p>
                        <p className="text-mint-400 text-xs mt-1">Save up to {fmtGBP(d.annualSaving)}/yr</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
              <Link href="/dashboard/deals" className="inline-flex items-center gap-1 text-xs text-mint-400 hover:text-white mt-3">
                Browse all deals <ArrowRight className="h-3 w-3" />
              </Link>
            </Section>
          )}
        </div>
      )}

      {/* Footer hint — keeps the page useful even when caught up */}
      <div className="mt-6 bg-navy-900/50 border border-navy-700/50 rounded-2xl p-4 text-center">
        <p className="text-slate-400 text-xs">
          New activity here is detected automatically from your bank scans, email scans and dispute Watchdog. Connect more accounts in <Link href="/dashboard/profile" className="text-mint-400 hover:text-white">Profile</Link> to see more.
        </p>
      </div>
    </div>
  );
}

// ─── Section card ───────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, accent, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: 'red' | 'amber' | 'mint' | 'purple';
  children: React.ReactNode;
}) {
  const accentBorder = {
    red: 'border-red-500/20',
    amber: 'border-amber-500/20',
    mint: 'border-mint-400/20',
    purple: 'border-purple-500/20',
  }[accent];
  return (
    <div className={`bg-navy-900 border ${accentBorder} rounded-2xl p-5`}>
      <div className="mb-3">
        <p className="text-white font-semibold text-sm flex items-center gap-2">
          {icon} {title}
        </p>
        <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
