/**
 * One-time backfill script for bank_connections.account_identifications_hashes
 *
 * Problem: Connections created before 2026-04-28 (Phase A) or during migration
 * gaps may have null/empty `account_identifications_hashes`. The bank-sync cron
 * silently skips these accounts because the dedup invariants need hashes.
 *
 * This script finds every active Yapily connection with missing hashes,
 * fetches accounts via the Yapily API, computes the hashes, and updates the row.
 *
 * Run locally with Supabase service role + Yapily credentials:
 *   tsx scripts/backfill-account-hashes.ts
 *
 * Or deploy as a one-off Vercel function (not committed to cron).
 */

import { createClient } from '@supabase/supabase-js';
import { getAccounts } from '../src/lib/yapily';
import { snapshotAccounts } from '../src/lib/yapily/connection-store';
import { decrypt } from '../src/lib/encrypt';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function backfill() {
  const { data: connections, error } = await supabase
    .from('bank_connections')
    .select('id, user_id, consent_token, account_ids, account_identifications_hashes, account_display_names, bank_name')
    .eq('provider', 'yapily')
    .in('status', ['active', 'token_expired'])
    .is('archived_at', null)
    .is('deleted_at', null);

  if (error) {
    console.error('Failed to fetch connections:', error.message);
    process.exit(1);
  }

  if (!connections || connections.length === 0) {
    console.log('No active Yapily connections found.');
    return;
  }

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const conn of connections) {
    const hashes = Array.isArray(conn.account_identifications_hashes)
      ? conn.account_identifications_hashes
      : [];

    // Skip connections that already have valid hashes
    if (hashes.length > 0 && hashes.every((h: string) => h.length > 0)) {
      skipped++;
      continue;
    }

    if (!conn.consent_token) {
      console.warn(`Connection ${conn.id}: no consent_token — skipping`);
      failed++;
      continue;
    }

    try {
      const consentToken = decrypt(conn.consent_token);
      const accounts = await getAccounts(consentToken);
      const snapshots = snapshotAccounts(accounts);
      const newHashes = snapshots.map((s) => s.accountIdentificationsHash ?? '');
      const newDisplayNames = snapshots.map((s) => s.displayName);
      const newAccountIds = snapshots.map((s) => s.yapilyAccountId);

      if (newHashes.length === 0 || !newHashes.some((h) => h.length > 0)) {
        console.warn(`Connection ${conn.id}: Yapily returned no accounts or no hashes — skipping`);
        failed++;
        continue;
      }

      const { error: updErr } = await supabase
        .from('bank_connections')
        .update({
          account_identifications_hashes: newHashes,
          account_display_names: newDisplayNames,
          account_ids: newAccountIds,
          bank_name: snapshots[0]?.displayName ? conn.bank_name || accounts[0]?.institution?.name : conn.bank_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);

      if (updErr) {
        console.error(`Connection ${conn.id}: update failed —`, updErr.message);
        failed++;
        continue;
      }

      console.log(`Connection ${conn.id}: backfilled ${newHashes.length} hashes ✅`);
      fixed++;
    } catch (err: any) {
      console.error(`Connection ${conn.id}: error —`, err.message);
      failed++;
    }
  }

  console.log('\n─────────────────────────');
  console.log(`Total connections checked: ${connections.length}`);
  console.log(`Already OK (skipped):      ${skipped}`);
  console.log(`Fixed (hashes backfilled): ${fixed}`);
  console.log(`Failed:                    ${failed}`);
  console.log('─────────────────────────');
}

backfill().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
