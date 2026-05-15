/**
 * Hourly consumer nurture cron — runs at the top of every hour (UTC).
 *
 * Schedule changed from daily 10:00 UTC → hourly on 2026-04-29 so the
 * actual send timing tracks the design (T+1h, T+24h, T+72h, T+7d) much
 * more closely instead of being clamped to one daily firing window.
 *
 * Walks every non-terminal lead and sends the next email in the
 * 4-email sequence based on age + email_count. Predicates are tight
 * INTERVAL gates so the hourly cadence cannot double-send a row that
 * advanced earlier in the same day:
 *
 *   email_count=0 + age              ≥ 1h    → Email 1 (soft reminder, ~T+1h)
 *   email_count=1 + sinceLastEmail   ≥ 23h   → Email 2 (value nudge,   ~T+24h)
 *   email_count=2 + sinceLastEmail   ≥ 48h   → Email 3 (10% discount,  ~T+72h)
 *   email_count=3 + sinceLastEmail   ≥ 4d    → Email 4 (final,         ~T+7d)
 *   email_count=4 + age              ≥ 14d   → mark expired (no send)
 *
 * Each row only advances when its own `email_count` + `last_emailed_at`
 * is overdue, and the update of those fields after a successful send
 * makes the predicate idempotent for the rest of the day. There is no
 * date-truncation that assumes the cron only fires once a day.
 *
 * Per-run cap: PER_RUN_SEND_CAP. We stop initiating new sends once we
 * hit the cap to stay well under Resend's per-second / per-minute rate
 * limits if a flood of leads ever hits the queue. Skipped rows just
 * pick up on the next hourly tick.
 *
 * Skips: converted_paid, converted_free, expired, manual_handling,
 *        unsubscribed (and rows with unsubscribed_at set).
 *
 * Bearer-protected with CRON_SECRET. Also callable by an authenticated
 * admin via authorizeAdminOrCron for manual nudge runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { sendNurtureEmail, type NurtureTemplate } from '@/lib/email/consumer-nurture';
import { createOneOffDiscountCoupon } from '@/lib/stripe/coupons';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Soft cap on how many emails we'll initiate per cron tick. With the
 * cron now firing hourly, this is 100/hr ≈ 2,400/day worst-case —
 * comfortably below Resend's published 10 req/sec ceiling. If we ever
 * hit the cap, leftover leads roll to the next hourly tick (the
 * predicates are idempotent, so they won't be skipped, just delayed).
 */
const PER_RUN_SEND_CAP = 100;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface LeadRow {
  id: string;
  email: string;
  name: string | null;
  intended_tier: 'essential' | 'pro' | null;
  intended_billing_interval: 'monthly' | 'yearly' | null;
  funnel_stage: string;
  captured_at: string;
  last_emailed_at: string | null;
  email_count: number;
  discount_code: string | null;
  discount_coupon_id: string | null;
  discount_code_expires_at: string | null;
  unsubscribe_token: string;
  stripe_recovery_url: string | null;
}

interface Plan {
  template: NurtureTemplate | null;
  newStage: string;
  needsDiscount: boolean;
  expire: boolean;
}

/**
 * Decide the next action for a lead. Pure function — easy to unit-test
 * once we get there.
 */
function planNextAction(lead: LeadRow, now: Date): Plan {
  const captured = new Date(lead.captured_at).getTime();
  const lastEmail = lead.last_emailed_at ? new Date(lead.last_emailed_at).getTime() : null;
  const ageMs = now.getTime() - captured;
  const sinceLastMs = lastEmail ? now.getTime() - lastEmail : ageMs;

  if (lead.email_count >= 4) {
    if (ageMs >= 14 * DAY_MS) {
      return { template: null, newStage: 'expired', needsDiscount: false, expire: true };
    }
    return { template: null, newStage: lead.funnel_stage, needsDiscount: false, expire: false };
  }

  // Tight INTERVAL gates — using `last_emailed_at` (not date-trunc) so
  // a row that advanced 30 minutes ago in this same hour is NOT eligible
  // again until its own predicate is overdue. This is what makes hourly
  // firing safe.
  if (lead.email_count === 0 && ageMs >= 1 * HOUR_MS) {
    // T+1h since capture
    return { template: 'email_1_soft_reminder', newStage: 'email_1_sent', needsDiscount: false, expire: false };
  }
  if (lead.email_count === 1 && sinceLastMs >= 23 * HOUR_MS) {
    // ≥23h since email 1 → ~T+24h since capture
    return { template: 'email_2_value_nudge', newStage: 'email_2_sent', needsDiscount: false, expire: false };
  }
  if (lead.email_count === 2 && sinceLastMs >= 48 * HOUR_MS) {
    // ≥48h since email 2 → ~T+72h since capture
    return { template: 'email_3_discount', newStage: 'email_3_sent', needsDiscount: true, expire: false };
  }
  if (lead.email_count === 3 && sinceLastMs >= 4 * DAY_MS) {
    // ≥4d since email 3 → ~T+7d since capture
    return { template: 'email_4_final', newStage: 'email_4_sent', needsDiscount: false, expire: false };
  }

  return { template: null, newStage: lead.funnel_stage, needsDiscount: false, expire: false };
}

