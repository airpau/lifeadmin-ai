import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/encrypt';
import { getAccounts, getTransactionsPage, getAllTransactions } from '@/lib/yapily';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/yapily/debug-tx-test?connectionId=<uuid>&accountId=<optional>&raw=1
 * Auth: Bearer ${CRON_SECRET}
 *
 * Diagnostic surface for "why is the sync pulling 0 transactions"
 * regressions. Returns:
 *
 *   - connection metadata as stored in bank_connections
 *   - /accounts response (or its error)
 *   - For each account (or just the one specified): a SINGLE page
 *     fetched from Yapily with the same window the cron uses, plus
 *     the pagination meta — so the upstream's page-size and
 *     pagination behaviour are observable in one call. With ?raw=1
 *     a few sample raw transactions are echoed back.
 *   - For each account: the count returned by the paginating walk
 *     (getAllTransactions) so the difference between "first page"
 *     and "full window" is obvious in the response.
 *
 * This is strictly diagnostic — DELETE OR DISABLE once the May
 * 2026 regression is closed out. The endpoint still hits Yapily so
 * it does count toward the daily API ceiling.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const connectionId = url.searchParams.get('connectionId');
  const accountIdFilter = url.searchParams.get('accountId');
  const wantRaw = url.searchParams.get('raw') === '1';
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId query required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conn, error: connErr } = await supabase
    .from('bank_connections')
    .select(
      'id, user_id, bank_name, institution_id, consent_token, account_ids, account_identifications_hashes, account_display_names, yapily_consent_id, yapily_consent_request_id, consent_expires_at, status, last_synced_at',
    )
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

  const storedHashes: string[] = Array.isArray(conn.account_identifications_hashes)
    ? conn.account_identifications_hashes
    : [];

  const result: Record<string, unknown> = {
    connectionId: conn.id,
    userId: conn.user_id,
    bankName: conn.bank_name,
    institution: conn.institution_id,
    status: conn.status,
    consentExpiresAt: conn.consent_expires_at,
    lastSyncedAt: conn.last_synced_at,
    accountIds: conn.account_ids,
    accountDisplayNames: conn.account_display_names,
    storedHashesPresent: storedHashes.map((h) => (h ? h.slice(0, 8) + '…' : '<empty>')),
    storedHashesAllPresent: storedHashes.length > 0 && storedHashes.every((h) => !!h),
    yapilyConsentId: conn.yapily_consent_id,
    yapilyConsentRequestId: conn.yapily_consent_request_id,
    tokenLength: consentToken?.length ?? 0,
    tokenStart: consentToken?.slice(0, 32) ?? null,
  };

  // /accounts baseline
  try {
    const accounts = await getAccounts(consentToken);
    result.accounts_status = 'ok';
    result.accounts_count = accounts.length;
    result.accounts_sample = accounts.slice(0, 4).map((a) => ({
      id: a.id,
      type: a.type,
      accountType: a.accountType,
      identCount: a.accountIdentifications?.length ?? 0,
      currency: a.currency,
      institution: a.institution?.name,
    }));
  } catch (err) {
    const e = err as Error & { status?: number; tracingId?: string };
    result.accounts_status = 'error';
    result.accounts_error = e.message;
    result.accounts_status_code = e.status;
    result.accounts_tracingId = e.tracingId;
    return NextResponse.json(result, { status: 200 });
  }

  // Same window the cron uses.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const from = ninetyDaysAgo.toISOString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const before = tomorrow.toISOString();
  result.window = { from, before };

  const candidateIds = (conn.account_ids ?? []) as string[];
  const accountsToTest = accountIdFilter
    ? candidateIds.filter((a) => a === accountIdFilter)
    : candidateIds;

  const txResults: Array<Record<string, unknown>> = [];
  for (const accountId of accountsToTest) {
    const perAccount: Record<string, unknown> = { accountId };
    // First page only — exposes Yapily's pagination meta.
    try {
      const page = await getTransactionsPage(accountId, consentToken, {
        from,
        before,
        limit: 1000,
      });
      perAccount.firstPage_status = 'ok';
      perAccount.firstPage_count = page.data.length;
      perAccount.firstPage_meta = page.meta ?? null;
      if (page.data.length > 0) {
        const dates = page.data
          .map((t) => t.bookingDateTime || t.date)
          .filter((d): d is string => !!d)
          .sort();
        perAccount.firstPage_earliest = dates[0];
        perAccount.firstPage_latest = dates[dates.length - 1];
        if (wantRaw) {
          perAccount.firstPage_rawSample = page.data.slice(0, 3);
        } else {
          perAccount.firstPage_sample = page.data.slice(0, 3).map((t) => ({
            id: t.id,
            date: t.bookingDateTime || t.date,
            amount: t.transactionAmount?.amount ?? t.amount,
            currency: t.transactionAmount?.currency ?? t.currency,
            indicator: t.creditDebitIndicator ?? null,
            description: t.description,
            merchant: t.merchantName,
          }));
        }
      }
    } catch (err) {
      const e = err as Error & { status?: number; tracingId?: string };
      perAccount.firstPage_status = 'error';
      perAccount.firstPage_statusCode = e.status;
      perAccount.firstPage_error = e.message;
      perAccount.firstPage_tracingId = e.tracingId;
    }

    // Full paginated walk — this is what the cron + sync-now now use.
    try {
      const all = await getAllTransactions(accountId, consentToken, { from, before });
      perAccount.paginated_status = 'ok';
      perAccount.paginated_count = all.length;
      // Surface the most recent few so Paul can confirm e.g. the
      // British Gas debit is in there.
      perAccount.paginated_latest_three = all
        .map((t) => ({
          date: t.bookingDateTime || t.date,
          amount: t.transactionAmount?.amount ?? t.amount,
          indicator: t.creditDebitIndicator ?? null,
          description: t.description,
          merchant: t.merchantName,
        }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 3);
    } catch (err) {
      const e = err as Error & { status?: number; tracingId?: string };
      perAccount.paginated_status = 'error';
      perAccount.paginated_statusCode = e.status;
      perAccount.paginated_error = e.message;
      perAccount.paginated_tracingId = e.tracingId;
    }

    txResults.push(perAccount);
  }
  result.tx_results = txResults;
  return NextResponse.json(result, { status: 200 });
}
