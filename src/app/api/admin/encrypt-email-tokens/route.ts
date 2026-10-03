/**
 * POST /api/admin/encrypt-email-tokens
 *
 * One-off backfill: encrypts any OAuth access/refresh token still stored
 * as plain text in `email_connections` and `gmail_tokens`, using the
 * same helper as every live write (src/lib/email/token-crypto.ts).
 *
 * Why it is needed at all: new and refreshed tokens are encrypted as
 * they are written, but Google never rotates refresh tokens, so a Gmail
 * refresh token saved before EMAIL_ENCRYPTION_KEY existed would
 * otherwise stay in plain text until the user reconnects.
 *
 * Safe by default:
 *  - auth: founder session or `Authorization: Bearer ${CRON_SECRET}`
 *  - dry run unless `?apply=1`; the dry run only counts rows
 *  - refuses to apply when EMAIL_ENCRYPTION_KEY is missing/invalid, and
 *    round-trips a probe value before writing anything
 *  - each update is conditional on the column still holding the value
 *    that was read, so a token refreshed concurrently is never clobbered
 *  - idempotent: already-encrypted values are skipped
 *
 * NOT scheduled in vercel.json, and should not be.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  tokenEncryptionEnabled,
} from '@/lib/email/token-crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PAGE = 500;
const TOKEN_COLUMNS = ['access_token', 'refresh_token'] as const;

interface TableReport {
  scanned: number;
  plainValues: number;
  encrypted: number;
  skippedConcurrent: number;
  errors: number;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const apply = new URL(request.url).searchParams.get('apply') === '1';
  const keyReady = tokenEncryptionEnabled();

  if (apply) {
    if (!keyReady) {
      return NextResponse.json(
        { error: 'EMAIL_ENCRYPTION_KEY is missing or not 64 hex chars. Nothing was changed.' },
        { status: 400 },
      );
    }
    const probe = 'paybacker-token-crypto-probe';
    const enc = encryptToken(probe);
    if (!isEncryptedToken(enc) || decryptToken(enc) !== probe) {
      return NextResponse.json({ error: 'Encryption self-test failed. Nothing was changed.' }, { status: 500 });
    }
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );

  const report: Record<string, TableReport> = {};
  for (const table of ['email_connections', 'gmail_tokens'] as const) {
    const r: TableReport = { scanned: 0, plainValues: 0, encrypted: 0, skippedConcurrent: 0, errors: 0 };
    report[table] = r;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from(table)
        .select('id, access_token, refresh_token')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        r.errors++;
        console.error(`[encrypt-email-tokens] ${table} read failed:`, error.message);
        break;
      }
      const rows = (data ?? []) as Array<{ id: string; access_token: string | null; refresh_token: string | null }>;
      for (const row of rows) {
        r.scanned++;
        for (const col of TOKEN_COLUMNS) {
          const value = row[col];
          if (!value || isEncryptedToken(value)) continue;
          r.plainValues++;
          if (!apply) continue;
          const { data: updated, error: updErr } = await admin
            .from(table)
            .update({ [col]: encryptToken(value) })
            .eq('id', row.id)
            .eq(col, value)
            .select('id');
          if (updErr) {
            r.errors++;
            console.error(`[encrypt-email-tokens] ${table}.${col} update failed for ${row.id}:`, updErr.message);
          } else if (!updated || updated.length === 0) {
            r.skippedConcurrent++;
          } else {
            r.encrypted++;
          }
        }
      }
      if (rows.length < PAGE) break;
    }
  }

  return NextResponse.json({ ok: true, mode: apply ? 'apply' : 'dry_run', keyReady, report });
}