async function processLead(
  supabase: ReturnType<typeof getAdmin>,
  lead: LeadRow,
  now: Date,
): Promise<{ leadId: string; action: string; ok: boolean; reason?: string }> {
  const plan = planNextAction(lead, now);

  if (plan.expire) {
    await supabase
      .from('consumer_leads')
      .update({ funnel_stage: 'expired' })
      .eq('id', lead.id);
    return { leadId: lead.id, action: 'expired', ok: true };
  }

  if (!plan.template) {
    return { leadId: lead.id, action: 'skip_not_due', ok: true };
  }

  // Generate discount on email 3
  let promoCode = lead.discount_code ?? undefined;
  let promoExpiresAt: Date | undefined = lead.discount_code_expires_at
    ? new Date(lead.discount_code_expires_at)
    : undefined;
  let couponId = lead.discount_coupon_id ?? undefined;

  if (plan.needsDiscount && !promoCode) {
    try {
      const created = await createOneOffDiscountCoupon(lead.email, 10, 7);
      promoCode = created.promo_code;
      couponId = created.coupon_id;
      promoExpiresAt = created.expires_at;
      captureServer('discount_code_issued', `consumer_lead:${lead.id}`, {
        promo_code: promoCode,
        percent_off: 10,
        expires_at: promoExpiresAt.toISOString(),
      });
    } catch (err) {
      return {
        leadId: lead.id,
        action: 'discount_failed',
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const sendResult = await sendNurtureEmail(plan.template, {
    email: lead.email,
    name: lead.name,
    intendedTier: lead.intended_tier,
    intendedBillingInterval: lead.intended_billing_interval,
    unsubscribeToken: lead.unsubscribe_token,
    promoCode,
    promoExpiresAt,
    recoveryUrl: lead.stripe_recovery_url ?? undefined,
  });

  if (!sendResult.ok) {
    return { leadId: lead.id, action: `send_${plan.template}`, ok: false, reason: sendResult.reason };
  }

  // Update lead + write audit log
  const updates: Record<string, unknown> = {
    funnel_stage: plan.newStage,
    last_emailed_at: now.toISOString(),
    email_count: lead.email_count + 1,
    last_contacted_via: 'email',
  };
  if (plan.needsDiscount && promoCode) {
    updates.discount_code = promoCode;
    updates.discount_coupon_id = couponId;
    updates.discount_code_expires_at = promoExpiresAt?.toISOString();
  }

  await supabase.from('consumer_leads').update(updates).eq('id', lead.id);

  await supabase.from('consumer_lead_email_log').insert({
    consumer_lead_id: lead.id,
    template: plan.template,
    subject: sendResult.subject,
    resend_message_id: sendResult.messageId ?? null,
    metadata: {
      email_count_after: lead.email_count + 1,
      discount_code: plan.needsDiscount ? promoCode : null,
    },
  });

  captureServer('nurture_email_sent', `consumer_lead:${lead.id}`, {
    template: plan.template,
    email_count_after: lead.email_count + 1,
    subject: sendResult.subject,
  });

  return { leadId: lead.id, action: `sent_${plan.template}`, ok: true };
}

async function runCron(): Promise<{
  scanned: number;
  results: Array<{ leadId: string; action: string; ok: boolean; reason?: string }>;
  sendsInitiated?: number;
  capped?: boolean;
}> {
  const supabase = getAdmin();
  const now = new Date();

  const { data: leads, error } = await supabase
    .from('consumer_leads')
    .select(
      'id, email, name, intended_tier, intended_billing_interval, funnel_stage, captured_at, last_emailed_at, email_count, discount_code, discount_coupon_id, discount_code_expires_at, unsubscribe_token, stripe_recovery_url',
    )
    .not('funnel_stage', 'in', '("converted_paid","converted_free","unsubscribed","expired","manual_handling")')
    .is('unsubscribed_at', null)
    .order('captured_at', { ascending: true })
    .limit(200);

  if (error || !leads) {
    return { scanned: 0, results: [] };
  }

  const results: Array<{ leadId: string; action: string; ok: boolean; reason?: string }> = [];
  let sendsInitiated = 0;
  let capped = false;
  for (const lead of leads as LeadRow[]) {
    // Per-run cap — once we've kicked off PER_RUN_SEND_CAP outbound
    // sends in this tick, stop initiating new ones. The remainder will
    // be picked up on the next hourly tick (predicates are idempotent).
    if (sendsInitiated >= PER_RUN_SEND_CAP) {
      capped = true;
      results.push({ leadId: lead.id, action: 'skip_per_run_cap', ok: true });
      continue;
    }
    try {
      const r = await processLead(supabase, lead, now);
      results.push(r);
      if (r.action.startsWith('sent_')) sendsInitiated += 1;
    } catch (err) {
      results.push({
        leadId: lead.id,
        action: 'unhandled_error',
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scanned: leads.length, results, sendsInitiated, capped };
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }
  const summary = await runCron();
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  // POST allowed too — internal manual triggers from admin UI
  return GET(req);
}
