// gymIQ edge function: club-bank-sync
//
// Deployed to Supabase project fugixpfgwhnmhtttdzym (gymIQ), NOT to the
// Paybacker project. A copy lives here purely so the code is reviewable
// in version control alongside the Paybacker-side changes it depends on
// (balance_sync_enabled + the dedupe_key field on /api/mcp/transactions).
// It is not imported by the Paybacker app and is not part of its build.
//
// What it does
// ------------
// Pulls the club's real bank position out of Paybacker over HTTPS using a
// scoped, read-only pbk_ MCP token, and mirrors it into gymIQ:
//
//   GET {base}/api/mcp/accounts      -> club_bank_accounts   (balances)
//   GET {base}/api/mcp/transactions  -> club_bank_transactions (ledger)
//
// Paybacker remains the AISP surface: it holds the Yapily consent, the
// encrypted consent token, the 90-day PSD2 reconfirmation clock and the
// sync cron. This function never touches Yapily directly and never writes
// back to Paybacker.
//
// Idempotency is on (gym_id, source, dedupe_key), where dedupe_key is
// Paybacker's stable_tx_hash. Yapily reissues its own transaction ids
// across calls, so keying on those would reinsert phantom duplicates —
// the exact bug Paybacker's 2026-04-28 upsert rewrite fixed.
//
// Auth: verify_jwt = true, so the Supabase gateway requires a project JWT.
// Callers pass the service role key. No custom secret to rotate.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEFAULT_GYM_SLUG = 'energie-hoddesdon';
// 35 days covers a full month plus the énergie Wednesday-to-Friday lag,
// so a couple of missed runs still self-heal without a manual backfill.
const DEFAULT_LOOKBACK_DAYS = 35;
const MAX_LOOKBACK_DAYS = 730;
const PAGE_LIMIT = 500; // /api/mcp/transactions hard-caps at 500

interface McpTransaction {
  date: string;
  description: string;
  merchant: string;
  amount_gbp: number;
  category: string;
  type: string;
  recurring: boolean;
  transaction_id: string;
  dedupe_key: string | null;
  account_ref: string | null;
}

/**
 * One entry of /api/mcp/accounts. Note the shape: that route flattens
 * connections into ACCOUNTS, but balances are stored per CONNECTION and
 * repeated on every account row (balance_scope: 'connection'). A
 * two-account connection therefore reports the same balance twice —
 * summing the rows naively would double the club's cash. Everything
 * below groups by connection_id first for that reason.
 *
 * There is no raw account id in the response by design; account_ref is a
 * masked reference only.
 */
interface McpAccount {
  connection_id: string;
  account_ref: string | null;
  display_name: string | null;
  account_type?: string | null;
  institution: string | null;
  institution_id?: string | null;
  is_business?: boolean;
  connection_status: string | null;
  consent_status: string | null;
  sync_enabled?: boolean;
  last_synced_at: string | null;
  balance_class?: string;
  balance_scope?: string;
  current_balance_gbp: number | null;
  available_balance_gbp: number | null;
  balance_updated_at: string | null;
  transaction_count?: number;
  last_transaction_at?: string | null;
}

/**
 * Bucket a bank line into the cash streams the weekly scorecard reasons
 * about. Deliberately conservative: anything unrecognised lands in
 * 'other' rather than being force-fitted, so a misclassification never
 * silently distorts the énergie payout figure.
 *
 * Order matters — the first match wins, so the specific patterns
 * (franchise royalty, VAT) sit above the general ones.
 */
