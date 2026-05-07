import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/encrypt';
import { getAccounts, getTransactions } from '@/lib/yapily';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/yapily/debug-tx-test?connectionId=<uuid>
 * Auth: Bearer ${CRON_SECRET}
 *
 * Surfaces the exact error from getTransactions for a connection,
 * so we can diagnose why initial-sync silently logged 0 api_calls
 * after the 6 May HSBC smoke test. Strictly diagnostic — DELETE THIS
 * AFTER USE.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const connectionId = new URL(request.url).searchParams.get('connectionId');
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId query required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conn, error: connErr } = await supabase
    .from('bank_connections')
    .select('id, bank_name, institution_id, consent_token, account_ids, yapily_consent_id, yapily_consent_request_id')
    .eq('id', connectionId)
    .single();
  if (connErr || !conn) {
    return NextResponse.json({ error: connErr?.message || 'connection not found' }, { status: 404 });
  }

  let consentToken: string;
  try {
    consentToken = decrypt(conn.consent_token);
  } catch (err) {
    return NextResponse.json({ stage: 'decrypt', error: String(err) }, { status: 500 });
  }

  const result: Record<string, unknown> = {
    connectionId: conn.id,
    institution: conn.institution_id,
    accountIds: conn.account_ids,
    yapilyConsentId: conn.yapily_consent_id,
    yapilyConsentRequestId: conn.yapily_consent_request_id,
    tokenLength: consentToken?.length ?? 0,
    tokenStart: consentToken?.slice(0, 32) ?? null,
  };

  // Try /accounts to confirm token validity baseline
  try {
    const accounts = await getAccounts(consentToken);
    result.accounts_status = 'ok';
    result.accounts_count = accounts.length;
    result.accounts_sample = accounts.slice(0, 4).map((a) => ({
      id: a.id,
      type: a.type,
      accountType: a.accountType,
      hasIdents: (a.accountIdentifications?.length ?? 0) > 0,
    }));
  } catch (err) {
    const e = err as Error & { status?: number; tracingId?: string };
    result.accounts_status = 'error';
    result.accounts_error = e.message;
    result.accounts_status_code = e.status;
    result.accounts_tracingId = e.tracingId;
    return NextResponse.json(result, { status: 200 });
  }

  // Try /transactions for each account, capturing per-account errors
  const today = new Date();
  const ninety = new Date(today.getTime() - 89 * 86400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86400_000).toISOString().slice(0, 10);
  const txResults: Array<Record<string, unknown>> = [];
  for (const accountId of conn.account_ids ?? []) {
    try {
      const txns = await getTransactions(accountId, consentToken, ninety, tomorrow);
      txResults.push({ accountId, status: 'ok', count: txns.length });
    } catch (err) {
      const e = err as Error & { status?: number; tracingId?: string };
      txResults.push({
        accountId,
        status: 'error',
        statusCode: e.status,
        message: e.message,
        tracingId: e.tracingId,
      });
    }
  }
  result.tx_results = txResults;
  return NextResponse.json(result, { status: 200 });
}
