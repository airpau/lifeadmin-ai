/**
 * Price-rise watch: the server side. Reads the user's vault, runs the
 * pure detector (price-rise.ts), records what it finds and feeds monthly
 * rises into the existing price increase alert system.
 *
 * How it fits the existing system (src/lib/price-alerts, the
 * price_increase_alerts table from 20260401000000, the price-increases
 * cron):
 *
 *  - Every finding is recorded in document_price_rises (one row per pair
 *    of documents, so a dismissed rise never comes back) and shown on
 *    the Documents page.
 *  - MONTHLY rises are also inserted into price_increase_alerts, in the
 *    exact shape the bank detector writes: monthly old and new amounts,
 *    annual_impact = difference x 12, merchant_normalized from the same
 *    normaliseMerchantName(). Before inserting, the existing
 *    buildPriceAlertSuppressor() is asked, so an active alert for the
 *    same merchant (from the bank feed or an earlier vault run) or a
 *    recently dismissed identical one stops a duplicate. The per-merchant
 *    auto-tuned threshold (getEffectiveThreshold) is respected. From
 *    there the existing dashboard card, Telegram alerts cron and chat
 *    tool pick the alert up as they do for bank alerts.
 *  - QUARTERLY and YEARLY rises (an insurance renewal, an annual bill)
 *    are NOT written to price_increase_alerts. Its consumers treat
 *    old_amount and new_amount as monthly payments: the Telegram alerts
 *    cron says "went up by £X/month" and "raised your direct debit".
 *    A £120 rise on a yearly policy would be announced as £120 a month.
 *    Fitting those in would mean changing that contract, so they stay
 *    in document_price_rises and on the Documents page only.
 *
 * Nothing here sends a notification directly. No AI call.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { londonToday, addDays } from '@/lib/documents/dates';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { buildPriceAlertSuppressor } from '@/lib/price-alerts/suppression';
import { getEffectiveThreshold } from '@/lib/intelligence/detection-thresholds';
import {
  DEFAULT_ANNUAL_THRESHOLD_GBP,
  DEFAULT_PCT_THRESHOLD,
  alertCategoryFor,
  detectPriceRises,
  type PriceDoc,
  type PriceRiseFinding,
} from '@/lib/documents/price-rise';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** How far back the watch reads: a little over two years. */
const LOOKBACK_DAYS = 800;

export interface PriceRiseRunResult {
  found: number;
  created: number;
  fedToAlerts: number;
}

/** The merchant name the existing alert system keys on. */
export function alertMerchantName(supplier: string): string {
  const n = normaliseMerchantName(supplier);
  return n && n !== 'Unknown' ? n : supplier.trim();
}

export async function runPriceRiseWatch(admin: Admin, userId: string, opts: { feedAlerts?: boolean } = {}): Promise<PriceRiseRunResult> {
  const feedAlerts = opts.feedAlerts ?? true;
  const since = addDays(londonToday(), -LOOKBACK_DAYS);
  const { data, error } = await admin
    .from('documents')
    .select('id, doc_type, supplier, amount, currency, doc_date, renewal_date, summary, filename, email_subject, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('doc_type', ['bill', 'statement', 'policy', 'contract', 'letter'])
    .not('amount', 'is', null)
    .not('supplier', 'is', null)
    .gte('doc_date', since)
    .order('doc_date', { ascending: true })
    .limit(3000);
  if (error) throw new Error(`price-rise watch: ${error.message}`);
  const docs = (data as PriceDoc[] | null) ?? [];

  // Lowest threshold first; the per-merchant auto-tune can only raise it.
  const candidates = detectPriceRises(docs, { pctThreshold: () => DEFAULT_PCT_THRESHOLD });
  if (candidates.length === 0) return { found: 0, created: 0, fedToAlerts: 0 };

  const findings: PriceRiseFinding[] = [];
  for (const f of candidates) {
    const threshold = await getEffectiveThreshold('price_increase', alertMerchantName(f.supplier), DEFAULT_PCT_THRESHOLD);
    if (f.increasePct > threshold || f.annualIncrease > DEFAULT_ANNUAL_THRESHOLD_GBP) findings.push(f);
  }

  const { data: existing } = await admin
    .from('document_price_rises')
    .select('old_document_id, new_document_id')
    .eq('user_id', userId);
  const seen = new Set(((existing ?? []) as Array<{ old_document_id: string; new_document_id: string }>).map((r) => `${r.old_document_id}|${r.new_document_id}`));

  const fresh = findings.filter((f) => !seen.has(`${f.oldDoc.id}|${f.newDoc.id}`));
  let created = 0;
  let fed = 0;
  const isSuppressed = feedAlerts && fresh.some((f) => f.cadence === 'monthly') ? await buildPriceAlertSuppressor(admin, userId) : null;

  for (const f of fresh) {
    const { data: row, error: insErr } = await admin
      .from('document_price_rises')
      .upsert(
        {
          user_id: userId,
          supplier: f.supplier,
          supplier_normalised: f.supplierNormalised,
          doc_type: f.docType,
          cadence: f.cadence,
          old_document_id: f.oldDoc.id,
          new_document_id: f.newDoc.id,
          old_amount: f.oldAmount,
          new_amount: f.newAmount,
          old_date: f.oldDate,
          new_date: f.newDate,
          increase_pct: f.increasePct,
          annual_increase: f.annualIncrease,
        },
        { onConflict: 'user_id,old_document_id,new_document_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (insErr || !row) continue;
    created++;

    if (f.cadence !== 'monthly' || !isSuppressed) continue;
    const merchant = alertMerchantName(f.supplier);
    if (isSuppressed({ merchantNormalized: merchant, oldAmount: f.oldAmount, newAmount: f.newAmount })) continue;
    const { data: alert, error: alertErr } = await admin
      .from('price_increase_alerts')
      .insert({
        user_id: userId,
        merchant_name: f.supplier,
        merchant_normalized: merchant,
        old_amount: f.oldAmount,
        new_amount: f.newAmount,
        increase_pct: f.increasePct,
        annual_impact: f.annualIncrease,
        old_date: f.oldDate,
        new_date: f.newDate,
        category: alertCategoryFor(f.newDoc),
        status: 'active',
      })
      .select('id')
      .maybeSingle();
    if (alertErr || !alert) {
      console.warn('[documents.price-rise] alert insert failed:', alertErr?.message);
      continue;
    }
    fed++;
    await admin.from('document_price_rises').update({ price_alert_id: alert.id }).eq('id', (row as { id: string }).id).eq('user_id', userId);
  }

  return { found: findings.length, created, fedToAlerts: fed };
}

/** Best effort after filing: never throws, never blocks the caller's response for long. */
export async function priceRiseWatchAfterFiling(admin: Admin, userId: string, enabled: boolean, savedCount: number): Promise<PriceRiseRunResult | null> {
  if (!enabled || savedCount <= 0) return null;
  try {
    return await runPriceRiseWatch(admin, userId);
  } catch (err) {
    console.warn('[documents.price-rise] after filing failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
