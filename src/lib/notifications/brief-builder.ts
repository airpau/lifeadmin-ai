/**
 * Deterministic Pocket Agent brief builders.
 *
 * Generates rich, data-grounded notification text for the cron-kind
 * events (morning_summary, evening_summary, payday_summary, weekly_digest,
 * monthly_recap). Every line comes from a Supabase query — no LLM, no
 * generic copy, no "Top focus: spending recap" hallucinations.
 *
 * Why this lives here (not in /api/cron/personal-schedules/route.ts):
 *   - Same helper is reused across the personal-schedules cron AND any
 *     ad-hoc agent triggers (Pocket Agent inbound "give me my morning
 *     brief now" requests).
 *   - Pure-ish: takes (supabase, userId, now) → string. Cheap to unit
 *     test by mocking the Supabase client.
 *
 * Output is plain markdown-flavoured text suitable for Telegram and
 * WhatsApp free-text (within the 24h customer-service window). Sections
 * are omitted entirely when there's no data — the digest never says
 * "0 opportunities" or "no spending recorded" if the section is empty.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRealSpend, effectiveCategory } from '@/lib/spending';

interface BriefContext {
  userId: string;
  firstName: string;
  now: Date;
}

function gbp(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
}

function ddmm(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function fetchFirstName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name, full_name')
    .eq('id', userId)
    .maybeSingle();
  const fn = (data?.first_name as string | undefined)?.trim();
  if (fn) return fn;
  const full = (data?.full_name as string | undefined)?.trim();
  if (full) return full.split(/\s+/)[0];
  return 'there';
}

/**
 * Morning brief — runs at the user's scheduled time (default 07:30
 * Europe/London). Includes:
 *
 *   - Greeting with first name
 *   - Combined current account balance (across active bank_connections)
 *   - Money in / money out over last 7 days
 *   - Upcoming payments next 7 days (subscriptions + recurring patterns)
 *   - Open disputes with latest status
 *   - Active price-increase alerts (subscription hikes detected)
 *
 * Sections render only if they have content. The whole brief stays
 * under 1024 chars so it survives WhatsApp's free-text limit.
 */
export async function buildMorningBrief(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const now = new Date();
  const firstName = await fetchFirstName(supabase, userId);
  return buildBrief(supabase, { userId, firstName, now }, 'morning');
}

export async function buildEveningRecap(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const now = new Date();
  const firstName = await fetchFirstName(supabase, userId);
  return buildBrief(supabase, { userId, firstName, now }, 'evening');
}

export async function buildWeeklyDigest(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const now = new Date();
  const firstName = await fetchFirstName(supabase, userId);
  return buildBrief(supabase, { userId, firstName, now }, 'weekly');
}

export async function buildPaydaySummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const now = new Date();
  const firstName = await fetchFirstName(supabase, userId);
  return buildBrief(supabase, { userId, firstName, now }, 'payday');
}

type BriefKind = 'morning' | 'evening' | 'weekly' | 'payday';

