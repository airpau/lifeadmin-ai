// One-off remediation: Lisa Groom is a staff member (employee) paid monthly.
// Her salary payment ("Lisagroom", ~£300-940/mo) was mis-classified as a
// subscription ("Lisagroom New Ef Hoddesdon", £808.71/mo) which then fired a
// renewal/cancellation "trial ends in 3 days" alert via the WhatsApp Pocket
// Agent. Payroll is not a cancellable subscription.
//
// This script is DELIBERATELY NARROW: it only matches the "Lisa Groom" name,
// NOT the broad "Hoddesdon" token (which also matches the user's gym, Post
// Office, Frixty Studio Ltd and other legitimate Hoddesdon-area merchants that
// must NOT be touched).
//
// It (1) recategorises the Lisa Groom bank_transactions to the staff "wages"
// category, (2) recategorises + dismisses the mis-detected subscription so it
// stops generating renewal alerts, and (3) dismisses any matching price alert.
//
// Run modes:
//   node scripts/fix-lisa-groom-payroll.mjs           # dry-run (read only)
//   node scripts/fix-lisa-groom-payroll.mjs --apply   # perform the writes
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Minimal .env.local parser (no extra deps). Strips quotes, literal "\n"
// escapes, and stray whitespace (the URL in .env.local has a trailing \n).
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\\[rn]/g, '').trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Narrow: ONLY the employee's name. "Lisagroom" (no space, as it appears in the
// bank feed) and "Lisa Groom" (spaced). Do NOT add a bare "hoddesdon" pattern.
const NAME_PATTERNS = ['%lisagroom%', '%lisa groom%'];
const PAYROLL_CATEGORY = 'wages'; // canonical "Wages (Staff)" — see src/lib/categories.ts
const orName = (cols) =>
  cols.flatMap((c) => NAME_PATTERNS.map((p) => `${c}.ilike.${p}`)).join(',');

console.log(`\n=== Lisa Groom payroll remediation (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

// ── 1. bank_transactions ────────────────────────────────────────────────────
const { data: txns, error: txErr } = await supabase
  .from('bank_transactions')
  .select('id, user_id, merchant_name, description, amount, category, user_category, parent_category')
  .or(orName(['merchant_name', 'description']))
  .order('timestamp', { ascending: false });
if (txErr) { console.error('bank_transactions query error:', txErr.message); process.exit(1); }

console.log(`bank_transactions matched: ${txns?.length ?? 0}`);
for (const t of txns ?? []) {
  console.log(`  • ${t.id} | ${t.merchant_name ?? t.description} | £${t.amount} | cat=${t.category} user_cat=${t.user_category}`);
}

// ── 2. subscriptions ────────────────────────────────────────────────────────
const { data: subs, error: subErr } = await supabase
  .from('subscriptions')
  .select('id, user_id, provider_name, category, amount, status')
  .or(orName(['provider_name']));
if (subErr) { console.error('subscriptions query error:', subErr.message); process.exit(1); }

console.log(`\nsubscriptions matched: ${subs?.length ?? 0}`);
for (const s of subs ?? []) {
  console.log(`  • ${s.id} | ${s.provider_name} | £${s.amount} | cat=${s.category} | status=${s.status}`);
}

// ── 3. price_increase_alerts (uses merchant_name / merchant_normalized) ──────
const { data: alerts, error: alErr } = await supabase
  .from('price_increase_alerts')
  .select('id, user_id, merchant_name, merchant_normalized, category, status, old_amount, new_amount')
  .or(orName(['merchant_name', 'merchant_normalized']));
if (alErr) { console.error('price_increase_alerts query error:', alErr.message); process.exit(1); }

console.log(`\nprice_increase_alerts matched: ${alerts?.length ?? 0}`);
for (const a of alerts ?? []) {
  console.log(`  • ${a.id} | ${a.merchant_name} | cat=${a.category} | status=${a.status} | ${a.old_amount}->${a.new_amount}`);
}

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to perform the writes.\n');
  process.exit(0);
}

console.log('\n--- Applying writes ---');
const now = new Date().toISOString();

// 1. Recategorise transactions to the staff wages category.
if (txns?.length) {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ user_category: PAYROLL_CATEGORY, parent_category: PAYROLL_CATEGORY })
    .in('id', txns.map((t) => t.id));
  console.log(error ? `  bank_transactions update FAILED: ${error.message}` : `  bank_transactions → ${PAYROLL_CATEGORY}: ${txns.length} row(s) updated`);
}

// 2. Recategorise the mis-detected subscription to wages AND dismiss it — it is
//    not a subscription the user can cancel, so silence its renewal alerts.
if (subs?.length) {
  const { error } = await supabase
    .from('subscriptions')
    .update({ category: PAYROLL_CATEGORY, status: 'dismissed', dismissed_at: now })
    .in('id', subs.map((s) => s.id));
  console.log(error ? `  subscriptions update FAILED: ${error.message}` : `  subscriptions → ${PAYROLL_CATEGORY} + dismissed: ${subs.length} row(s) updated`);
}

// 3. Dismiss any matching price alerts.
if (alerts?.length) {
  const { error } = await supabase
    .from('price_increase_alerts')
    .update({ status: 'dismissed', category: PAYROLL_CATEGORY })
    .in('id', alerts.map((a) => a.id));
  console.log(error ? `  price_increase_alerts update FAILED: ${error.message}` : `  price_increase_alerts → dismissed: ${alerts.length} row(s) updated`);
}

console.log('\nDone.\n');