function classifyCashStream(description: string, merchant: string, amount: number): string {
  const text = `${description} ${merchant}`.toLowerCase();
  const isCredit = amount > 0;

  if (/\b(vat|hmrc vat)\b/.test(text)) return 'vat';
  if (/(royalt|franchise|bdl)/.test(text)) return 'franchise';
  if (/iwoca/.test(text)) return 'iwoca';
  if (/(stripe)/.test(text)) return isCredit ? 'stripe' : 'other';
  if (/(square|sq \*|squareup)/.test(text)) return isCredit ? 'square' : 'other';
  // énergie central pays the weekly 80% and the following-month balance.
  // Accented and unaccented spellings both occur on statements.
  if (/(energie|énergie|efi ltd|energie fitness)/.test(text)) {
    return isCredit ? 'energie_payout' : 'franchise';
  }
  if (/(rent|landlord|lease)/.test(text)) return 'rent';
  if (/(payroll|wages|salary|paye|nest pension|pension)/.test(text)) return 'payroll';
  if (/(business rates|council)/.test(text)) return 'rates';
  if (/(british gas|edf|eon|e\.on|octopus|npower|water|thames water|utilit)/.test(text)) {
    return 'utilities';
  }
  if (/(glofox|perfectgym|technogym|matrix fitness)/.test(text)) return 'systems_equipment';
  return 'other';
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let gymId: string | null = null;

  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}));
    }

    const gymSlug = String(body.gym_slug ?? url.searchParams.get('gym_slug') ?? DEFAULT_GYM_SLUG);
    const lookbackDays = Math.min(
      Number(body.lookback_days ?? url.searchParams.get('lookback_days') ?? DEFAULT_LOOKBACK_DAYS) ||
        DEFAULT_LOOKBACK_DAYS,
      MAX_LOOKBACK_DAYS,
    );

    // ── Resolve the gym ──────────────────────────────────────────────
    const { data: gym, error: gymErr } = await supabase
      .from('gyms')
      .select('id, name')
      .eq('slug', gymSlug)
      .single();

    if (gymErr || !gym) {
      return Response.json({ ok: false, error: `unknown gym slug: ${gymSlug}` }, { status: 404 });
    }
    gymId = gym.id;

    // ── Resolve the Paybacker credential ─────────────────────────────
    const { data: cred } = await supabase
      .from('club_bank_credentials')
      .select('token, base_url, expires_at')
      .eq('gym_id', gymId)
      .eq('provider', 'paybacker')
      .eq('is_active', true)
      .maybeSingle();

    if (!cred?.token) {
      throw new Error(
        'no active Paybacker credential for this gym — mint a read token at /dashboard/settings/mcp and insert it into club_bank_credentials',
      );
    }

    if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
      throw new Error(
        `Paybacker MCP token expired ${cred.expires_at} — mint a replacement at /dashboard/settings/mcp`,
      );
    }

    const base = (cred.base_url ?? 'https://paybacker.co.uk').replace(/\/$/, '');
    const authHeaders = {
      Authorization: `Bearer ${cred.token}`,
      Accept: 'application/json',
    };

    // ── 1. Accounts + balances ───────────────────────────────────────
    const accountsRes = await fetch(`${base}/api/mcp/accounts`, { headers: authHeaders });
    if (!accountsRes.ok) {
      const detail = await accountsRes.text().catch(() => '');
      throw new Error(`GET /api/mcp/accounts -> ${accountsRes.status} ${detail.slice(0, 300)}`);
    }
    const accountsPayload = await accountsRes.json();
    const accountRows: McpAccount[] = accountsPayload.accounts ?? [];

    if (accountRows.length === 0) {
      throw new Error('Paybacker returned no accounts — is the bank still connected?');
    }

    // ── Version guard ────────────────────────────────────────────────
    //
    // This function depends on three fields added to the Paybacker MCP
    // surface on 23 Aug 2026: balance_class and per-account balance_scope
    // on /api/mcp/accounts, and dedupe_key + account_ref on
    // /api/mcp/transactions.
    //
    // Against an older deployment the account_ref filter is silently
    // IGNORED and dedupe_key comes back undefined, so every line gets
    // dropped and the run logs a cheerful success with zero rows. That
    // failure is indistinguishable from a quiet trading week, which is
    // precisely the mode this whole feed is supposed to protect against.
    // Fail loudly instead.
    const supportsAccountGrain = accountRows.some((a) => a.balance_class !== undefined);
    if (!supportsAccountGrain) {
      throw new Error(
        'Paybacker deployment is out of date: /api/mcp/accounts returned no balance_class, ' +
          'so accounts cannot be separated and the account_ref transaction filter will be ignored. ' +
          'Deploy the 23 Aug 2026 MCP changes before enabling this feed.',
      );
    }

    // ── Decide which account is the trading one ──────────────────────
    //
    // The operating account is whichever CASH account carries the real
    // volume. On the JPG connection that is unambiguous: the current
    // account has ~1,794 transactions against 3-41 on the others.
    //
    // Volume is the signal rather than account_type because HSBC returns
    // the same display name for all four accounts, and until per-account
    // types are flowing through Paybacker, type alone cannot separate
    // them. A liability account can never win regardless of volume.
    const eligible = accountRows.filter((a) => a.balance_class !== 'liability');
    const pool = eligible.length > 0 ? eligible : accountRows;
    const operating = pool.reduce((best, a) =>
      (a.transaction_count ?? 0) > (best.transaction_count ?? 0) ? a : best,
    );

    // Refuse to guess when nothing stands out. Picking the wrong account
    // would put credit card spend into the club's cash flow, which is
    // worse than reporting a failure.
    const runnerUp = pool
      .filter((a) => a.account_ref !== operating.account_ref)
      .reduce((m, a) => Math.max(m, a.transaction_count ?? 0), 0);

    if ((operating.transaction_count ?? 0) < runnerUp * 2) {
      throw new Error(
        `cannot identify the operating account with confidence: top account has ${operating.transaction_count} transactions vs ${runnerUp} for the next. Set club_bank_accounts.is_operating manually.`,
      );
    }

    let balanceAsOf: string | null = null;
    let operatingMirrorId: string | null = null;
    const operatingRef = operating.account_ref;

    for (const acct of accountRows) {
      const isOperating = acct.account_ref === operatingRef;

      const row = {
        gym_id: gymId,
        source: 'paybacker_yapily',
        external_connection_id: String(acct.connection_id),
        external_account_ref: acct.account_ref,
        bank_name: acct.institution ?? acct.institution_id ?? null,
        account_label: acct.display_name ?? acct.account_ref,
        account_type: acct.account_type ?? null,
        balance_class: acct.balance_class ?? 'unknown',
        is_operating: isOperating,
        transaction_count: acct.transaction_count ?? null,
        current_balance: acct.current_balance_gbp,
        available_balance: acct.available_balance_gbp,
        balance_as_of: acct.balance_updated_at,
        consent_status: acct.consent_status ?? acct.connection_status ?? null,
        last_synced_at: acct.last_synced_at ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data: upserted, error: acctErr } = await supabase
        .from('club_bank_accounts')
        .upsert(row, {
          onConflict: 'gym_id,source,external_connection_id,external_account_ref',
        })
        .select('id')
        .single();

      if (acctErr) throw new Error(`account mirror failed: ${acctErr.message}`);

      if (isOperating) {
        operatingMirrorId = upserted?.id ?? null;
        balanceAsOf = acct.balance_updated_at ?? null;
      }
    }

    // ── 2. Transactions ──────────────────────────────────────────────
    const until = new Date();
    const since = new Date(until.getTime() - lookbackDays * 86400_000);

    // Operating account ONLY. Two things go wrong without this filter:
    // card debt lands in the club's operating spend, and the connection's
    // two credit card accounts mirror each other's lines, so the same
    // purchase would be counted twice.
    const txRes = await fetch(
      `${base}/api/mcp/transactions?since=${isoDate(since)}&until=${isoDate(until)}` +
        `&limit=${PAGE_LIMIT}&account_ref=${encodeURIComponent(operatingRef ?? '')}`,
      { headers: authHeaders },
    );
    if (!txRes.ok) {
      const detail = await txRes.text().catch(() => '');
      throw new Error(`GET /api/mcp/transactions -> ${txRes.status} ${detail.slice(0, 300)}`);
    }
    const txPayload = await txRes.json();
    const transactions: McpTransaction[] = txPayload.transactions ?? [];

    const rows = transactions
      .filter((t) => {
        // Belt and braces on top of the server-side account_ref filter:
        // if Paybacker ever returns a line from another account, drop it
        // rather than let it into the club's cash flow.
        if (operatingRef && t.account_ref && t.account_ref !== operatingRef) {
          return false;
        }
        // Without a dedupe_key we cannot guarantee idempotency, and a
        // duplicated bank line silently inflates banked cash. Dropping is
        // the safe failure: the next run picks it up once Paybacker has
        // backfilled the hash.
        if (!t.dedupe_key) {
          console.warn(`[club-bank-sync] skipping tx with no dedupe_key: ${t.transaction_id}`);
          return false;
        }
        return true;
      })
      .map((t) => {
        const amount = Number(t.amount_gbp ?? 0);
        return {
          gym_id: gymId,
          account_id: operatingMirrorId,
          account_ref: t.account_ref ?? operatingRef,
          source: 'paybacker_yapily',
          dedupe_key: t.dedupe_key!,
          booked_on: t.date,
          description: t.description ?? '',
          merchant: t.merchant ?? '',
          amount,
          direction: amount >= 0 ? 'in' : 'out',
          category: t.category ?? null,
          cash_stream: classifyCashStream(t.description ?? '', t.merchant ?? '', amount),
          is_recurring: !!t.recurring,
        };
      });

    let inserted = 0;
    if (rows.length > 0) {
      // ignoreDuplicates: an already-mirrored line must not be rewritten,
      // otherwise a manual cash_stream correction made in gymIQ would be
      // clobbered on every subsequent run.
      const { data: written, error: txErr } = await supabase
        .from('club_bank_transactions')
        .upsert(rows, { onConflict: 'gym_id,source,dedupe_key', ignoreDuplicates: true })
        .select('id');

      if (txErr) throw new Error(`mirror insert failed: ${txErr.message}`);
      inserted = written?.length ?? 0;
    }

    await supabase.from('club_bank_sync_log').insert({
      gym_id: gymId,
      status: 'success',
      transactions_seen: transactions.length,
      transactions_new: inserted,
      balance_as_of: balanceAsOf,
      window_from: isoDate(since),
      window_to: isoDate(until),
    });

    return Response.json({
      ok: true,
      gym: gym.name,
      accounts: accountRows.length,
      operating_account: {
        ref: operatingRef,
        type: operating.account_type ?? null,
        transaction_count: operating.transaction_count ?? null,
      },
      transactions_seen: transactions.length,
      transactions_new: inserted,
      balance_as_of: balanceAsOf,
      window: { from: isoDate(since), to: isoDate(until) },
      took_ms: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[club-bank-sync]', message);

    if (gymId) {
      await supabase.from('club_bank_sync_log').insert({
        gym_id: gymId,
        status: 'failed',
        error_message: message.slice(0, 1000),
      });
    }

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