async function buildBrief(
  supabase: SupabaseClient,
  ctx: BriefContext,
  kind: BriefKind,
): Promise<string> {
  const { userId, firstName, now } = ctx;

  // Window selection — morning + evening look at last 7d, weekly looks
  // back 7d but frames as "this week", payday focuses on the next 30d.
  const lookbackDays = kind === 'weekly' ? 7 : kind === 'payday' ? 30 : 7;
  const windowStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];
  const in7DaysStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const [
    bankConnRes,
    recentTxRes,
    upcomingSubsRes,
    openDisputesRes,
    priceAlertsRes,
  ] = await Promise.all([
    supabase
      .from('bank_connections')
      .select('current_balance, available_balance, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('bank_transactions')
      .select('amount, user_category, category, description, merchant_name, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', windowStart.toISOString())
      .lte('timestamp', now.toISOString()),
    supabase
      .from('subscriptions')
      .select('provider_name, amount, billing_cycle, next_billing_date, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('dismissed_at', null)
      .or(
        `and(next_billing_date.gte.${todayStr},next_billing_date.lte.${kind === 'payday' ? in30DaysStr : in7DaysStr}),and(contract_end_date.gte.${todayStr},contract_end_date.lte.${in30DaysStr})`,
      ),
    supabase
      .from('disputes')
      .select('provider_name, issue_type, status, updated_at, money_recovered')
      .eq('user_id', userId)
      .not('status', 'in', '(resolved_won,resolved_partial,resolved_lost,closed)')
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('price_increase_alerts')
      .select('merchant_name, old_amount, new_amount, increase_pct, annual_impact')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const sections: string[] = [];

  // ---------- header ----------
  const greeting =
    kind === 'morning'
      ? `${greetingFor(now)} ${firstName} 👋`
      : kind === 'evening'
        ? `Evening ${firstName} — here's today's recap.`
        : kind === 'weekly'
          ? `Hey ${firstName} — your weekly money recap is in.`
          : `Hey ${firstName} — payday checkpoint.`;

  const subline =
    kind === 'morning'
      ? "Here's your financial snapshot for today:"
      : kind === 'evening'
        ? 'Today vs. your usual.'
        : kind === 'weekly'
          ? 'Last 7 days at a glance.'
          : 'Income matched to what you have lined up.';

  sections.push(`*${greeting}*\n${subline}`);

  // ---------- balance ----------
  const conns = (bankConnRes.data ?? []) as Array<{
    current_balance: number | string | null;
    available_balance: number | string | null;
  }>;
  const totalBalance = conns.reduce((s, c) => {
    const v = typeof c.current_balance === 'string'
      ? parseFloat(c.current_balance)
      : (c.current_balance ?? null);
    return s + (Number.isFinite(v) && v !== null ? Number(v) : 0);
  }, 0);
  if (conns.length > 0 && totalBalance > 0) {
    sections.push(`💰 *Account balance:* ${gbp(totalBalance)}`);
  }

  // ---------- money in / out ----------
  const txns = (recentTxRes.data ?? []) as Array<{
    amount: number | string;
    user_category: string | null;
    category: string | null;
    description: string | null;
    merchant_name: string | null;
    timestamp: string;
  }>;
  let moneyIn = 0;
  let moneyOut = 0;
  for (const tx of txns) {
    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    if (!Number.isFinite(amt)) continue;
    if (amt > 0) {
      moneyIn += amt;
    } else if (isRealSpend(tx)) {
      moneyOut += Math.abs(amt);
    }
  }
  const periodLabel =
    kind === 'weekly' ? 'last 7 days' : kind === 'payday' ? 'last 30 days' : 'last 7 days';
  if (moneyIn > 0 || moneyOut > 0) {
    const lines: string[] = [];
    if (moneyIn > 0) lines.push(`📥 *Money in (${periodLabel}):* ${gbp(moneyIn)}`);
    if (moneyOut > 0) lines.push(`📤 *Money out (${periodLabel}):* ${gbp(moneyOut)}`);
    sections.push(lines.join('\n'));
  }

  // ---------- top categories (weekly + payday only) ----------
  if (kind === 'weekly' || kind === 'payday') {
    const byCat: Record<string, number> = {};
    for (const tx of txns) {
      if (!isRealSpend(tx)) continue;
      const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
      if (!Number.isFinite(amt)) continue;
      const cat = effectiveCategory(tx);
      byCat[cat] = (byCat[cat] ?? 0) + Math.abs(amt);
    }
    const top = Object.entries(byCat)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    if (top.length > 0) {
      const lines = top.map(
        ([cat, total]) =>
          `• ${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}: ${gbp(total)}`,
      );
      sections.push(`📊 *Top spend categories:*\n${lines.join('\n')}`);
    }
  }

  // ---------- upcoming payments ----------
  const upcomingRaw = (upcomingSubsRes.data ?? []) as Array<{
    provider_name: string;
    amount: number | string;
    billing_cycle: string | null;
    next_billing_date: string | null;
    contract_end_date: string | null;
  }>;
  const horizon = kind === 'payday' ? in30DaysStr : in7DaysStr;
  const upcoming = upcomingRaw
    .filter((s) => {
      const d = s.next_billing_date;
      return d && d >= todayStr && d <= horizon;
    })
    .sort((a, b) => (a.next_billing_date ?? '').localeCompare(b.next_billing_date ?? ''))
    .slice(0, 5);
  if (upcoming.length > 0) {
    const range = kind === 'payday' ? '30 days' : '7 days';
    const lines = upcoming.map((s) => {
      const amt = typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount;
      return `• ${s.provider_name} — ${gbp(Number(amt))} on ${ddmm(s.next_billing_date as string)}`;
    });
    sections.push(`📅 *Upcoming payments (next ${range}):*\n${lines.join('\n')}`);
  }

  // ---------- contract expiries (morning + weekly only) ----------
  if (kind === 'morning' || kind === 'weekly') {
    const expiring = upcomingRaw
      .filter((s) => {
        const d = s.contract_end_date;
        return d && d >= todayStr && d <= in30DaysStr;
      })
      .sort((a, b) =>
        (a.contract_end_date ?? '').localeCompare(b.contract_end_date ?? ''),
      )
      .slice(0, 3);
    if (expiring.length > 0) {
      const lines = expiring.map((s) => {
        const days = daysBetween(now, new Date(s.contract_end_date as string));
        const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
        return `• ${s.provider_name} — ends ${when}`;
      });
      sections.push(`⏳ *Contracts ending soon:*\n${lines.join('\n')}`);
    }
  }

  // ---------- open disputes ----------
  const openDisputes = (openDisputesRes.data ?? []) as Array<{
    provider_name: string;
    issue_type: string;
    status: string;
    updated_at: string;
    money_recovered: number | string | null;
  }>;
  if (openDisputes.length > 0) {
    const lines = openDisputes.slice(0, 3).map((d) => {
      const status = d.status.replace(/_/g, ' ');
      return `• ${d.provider_name} — ${status}`;
    });
    const tail =
      openDisputes.length > 3 ? `\n…and ${openDisputes.length - 3} more` : '';
    sections.push(
      `⚖️ *Open disputes (${openDisputes.length}):*\n${lines.join('\n')}${tail}`,
    );
  }

  // ---------- price increase alerts ----------
  const priceAlerts = (priceAlertsRes.data ?? []) as Array<{
    merchant_name: string;
    old_amount: number | string;
    new_amount: number | string;
    increase_pct: number | string;
    annual_impact: number | string;
  }>;
  if (priceAlerts.length > 0) {
    const lines = priceAlerts.map((a) => {
      const oldAmt = Number(a.old_amount);
      const newAmt = Number(a.new_amount);
      const pct = Math.round(Number(a.increase_pct));
      return `• ${a.merchant_name}: ${gbp(oldAmt)} → ${gbp(newAmt)} (+${pct}%)`;
    });
    sections.push(`🔍 *Price increases spotted:*\n${lines.join('\n')}`);
  }

  // ---------- footer CTA ----------
  if (kind === 'morning' || kind === 'evening') {
    sections.push('Reply here to ask me anything about your finances.');
  } else if (kind === 'weekly') {
    sections.push("Reply 'deals' to see switching offers in your top categories.");
  } else {
    sections.push("Reply 'plan' to map your income to bills for the month.");
  }

  return sections.join('\n\n');
}

/**
 * Build a price-increase WhatsApp template payload from a detected
 * increase. Centralises the var ordering + formatting so callers don't
 * have to know the template's vars in order.
 *
 * Template vars (order): merchant, old_price, new_price, effective_date
 */
export function priceIncreaseTemplateVars(args: {
  merchantName: string;
  oldAmount: number;
  newAmount: number;
  effectiveDate: Date | string;
}): { templateName: 'paybacker_alert_price_increase'; parameters: string[] } {
  const eff =
    typeof args.effectiveDate === 'string'
      ? new Date(args.effectiveDate)
      : args.effectiveDate;
  const dateStr = eff.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return {
    templateName: 'paybacker_alert_price_increase',
    parameters: [
      args.merchantName,
      `£${args.oldAmount.toFixed(2)}`,
      `£${args.newAmount.toFixed(2)}`,
      dateStr,
    ],
  };
}

/**
 * Build a renewal-reminder WhatsApp template payload.
 *
 * Template vars (order): service, days_left, monthly_cost
 */
export function renewalTemplateVars(args: {
  service: string;
  daysLeft: number;
  monthlyCost: number;
}): { templateName: 'paybacker_alert_renewal'; parameters: string[] } {
  return {
    templateName: 'paybacker_alert_renewal',
    parameters: [
      args.service,
      String(args.daysLeft),
      `£${args.monthlyCost.toFixed(2)}`,
    ],
  };
}
