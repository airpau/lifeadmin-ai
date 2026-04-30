/**
 * GET /api/money-hub/ledger
 *
 * Emma-style transactions ledger feed. Paginated, chronological
 * (newest-first), date-grouped on the client. Supports filtering by
 * category, account, and free-text search; date-range cap optional.
 *
 * Different from /api/money-hub/transactions which is month-bounded
 * and aggregates merchants for the spending dashboard. This endpoint
 * is designed for browsing — users scrolling back through their
 * spending history transaction by transaction.
 *
 * Query params:
 *   - cursor    ISO timestamp; rows older than this are returned. Use
 *               for infinite-scroll pagination.
 *   - limit     Page size, default 50, max 200.
 *   - category  Spending category filter (resolved spending category,
 *               not raw user_category). Multiple via comma.
 *   - account   bank_connections.id filter. Multiple via comma.
 *   - q         Free-text search across description + merchant_name.
 *   - kind      'spending' | 'income' | 'transfer' — restrict by
 *               classification.
 *   - from      ISO date floor (oldest allowed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  applyInternalTransferHeuristic,
  buildMoneyHubOverrideMaps,
  findMatchingCategoryOverride,
  normalizeSpendingCategoryKey,
  resolveMoneyHubTransaction,
} from '@/lib/money-hub-classification';
import { loadLearnedRules } from '@/lib/learning-engine';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(MAX_LIMIT, Math.max(1, limitParam)) : DEFAULT_LIMIT;
    const categories = (searchParams.get('category') ?? '').split(',').filter(Boolean);
    const accounts = (searchParams.get('account') ?? '').split(',').filter(Boolean);
    const q = searchParams.get('q')?.trim() ?? '';
    const kind = searchParams.get('kind');
    const from = searchParams.get('from');

    const sb = admin();

    let query = sb
      .from('bank_transactions')
      .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type, account_id')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
      // Pull MORE than the requested page — the resolver below filters
      // by 'kind' / category client-side because that classification
      // is computed at runtime, not stored. Limit ×3 keeps it bounded.
      .limit(limit * 3 + 50);

    if (cursor) {
      query = query.lt('timestamp', cursor);
    }
    if (from) {
      query = query.gte('timestamp', from);
    }
    if (accounts.length > 0) {
      query = query.in('account_id', accounts);
    }
    if (q) {
      const term = `%${q}%`;
      query = query.or(`merchant_name.ilike.${term},description.ilike.${term}`);
    }

    const [{ data: txns }, { data: overrideRows }, { data: bankConns }] = await Promise.all([
      query,
      sb.from('money_hub_category_overrides')
        .select('merchant_pattern, transaction_id, user_category')
        .eq('user_id', user.id),
      sb.from('bank_connections')
        .select('id, bank_name, account_name')
        .eq('user_id', user.id),
    ]);

    await loadLearnedRules();
    const overrides = buildMoneyHubOverrideMaps(overrideRows ?? []);
    const internalTransfers = applyInternalTransferHeuristic(txns ?? []);

    // Resolve + filter — done client-side because kind/category are
    // computed, not stored.
    const resolved = (txns ?? []).map((txn) => {
      const overrideCategory = findMatchingCategoryOverride(
        txn,
        overrides.transactionOverrides,
        overrides.merchantOverrides,
      );
      const r = resolveMoneyHubTransaction(txn, overrideCategory);
      if (internalTransfers.has(txn.id)) {
        r.kind = 'transfer';
        r.spendingCategory = 'transfers';
      }
      return {
        id: txn.id as string,
        amount: parseFloat(String(txn.amount)) || 0,
        description: (txn.description as string) ?? '',
        merchant_name: (txn.merchant_name as string | null) ?? null,
        timestamp: txn.timestamp as string,
        account_id: (txn.account_id as string | null) ?? null,
        user_category: (txn.user_category as string | null) ?? null,
        kind: r.kind,
        spendingCategory: r.spendingCategory ?? null,
        incomeType: r.incomeType ?? null,
      };
    });

    let filtered = resolved;
    if (kind) filtered = filtered.filter((t) => t.kind === kind);
    if (categories.length > 0) {
      filtered = filtered.filter((t) => {
        const tc = normalizeSpendingCategoryKey(t.spendingCategory) ?? null;
        return tc !== null && categories.includes(tc);
      });
    }

    const page = filtered.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1].timestamp : null;

    return NextResponse.json({
      transactions: page,
      nextCursor,
      hasMore: nextCursor !== null,
      accounts: (bankConns ?? []).map((b) => ({
        id: b.id as string,
        bank_name: (b.bank_name as string) ?? '',
        account_name: (b.account_name as string | null) ?? null,
      })),
    });
  } catch (err: any) {
    console.error('[money-hub/ledger]', err.message);
    return NextResponse.json({ error: err.message ?? 'Failed to load' }, { status: 500 });
  }
}
