// src/app/api/admin/analytics/route.ts
//
// Admin-only aggregate analytics across every user in the platform.
//
// Philosophy: only aggregates leave the server — never individual
// user emails, names, or transaction details. Merchant names + tier
// counts are fine (already public / already coarse). Any segment with
// fewer than MIN_SEGMENT_SIZE users is suppressed in the response to
// stop de-anonymisation on very rare merchants or categories.
//
// Auth: signed-in admin (ADMIN_EMAIL). Uses service-role Supabase
// client to bypass RLS and query every user.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';
const MIN_SEGMENT_SIZE = 2; // Drop rows where fewer than N distinct users contribute

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const thisMonthStart = startOfMonth(now).toISOString();
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();
  const thirtyDaysAgo = isoDaysAgo(30);
  const sevenDaysAgo = isoDaysAgo(7);

  // ── Run every aggregation in parallel — one round trip each ────────
  const [
    profilesRes,
    txnsThisMonthRes,
    txnsLastMonthRes,
    bankConnsRes,
    emailConnsRes,
    subsRes,
    disputesRes,
    priceAlertsRes,
    telegramRes,
    tasksRes,
    contractsEndingRes,
    agentRunsRes,
    overridesCountRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('id, subscription_tier, subscription_status, created_at, last_active_at, health_score'),
    admin.from('bank_transactions')
      .select('user_id, amount, timestamp, category, user_category, income_type, merchant_name, description')
      .gte('timestamp', thisMonthStart)
      .limit(50000),
    admin.from('bank_transactions')
      .select('user_id, amount')
      .gte('timestamp', lastMonthStart)
      .lt('timestamp', thisMonthStart)
      .limit(50000),
    admin.from('bank_connections')
      .select('user_id, status, provider, bank_name, last_synced_at, consent_expires_at'),
    admin.from('email_connections')
      .select('user_id, status, provider_type'),
    admin.from('subscriptions')
      .select('user_id, provider_name, amount, billing_cycle, category, contract_end_date, status')
      .is('dismissed_at', null),
    admin.from('disputes')
      .select('user_id, provider_name, issue_type, status, disputed_amount, money_recovered, created_at, resolved_at'),
    admin.from('price_alerts')
      .select('user_id, amount_change, status')
      .is('dismissed_at', null),
    admin.from('telegram_sessions')
      .select('user_id, is_active'),
    admin.from('tasks')
      .select('user_id, type, status, created_at')
      .limit(50000),
    admin.from('subscriptions')
      .select('user_id, provider_name, contract_end_date, amount, billing_cycle')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', new Date().toISOString().slice(0, 10))
      .lte('contract_end_date', new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)),
    admin.from('agent_runs')
      .select('user_id, agent_type, estimated_cost, created_at')
      .gte('created_at', thisMonthStart),
    admin.from('money_hub_category_overrides')
      .select('id', { count: 'exact', head: true }),
  ]);

  const profiles = profilesRes.data ?? [];
  const txnsThisMonth = txnsThisMonthRes.data ?? [];
  const txnsLastMonth = txnsLastMonthRes.data ?? [];
  const bankConns = bankConnsRes.data ?? [];
  const emailConns = emailConnsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const disputes = disputesRes.data ?? [];
  const priceAlerts = priceAlertsRes.data ?? [];
  const telegramSessions = telegramRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const contractsEnding = contractsEndingRes.data ?? [];
  const agentRuns = agentRunsRes.data ?? [];
  const overrideCount = overridesCountRes.count ?? 0;

  // ── User counts & tiers ──────────────────────────────────────────
  const totalUsers = profiles.length;
  const tierCounts: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of profiles) {
    const t = (p.subscription_tier || 'free').toLowerCase();
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }
  const newSignupsThisMonth = profiles.filter(
    (p) => p.created_at && p.created_at >= thisMonthStart,
  ).length;
  const activeLast7d = profiles.filter(
    (p) => p.last_active_at && p.last_active_at >= sevenDaysAgo,
  ).length;
  const activeLast30d = profiles.filter(
    (p) => p.last_active_at && p.last_active_at >= thirtyDaysAgo,
  ).length;

  // ── Money flowing through platform ───────────────────────────────
  const thisMonthSpend = txnsThisMonth
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const thisMonthIncome = txnsThisMonth
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const lastMonthSpend = txnsLastMonth
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const spendMomPct = lastMonthSpend > 0
    ? Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100)
    : 0;
  const activeBankUserIds = new Set(bankConns.filter((c) => c.status === 'active').map((c) => c.user_id));
  const spendingUsers = new Set(txnsThisMonth.map((t) => t.user_id));
  const avgSpendPerActiveUser = activeBankUserIds.size > 0
    ? thisMonthSpend / activeBankUserIds.size
    : 0;
  const avgIncomePerActiveUser = activeBankUserIds.size > 0
    ? thisMonthIncome / activeBankUserIds.size
    : 0;

  // ── Top spending categories ──────────────────────────────────────
  const categoryTotals = new Map<string, { total: number; users: Set<string> }>();
  for (const t of txnsThisMonth) {
    if (Number(t.amount) >= 0) continue;
    const raw = (t.user_category || t.category || 'other').toLowerCase();
    const key = raw === 'purchase' || raw === 'direct_debit' || raw === 'bill_payment' ? 'other' : raw;
    const bucket = categoryTotals.get(key) ?? { total: 0, users: new Set() };
    bucket.total += Math.abs(Number(t.amount));
    bucket.users.add(t.user_id);
    categoryTotals.set(key, bucket);
  }
  const totalSpendingAllCats = [...categoryTotals.values()].reduce((s, b) => s + b.total, 0);
  const topCategories = [...categoryTotals.entries()]
    .filter(([, b]) => b.users.size >= MIN_SEGMENT_SIZE)
    .map(([cat, b]) => ({
      category: cat,
      total: Math.round(b.total),
      user_count: b.users.size,
      avg_per_user: Math.round(b.total / b.users.size),
      pct_of_total: totalSpendingAllCats > 0 ? Math.round((b.total / totalSpendingAllCats) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // ── Top merchants ────────────────────────────────────────────────
  const merchantTotals = new Map<string, { total: number; users: Set<string> }>();
  for (const t of txnsThisMonth) {
    if (Number(t.amount) >= 0) continue;
    const raw = (t.merchant_name || t.description || 'unknown').toString().trim();
    // Skip junk 2-letter fragments (see merchant-utils isGarbageMerchantName)
    const cleaned = raw.length <= 3 && raw === raw.toLowerCase() && /^[a-z]+$/.test(raw)
      ? (t.description || 'unknown').toString().slice(0, 40)
      : raw;
    const key = cleaned.trim().slice(0, 60) || 'unknown';
    const bucket = merchantTotals.get(key) ?? { total: 0, users: new Set() };
    bucket.total += Math.abs(Number(t.amount));
    bucket.users.add(t.user_id);
    merchantTotals.set(key, bucket);
  }
  const topMerchants = [...merchantTotals.entries()]
    .filter(([, b]) => b.users.size >= MIN_SEGMENT_SIZE)
    .map(([merchant, b]) => ({
      merchant,
      total: Math.round(b.total),
      user_count: b.users.size,
      avg_per_user: Math.round(b.total / b.users.size),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);

  // ── Income mix ───────────────────────────────────────────────────
  const incomeMix = new Map<string, { total: number; users: Set<string> }>();
  for (const t of txnsThisMonth) {
    if (Number(t.amount) <= 0) continue;
    const itype = (t.income_type || 'other').toLowerCase();
    if (itype === 'transfer') continue; // internal transfers aren't income
    const key =
      itype === 'credit_loan' || itype === 'loan_repayment' ? 'loan_credit'
      : itype === 'rental_airbnb' || itype === 'rental_direct' || itype === 'rental_booking' ? 'rental'
      : itype;
    const bucket = incomeMix.get(key) ?? { total: 0, users: new Set() };
    bucket.total += Number(t.amount);
    bucket.users.add(t.user_id);
    incomeMix.set(key, bucket);
  }
  const incomeMixRows = [...incomeMix.entries()]
    .filter(([, b]) => b.users.size >= MIN_SEGMENT_SIZE)
    .map(([type, b]) => ({
      type,
      total: Math.round(b.total),
      user_count: b.users.size,
      avg_per_user: Math.round(b.total / b.users.size),
    }))
    .sort((a, b) => b.total - a.total);

  // ── Deals pipeline ───────────────────────────────────────────────
  const todayIso = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const ending7 = contractsEnding.filter((c) => c.contract_end_date! >= todayIso && c.contract_end_date! <= in7).length;
  const ending14 = contractsEnding.filter((c) => c.contract_end_date! >= todayIso && c.contract_end_date! <= in14).length;
  const ending30 = contractsEnding.filter((c) => c.contract_end_date! >= todayIso && c.contract_end_date! <= in30).length;
  // Rough "potential saving" — assume 20% avg saving if switched, matches the homepage claim
  const endingSoonMonthlyExposure = contractsEnding
    .filter((c) => c.contract_end_date! >= todayIso && c.contract_end_date! <= in30)
    .reduce((s, c) => {
      const amt = Number(c.amount) || 0;
      const monthly = c.billing_cycle === 'yearly' ? amt / 12 : c.billing_cycle === 'quarterly' ? amt / 3 : amt;
      return s + monthly;
    }, 0);
  const potentialSavingPa = Math.round(endingSoonMonthlyExposure * 12 * 0.2);

  // ── Disputes ─────────────────────────────────────────────────────
  const openStatuses = new Set(['open', 'awaiting_response', 'escalated', 'ombudsman']);
  const resolvedStatuses = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  const disputeOpen = disputes.filter((d) => openStatuses.has(d.status ?? '')).length;
  const disputeResolved = disputes.filter((d) => resolvedStatuses.has(d.status ?? '')).length;
  const disputeWon = disputes.filter((d) => d.status === 'resolved_won' || d.status === 'resolved_partial').length;
  const disputesWithResolvedAt = disputes.filter((d) => d.resolved_at && d.created_at);
  const avgDaysToResolve = disputesWithResolvedAt.length > 0
    ? disputesWithResolvedAt.reduce((sum, d) => {
        return sum + (new Date(d.resolved_at!).getTime() - new Date(d.created_at!).getTime()) / 86400_000;
      }, 0) / disputesWithResolvedAt.length
    : 0;
  const totalUnderDispute = disputes
    .filter((d) => openStatuses.has(d.status ?? ''))
    .reduce((s, d) => s + (Number(d.disputed_amount) || 0), 0);
  const totalRecovered = disputes
    .reduce((s, d) => s + (Number(d.money_recovered) || 0), 0);
  const disputeSuccessPct = (disputeResolved) > 0
    ? Math.round((disputeWon / disputeResolved) * 100)
    : 0;
  const providersInDispute = new Map<string, number>();
  for (const d of disputes) {
    if (!d.provider_name) continue;
    providersInDispute.set(d.provider_name, (providersInDispute.get(d.provider_name) ?? 0) + 1);
  }
  const topDisputedProviders = [...providersInDispute.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Subscriptions ────────────────────────────────────────────────
  const subsByUser = new Map<string, number>();
  for (const s of subs) {
    subsByUser.set(s.user_id, (subsByUser.get(s.user_id) ?? 0) + 1);
  }
  const totalSubs = subs.length;
  const usersWithSubs = subsByUser.size;
  const avgSubsPerUser = usersWithSubs > 0 ? totalSubs / usersWithSubs : 0;
  const subProviderAgg = new Map<string, { users: Set<string>; total: number }>();
  for (const s of subs) {
    const key = (s.provider_name || 'unknown').trim();
    const amt = Number(s.amount) || 0;
    const monthly = s.billing_cycle === 'yearly' ? amt / 12 : s.billing_cycle === 'quarterly' ? amt / 3 : amt;
    const bucket = subProviderAgg.get(key) ?? { users: new Set(), total: 0 };
    bucket.users.add(s.user_id);
    bucket.total += monthly;
    subProviderAgg.set(key, bucket);
  }
  const topSubProviders = [...subProviderAgg.entries()]
    .filter(([, b]) => b.users.size >= MIN_SEGMENT_SIZE)
    .map(([provider, b]) => ({
      provider,
      user_count: b.users.size,
      avg_monthly: Math.round((b.total / b.users.size) * 100) / 100,
    }))
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 20);
  const totalMonthlySubSpend = [...subProviderAgg.values()].reduce((s, b) => s + b.total, 0);

  // ── Price increases ──────────────────────────────────────────────
  const priceAlertsActive = priceAlerts.filter((a) => a.status !== 'dismissed' && a.status !== 'actioned');
  const priceAffectedUsers = new Set(priceAlertsActive.map((a) => a.user_id)).size;
  const totalExtraSpendPa = priceAlertsActive.reduce((s, a) => s + (Number(a.amount_change) || 0) * 12, 0);
  const avgHikeAmount = priceAlertsActive.length > 0
    ? priceAlertsActive.reduce((s, a) => s + (Number(a.amount_change) || 0), 0) / priceAlertsActive.length
    : 0;

  // ── Retention & connections ──────────────────────────────────────
  const usersWithActiveBank = new Set(bankConns.filter((b) => b.status === 'active').map((b) => b.user_id)).size;
  const usersWithActiveEmail = new Set(emailConns.filter((e) => e.status === 'active').map((e) => e.user_id)).size;
  const usersWithTelegram = new Set(telegramSessions.filter((t) => t.is_active).map((t) => t.user_id)).size;
  const expiredConsents = bankConns.filter((b) => b.consent_expires_at && b.consent_expires_at < new Date().toISOString()).length;
  const needsReauthEmails = emailConns.filter((e) => e.status === 'needs_reauth' || e.status === 'expired').length;

  // ── Feature adoption ─────────────────────────────────────────────
  const tasksByType = new Map<string, Set<string>>();
  for (const t of tasks) {
    if (!t.type) continue;
    const s = tasksByType.get(t.type) ?? new Set();
    s.add(t.user_id);
    tasksByType.set(t.type, s);
  }
  const usersWhoWroteLetter = tasksByType.get('complaint_letter')?.size
    ?? tasksByType.get('ai_letter')?.size
    ?? disputes.length > 0 ? new Set(disputes.map((d) => d.user_id)).size : 0;

  // ── Health score distribution ────────────────────────────────────
  const scores = profiles.map((p) => Number(p.health_score)).filter((s) => Number.isFinite(s) && s > 0);
  const avgHealthScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const healthDist = {
    excellent: scores.filter((s) => s >= 80).length,
    good: scores.filter((s) => s >= 60 && s < 80).length,
    fair: scores.filter((s) => s >= 40 && s < 60).length,
    poor: scores.filter((s) => s < 40).length,
  };

  // ── AI usage ─────────────────────────────────────────────────────
  const totalAiCostThisMonth = agentRuns.reduce((s, r) => s + (Number(r.estimated_cost) || 0), 0);
  const agentRunsByType = new Map<string, number>();
  for (const r of agentRuns) {
    const key = r.agent_type || 'unknown';
    agentRunsByType.set(key, (agentRunsByType.get(key) ?? 0) + 1);
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    privacy_note: `All figures are aggregated across all users. Segments with fewer than ${MIN_SEGMENT_SIZE} users are suppressed to prevent de-anonymisation.`,
    user_counts: {
      total: totalUsers,
      by_tier: tierCounts,
      new_signups_this_month: newSignupsThisMonth,
      active_last_7d: activeLast7d,
      active_last_30d: activeLast30d,
    },
    platform_money_flow: {
      spend_this_month: Math.round(thisMonthSpend),
      income_this_month: Math.round(thisMonthIncome),
      spend_last_month: Math.round(lastMonthSpend),
      spend_mom_pct: spendMomPct,
      avg_spend_per_active_user: Math.round(avgSpendPerActiveUser),
      avg_income_per_active_user: Math.round(avgIncomePerActiveUser),
      total_transactions_this_month: txnsThisMonth.length,
      users_with_spending_this_month: spendingUsers.size,
    },
    top_spending_categories: topCategories,
    top_merchants: topMerchants,
    income_mix: incomeMixRows,
    deals_pipeline: {
      contracts_ending_7d: ending7,
      contracts_ending_14d: ending14,
      contracts_ending_30d: ending30,
      potential_annual_saving_across_all_users: potentialSavingPa,
    },
    disputes: {
      total_open: disputeOpen,
      total_resolved: disputeResolved,
      total_won: disputeWon,
      success_pct: disputeSuccessPct,
      avg_days_to_resolve: Math.round(avgDaysToResolve),
      total_under_dispute: Math.round(totalUnderDispute),
      total_recovered: Math.round(totalRecovered),
      top_providers_disputed: topDisputedProviders,
    },
    subscriptions: {
      total_tracked: totalSubs,
      users_with_subs: usersWithSubs,
      avg_subs_per_user: Math.round(avgSubsPerUser * 10) / 10,
      total_monthly_sub_spend: Math.round(totalMonthlySubSpend),
      top_providers: topSubProviders,
    },
    price_increases: {
      active_alerts: priceAlertsActive.length,
      users_affected: priceAffectedUsers,
      total_extra_spend_pa: Math.round(totalExtraSpendPa),
      avg_hike_amount: Math.round(avgHikeAmount * 100) / 100,
    },
    retention: {
      users_with_active_bank: usersWithActiveBank,
      users_with_active_email: usersWithActiveEmail,
      users_with_telegram: usersWithTelegram,
      expired_bank_consents: expiredConsents,
      email_needs_reauth: needsReauthEmails,
      users_with_spending_this_month: spendingUsers.size,
    },
    feature_adoption: {
      connected_bank: usersWithActiveBank,
      connected_email: usersWithActiveEmail,
      wrote_letter_ever: typeof usersWhoWroteLetter === 'number' ? usersWhoWroteLetter : 0,
      tracked_subscription: usersWithSubs,
      created_dispute: new Set(disputes.map((d) => d.user_id)).size,
      used_telegram: usersWithTelegram,
      created_category_override: overrideCount > 0 ? overrideCount : 0,
    },
    health_scores: {
      avg: Math.round(avgHealthScore),
      distribution: healthDist,
    },
    ai_usage: {
      runs_this_month: agentRuns.length,
      cost_this_month_gbp: Math.round(totalAiCostThisMonth * 100) / 100,
      runs_by_agent: Object.fromEntries(agentRunsByType),
    },
    this_month: thisMonth,
    last_month: lastMonth,
  });
}
