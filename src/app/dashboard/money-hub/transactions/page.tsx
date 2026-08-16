'use client';

/**
 * /dashboard/money-hub/transactions — Emma-style transactions ledger.
 *
 * Date-grouped chronological feed, infinite-scroll, with:
 *   - Filters (kind / category / account)
 *   - Free-text search
 *   - Inline single-tx recategorise
 *   - Bulk-select multi-tx recategorise
 *   - "Always categorise <merchant> as <category>" — one-click rule
 *
 * The recategorise paths reuse /api/money-hub/recategorise which
 * handles per-transaction, per-merchant-pattern, and apply-to-all
 * with the existing learning-engine + override table.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Loader2,
  Check,
  ChevronDown,
  X,
  Zap,
  Plus,
} from 'lucide-react';
import {
  CATEGORIES_BY_GROUP,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  type Category,
} from '@/lib/categories';

interface LedgerTx {
  id: string;
  amount: number;
  description: string;
  merchant_name: string | null;
  timestamp: string;
  account_id: string | null;
  user_category: string | null;
  user_subcategory?: string | null;
  kind: 'spending' | 'income' | 'transfer' | 'unknown';
  spendingCategory: string | null;
  incomeType: string | null;
}

interface LedgerResponse {
  transactions: LedgerTx[];
  nextCursor: string | null;
  hasMore: boolean;
  accounts: Array<{ id: string; bank_name: string; account_name: string | null }>;
}

interface UserSubcategory {
  id: string;
  parent_category: Category;
  name: string;
  emoji: string | null;
}

/** Flat list for the filter pill bar — keeps the chips compact. */
const FILTER_PILL_CATEGORIES = [
  'rent', 'mortgage', 'groceries', 'eating_out', 'transport', 'energy',
  'broadband', 'mobile',
] as const;

const fmtAmount = (n: number) => {
  const abs = Math.abs(n);
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(abs);
};

function formatDateHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TransactionsLedgerPage() {
  const [items, setItems] = useState<LedgerTx[]>([]);
  const [accounts, setAccounts] = useState<LedgerResponse['accounts']>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Filters / search
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [kind, setKind] = useState<'all' | 'spending' | 'income' | 'transfer'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);

  // Selection / mutation
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recatBusy, setRecatBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Non-blocking inline error — replaces the old native alert() which froze
  // the whole page on mobile and lost the user's scroll position.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tier-2 user-defined subcategories (loaded once, refreshed after edits)
  const [userSubcats, setUserSubcats] = useState<UserSubcategory[]>([]);
  const refreshSubcats = useCallback(async () => {
    try {
      const res = await fetch('/api/money-hub/user-categories', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setUserSubcats(json.subcategories ?? []);
    } catch {
      /* silent */
    }
  }, []);
  useEffect(() => { refreshSubcats(); }, [refreshSubcats]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch reset whenever filters change
  const fetchPage = useCallback(async (resetCursor: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!resetCursor && cursor) params.set('cursor', cursor);
      params.set('limit', '60');
      if (kind !== 'all') params.set('kind', kind);
      if (categoryFilter.length > 0) params.set('category', categoryFilter.join(','));
      if (accountFilter.length > 0) params.set('account', accountFilter.join(','));
      if (debouncedQ) params.set('q', debouncedQ);

      const res = await fetch(`/api/money-hub/ledger?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json: LedgerResponse = await res.json();
      setAccounts(json.accounts);
      setItems((prev) => (resetCursor ? json.transactions : [...prev, ...json.transactions]));
      setCursor(json.nextCursor);
      setHasMore(json.hasMore);
    } catch (e) {
      console.warn('[ledger] fetch failed', e);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [cursor, kind, categoryFilter, accountFilter, debouncedQ]);

  // Reset on filter change
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setSelected(new Set());
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, categoryFilter, accountFilter, debouncedQ]);

  // Infinite scroll observer
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || loading || initialLoading) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) fetchPage(false);
    }, { rootMargin: '300px' });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, initialLoading, fetchPage]);

  // Group items by calendar date
  const grouped = useMemo(() => {
    const out = new Map<string, LedgerTx[]>();
    for (const t of items) {
      const d = t.timestamp.slice(0, 10);
      const arr = out.get(d) ?? [];
      arr.push(t);
      out.set(d, arr);
    }
    return Array.from(out.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [items]);

  /**
   * Patch already-loaded rows in place after a successful recategorise.
   *
   * The old behaviour cleared `items` and refetched from the top, which threw
   * the user back to the start of an infinite-scroll list every time they
   * relabelled a transaction — the single worst mobile bug on this page.
   * Patching in place keeps scroll position and the loaded pages intact.
   */
  const patchItems = useCallback(
    (match: (t: LedgerTx) => boolean, newCategory: string, sub: string | null) => {
      setItems((prev) =>
        prev.map((t) =>
          match(t)
            ? {
                ...t,
                user_category: newCategory,
                spendingCategory: newCategory,
                user_subcategory: sub,
              }
            : t,
        ),
      );
    },
    [],
  );

  // Recategorise actions
  async function recategorise(opts: {
    transactionId?: string;
    merchantPattern?: string;
    newCategory: string;
    applyToAll?: boolean;
    userSubcategory?: string | null;
  }) {
    setRecatBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/money-hub/recategorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'failed');

      // Patch in place — never reset the list (see patchItems).
      const sub = opts.userSubcategory ?? null;
      if (opts.transactionId) {
        patchItems((t) => t.id === opts.transactionId, opts.newCategory, sub);
      } else if (opts.merchantPattern) {
        const pattern = opts.merchantPattern.trim().toLowerCase();
        patchItems(
          (t) => (t.merchant_name ?? t.description ?? '').trim().toLowerCase() === pattern,
          opts.newCategory,
          sub,
        );
      }
      setEditingId(null);
      setBulkOpen(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Recategorise failed — please retry.');
    } finally {
      setRecatBusy(false);
    }
  }

  async function createUserSubcategory(parent: string, name: string, emoji?: string) {
    const res = await fetch('/api/money-hub/user-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent, name, emoji }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed to create subcategory');
    }
    await refreshSubcats();
  }

  async function bulkRecategorise(newCategory: string) {
    if (selected.size === 0) return;
    setRecatBusy(true);
    setErrorMsg(null);
    try {
      const ids = Array.from(selected);
      const failed: string[] = [];
      // Run in parallel up to 5 at a time so the UI stays responsive
      const batchSize = 5;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (id) => {
          try {
            const res = await fetch('/api/money-hub/recategorise', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactionId: id, newCategory }),
            });
            return res.ok ? null : id;
          } catch {
            return id;
          }
        }));
        for (const r of results) if (r) failed.push(r);
      }

      // Patch only the rows that actually succeeded — no list reset.
      const failedSet = new Set(failed);
      const okIds = new Set(ids.filter((id) => !failedSet.has(id)));
      if (okIds.size > 0) patchItems((t) => okIds.has(t.id), newCategory, null);
      setSelected(new Set());
      setBulkOpen(false);
      if (failed.length > 0) {
        setErrorMsg(
          `${failed.length} of ${ids.length} transactions couldn't be recategorised. Please retry.`,
        );
      }
    } catch {
      setErrorMsg('Bulk recategorise failed — please retry.');
    } finally {
      setRecatBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <Link href="/dashboard/money-hub" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Money Hub
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Transactions</h1>
        <p className="text-slate-600 text-sm mt-1">
          Every transaction across your connected accounts. Click any row to recategorise.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/60 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search merchant or description..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All</option>
            <option value="spending">Spending</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTER_PILL_CATEGORIES.map((key) => {
            const on = categoryFilter.includes(key);
            return (
              <button
                key={key}
                onClick={() =>
                  setCategoryFilter((prev) =>
                    on ? prev.filter((k) => k !== key) : [...prev, key],
                  )
                }
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  on ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {CATEGORY_LABELS[key]}
              </button>
            );
          })}
          {accounts.length > 1 && accounts.map((a) => {
            const on = accountFilter.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() =>
                  setAccountFilter((prev) =>
                    on ? prev.filter((k) => k !== a.id) : [...prev, a.id],
                  )
                }
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  on ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {a.bank_name}
              </button>
            );
          })}
          {(categoryFilter.length > 0 || accountFilter.length > 0) && (
            <button
              onClick={() => { setCategoryFilter([]); setAccountFilter([]); }}
              className="px-3 py-1 rounded-full text-xs font-medium border border-slate-200 text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Inline error — non-blocking, replaces the old native alert() */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
            className="shrink-0 text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk action bar — sits below the sticky mobile header (~52px) so it
          never slides underneath it. */}
      {selected.size > 0 && (
        <div className="sticky top-16 sm:top-2 z-[45] flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-900">
            {selected.size} selected
          </span>
          <div className="relative">
            <button
              onClick={() => setBulkOpen((v) => !v)}
              disabled={recatBusy}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-60 inline-flex items-center gap-1"
            >
              {recatBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Recategorise
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {bulkOpen && (
              <div className="absolute right-0 mt-1 w-64 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-[60vh] sm:max-h-80 overflow-y-auto overscroll-contain">
                {Object.entries(CATEGORIES_BY_GROUP).map(([group, cats]) => (
                  <div key={group}>
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                      {group}
                    </div>
                    {cats.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => bulkRecategorise(c.id)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                      >
                        <span aria-hidden>{c.emoji}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      {initialLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center">
          <p className="text-slate-500">No transactions match your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txs]) => {
            const dayTotal = txs.reduce((s, t) => s + (t.kind === 'spending' ? Math.abs(t.amount) : 0), 0);
            return (
              // overflow-hidden only exists to clip the header/last-row tint to
              // the rounded corners. On sm+ we need overflow-visible so the
              // row-anchored recategorise panel isn't clipped, so the rounding
              // is re-applied on the header and last row instead.
              <section key={date} className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden sm:overflow-visible">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between sm:rounded-t-2xl">
                  <span className="text-sm font-semibold text-slate-700">{formatDateHeading(date)}</span>
                  {dayTotal > 0 && (
                    <span className="text-xs text-slate-500">spent {fmtAmount(dayTotal)}</span>
                  )}
                </div>
                <ul>
                  {txs.map((t) => (
                    <Row
                      key={t.id}
                      tx={t}
                      selected={selected.has(t.id)}
                      onToggle={() => toggleSelect(t.id)}
                      subcategories={userSubcats}
                      onCreateSubcategory={createUserSubcategory}
                      onRecategorise={(cat, applyToAll, sub) =>
                        applyToAll
                          ? recategorise({
                              merchantPattern: t.merchant_name ?? t.description,
                              newCategory: cat,
                              userSubcategory: sub ?? null,
                              applyToAll: true,
                            })
                          : recategorise({ transactionId: t.id, newCategory: cat, userSubcategory: sub ?? null })
                      }
                      isEditing={editingId === t.id}
                      onStartEdit={() => setEditingId(t.id)}
                      onCancelEdit={() => setEditingId(null)}
                      busy={recatBusy}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          <div ref={sentinelRef} />
          {loading && (
            <div className="text-center py-6 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Loading more…
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="text-center py-6 text-slate-400 text-xs">— end of history —</div>
          )}
        </div>
      )}
    </div>
  );
}

function categoryLabel(key: string | null): string {
  if (!key) return 'Uncategorised';
  const label = (CATEGORY_LABELS as Record<string, string | undefined>)[key];
  return label ?? key.replace(/_/g, ' ');
}

function Row({
  tx, selected, onToggle, onRecategorise, isEditing, onStartEdit, onCancelEdit, busy, subcategories, onCreateSubcategory,
}: {
  tx: LedgerTx;
  selected: boolean;
  onToggle: () => void;
  onRecategorise: (cat: string, applyToAll: boolean, sub?: string | null) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  busy: boolean;
  subcategories: UserSubcategory[];
  onCreateSubcategory: (parent: string, name: string, emoji?: string) => Promise<void>;
}) {
  const display = tx.merchant_name?.trim() || tx.description?.trim() || 'Unknown';
  const isIncome = tx.kind === 'income';
  const isTransfer = tx.kind === 'transfer';

  return (
    <li className={`relative px-4 py-3 flex items-center gap-1 sm:gap-2 hover:bg-slate-50 transition-colors sm:last:rounded-b-2xl ${selected ? 'bg-emerald-50/50' : ''}`}>
      {/* p-2.5 hit area around the checkbox — the box itself stays 16px but the
          tap target is ~36px so it no longer collides with the row's
          tap-to-edit button on touch. */}
      <label className="-my-2.5 -ml-2 flex shrink-0 cursor-pointer items-center justify-center p-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label="Select transaction"
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      <button
        onClick={onStartEdit}
        className="flex-1 text-left flex items-center gap-3 min-w-0"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">{display}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {isIncome ? (
              <span className="text-emerald-600 font-medium">Income</span>
            ) : isTransfer ? (
              <span className="text-blue-500 font-medium">Transfer</span>
            ) : (
              <span>
                {categoryLabel(tx.spendingCategory)}
                {tx.user_subcategory ? (
                  <span className="text-slate-400"> · {tx.user_subcategory}</span>
                ) : null}
              </span>
            )}
          </div>
        </div>
        <div className={`text-right font-semibold tabular-nums ${isIncome ? 'text-emerald-600' : isTransfer ? 'text-slate-500' : 'text-slate-900'}`}>
          {isIncome ? '+' : tx.amount < 0 ? '-' : ''}{fmtAmount(tx.amount)}
        </div>
      </button>

      {isEditing && (
        <RecategoriseDropdown
          merchant={tx.merchant_name ?? tx.description}
          currentCategory={tx.spendingCategory}
          currentSubcategory={tx.user_subcategory ?? null}
          busy={busy}
          subcategories={subcategories}
          onCreateSubcategory={onCreateSubcategory}
          onPick={(cat, applyToAll, sub) => onRecategorise(cat, applyToAll, sub)}
          onClose={onCancelEdit}
        />
      )}
    </li>
  );
}

function RecategoriseDropdown({
  merchant, currentCategory, currentSubcategory, busy, subcategories, onCreateSubcategory, onPick, onClose,
}: {
  merchant: string;
  currentCategory: string | null;
  currentSubcategory: string | null;
  busy: boolean;
  subcategories: UserSubcategory[];
  onCreateSubcategory: (parent: string, name: string, emoji?: string) => Promise<void>;
  onPick: (category: string, applyToAll: boolean, sub: string | null) => void;
  onClose: () => void;
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  // Once the user picks a parent, expand to show its subcategories and the
  // "Create new" affordance. Null means "no parent picked yet".
  const [stagedParent, setStagedParent] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const subcatsForParent = useMemo(
    () => subcategories.filter((s) => s.parent_category === stagedParent),
    [subcategories, stagedParent],
  );

  async function handleCreate() {
    if (!stagedParent || !newSubName.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      await onCreateSubcategory(stagedParent, newSubName.trim());
      // After creating, immediately apply it to the transaction.
      onPick(stagedParent, applyToAll, newSubName.trim());
      setNewSubName('');
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {/* z-[60] clears the sticky mobile dashboard header (z-40) and the bulk
          bar (z-[45]); the panel itself sits above the backdrop at z-[70]. */}
      <div className="fixed inset-0 z-[60] bg-slate-900/30 sm:bg-transparent" onClick={onClose} />
      <div
        className={
          // Mobile: fixed bottom sheet — immune to any ancestor overflow clip.
          'fixed inset-x-0 bottom-0 z-[70] max-h-[70vh] overflow-y-auto overscroll-contain ' +
          'rounded-t-2xl border border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl ' +
          // sm+: anchored to the row (the <li> is relative, the <section> is
          // overflow-visible at this breakpoint).
          'sm:absolute sm:inset-x-auto sm:right-2 sm:bottom-auto sm:top-full sm:mt-1 sm:w-80 ' +
          'sm:max-w-[calc(100vw-1rem)] sm:max-h-none sm:overflow-visible sm:rounded-xl sm:pb-3 sm:shadow-xl'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {stagedParent
              ? `${CATEGORY_LABELS[stagedParent as Category] ?? stagedParent} — pick label`
              : 'Recategorise'}
          </div>
          {stagedParent && (
            <button
              onClick={() => { setStagedParent(null); setNewSubName(''); setCreateErr(null); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ← back
            </button>
          )}
        </div>

        {!stagedParent && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs text-slate-700 select-none">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Always categorise <strong className="font-semibold">{merchant.slice(0, 28)}</strong> this way</span>
          </label>
        )}

        {/* One scroller per breakpoint: on mobile the sheet itself scrolls, on
            sm+ this inner list does. */}
        <div className="-mx-3 px-1 overflow-visible sm:max-h-72 sm:overflow-y-auto sm:overscroll-contain">
          {!stagedParent && Object.entries(CATEGORIES_BY_GROUP).map(([group, cats]) => (
            <div key={group}>
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                {group}
              </div>
              {cats.map((c) => {
                const isCurrent = c.id === currentCategory && !currentSubcategory;
                const subCount = subcategories.filter((s) => s.parent_category === c.id).length;
                return (
                  <div key={c.id} className="flex items-stretch">
                    <button
                      disabled={busy}
                      onClick={() => onPick(c.id, applyToAll, null)}
                      className={`flex-1 text-left px-2 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${
                        isCurrent
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span aria-hidden>{c.emoji}</span>
                      <span className="flex-1">{c.label}</span>
                      {isCurrent && <Check className="h-3.5 w-3.5" />}
                    </button>
                    {(subCount > 0 || !isCurrent) && (
                      <button
                        title="Pick a custom label under this category"
                        onClick={() => setStagedParent(c.id)}
                        className="px-2 text-slate-400 hover:text-slate-700"
                      >
                        <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {stagedParent && (
            <>
              <button
                disabled={busy}
                onClick={() => onPick(stagedParent, applyToAll, null)}
                className="w-full text-left px-2 py-1.5 text-sm rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-2"
              >
                <span aria-hidden>{CATEGORY_EMOJI[stagedParent as Category]}</span>
                <span className="flex-1">{CATEGORY_LABELS[stagedParent as Category]} (no subcategory)</span>
                {!currentSubcategory && stagedParent === currentCategory && <Check className="h-3.5 w-3.5" />}
              </button>

              {subcatsForParent.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  Your subcategories
                </div>
              )}
              {subcatsForParent.map((s) => {
                const isCurrent = stagedParent === currentCategory && currentSubcategory?.toLowerCase() === s.name.toLowerCase();
                return (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => onPick(stagedParent, applyToAll, s.name)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${
                      isCurrent ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span aria-hidden>{s.emoji ?? '·'}</span>
                    <span className="flex-1">{s.name}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}

              <div className="border-t border-slate-100 mt-2 pt-2 px-2">
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Create a custom label…"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    maxLength={50}
                    className="flex-1 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    disabled={creating || !newSubName.trim()}
                    onClick={handleCreate}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                  >
                    {creating ? '…' : 'Add'}
                  </button>
                </div>
                {createErr && (
                  <div className="mt-1 text-xs text-red-600">{createErr}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
