'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, ChevronDown, Loader2 } from 'lucide-react';
import { fmtNum } from '@/lib/format';
import { CATEGORIES, USER_SELECTABLE_CATEGORIES } from '@/lib/categories';

// ── Canonical category lookup ─────────────────────────────────────────────────
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

function getCatDisplay(id: string | null | undefined): { label: string; emoji: string } {
  if (!id) return { label: 'Uncategorised', emoji: '📋' };
  const found = CAT_MAP[id];
  return found
    ? { label: found.label, emoji: found.emoji }
    : { label: id.replace(/_/g, ' '), emoji: '📋' };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Transaction {
  id: string;
  merchant_name?: string;
  description?: string;
  amount: number;
  category?: string;
  timestamp: string;
  account_id?: string;
  kind?: string;
}

interface CategoryDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string | null;
  incomeType?: string | null;
  searchQuery?: string | null;
  selectedMonth: string;
  onRecategorised: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CategoryDrillDownModal({
  isOpen,
  onClose,
  category,
  incomeType,
  searchQuery,
  selectedMonth,
  onRecategorised,
}: CategoryDrillDownModalProps) {
  const [data, setData] = useState<{ transactions: Transaction[]; merchants: any[]; totalSpent: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recatDropdown, setRecatDropdown] = useState<string | null>(null); // transaction id
  const [merchantRecatIdx, setMerchantRecatIdx] = useState<number | null>(null);
  const [recatLoading, setRecatLoading] = useState(false);

  // In-modal transaction search
  const [txnSearch, setTxnSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce the in-modal search (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(txnSearch), 300);
    return () => clearTimeout(t);
  }, [txnSearch]);

  // Reset local state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTxnSearch('');
      setDebouncedSearch('');
      setMobileSearchOpen(false);
      setRecatDropdown(null);
      setMerchantRecatIdx(null);
    }
  }, [isOpen]);

  // Load transactions whenever the modal opens or filters change
  useEffect(() => {
    if (isOpen && (category || incomeType || searchQuery)) {
      loadData();
    } else {
      setData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category, incomeType, searchQuery, selectedMonth]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!recatDropdown && merchantRecatIdx === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-recat-dropdown]')) {
        setRecatDropdown(null);
        setMerchantRecatIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [recatDropdown, merchantRecatIdx]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const monthParam = selectedMonth ? `&month=${selectedMonth}` : '';
      let typeParam = '';
      if (searchQuery) typeParam = `searchQuery=${encodeURIComponent(searchQuery)}`;
      else if (incomeType) typeParam = `income_type=${encodeURIComponent(incomeType)}`;
      else typeParam = `category=${encodeURIComponent(category!)}`;

      const res = await fetch(`/api/money-hub/transactions?${typeParam}${monthParam}`);
      const d = await res.json();
      setData(d);
    } catch {
      // silent — network errors leave stale data in place
    }
    setLoading(false);
  }, [category, incomeType, searchQuery, selectedMonth]);

  // ── Recategorise: merchant pattern (applies to all matching) ─────────────
  const handleMerchantRecategorise = async (merchantPattern: string, newCategory: string) => {
    setRecatLoading(true);
    try {
      await fetch('/api/money-hub/recategorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantPattern, newCategory, applyToAll: true }),
      });
      await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawName: merchantPattern, category: newCategory }),
      });
      await loadData();
      onRecategorised();
    } catch {
      // silent
    }
    setRecatDropdown(null);
    setMerchantRecatIdx(null);
    setRecatLoading(false);
  };

  // ── Recategorise: single transaction by ID ───────────────────────────────
  const handleTxnRecategorise = async (txnId: string, newCategory: string) => {
    setRecatLoading(true);
    try {
      await fetch('/api/money-hub/recategorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txnId, newCategory }),
      });
      // Optimistic local update so the badge reflects the new category immediately
      setData(prev =>
        prev
          ? {
              ...prev,
              transactions: prev.transactions.map(t =>
                t.id === txnId ? { ...t, category: newCategory } : t,
              ),
            }
          : prev,
      );
      onRecategorised();
    } catch {
      // silent
    }
    setRecatDropdown(null);
    setRecatLoading(false);
  };

  if (!isOpen || !(category || incomeType || searchQuery)) return null;

  // ── Client-side filter for the in-modal search ───────────────────────────
  const filteredTxns = (data?.transactions ?? []).filter(txn => {
    if (!debouncedSearch) return true;
    // Strip leading £ so "£750" and "750" both match
    const q = debouncedSearch.toLowerCase().replace(/^£/, '').trim();
    const merchant = (txn.merchant_name ?? '').toLowerCase();
    const desc = (txn.description ?? '').toLowerCase();
    const amt = String(Math.abs(txn.amount ?? 0));
    const catId = (txn.category ?? '').toLowerCase().replace(/_/g, ' ');
    const catLabel = getCatDisplay(txn.category).label.toLowerCase();
    return (
      merchant.includes(q) ||
      desc.includes(q) ||
      amt.includes(q) ||
      catId.includes(q) ||
      catLabel.includes(q)
    );
  });

  const displayTitle = searchQuery
    ? `Search: "${searchQuery}"`
    : (incomeType || category!).replace(/_/g, ' ');

  const hasTransactions = (data?.transactions.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-6 border-b border-navy-800">
          <div>
            <h2 className="text-xl font-bold text-white capitalize">{displayTitle}</h2>
            <p className="text-slate-400 text-sm mt-1">
              {selectedMonth
                ? new Date(`${selectedMonth}-01`).toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })
                : 'This month'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-navy-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
            </div>
          ) : !hasTransactions ? (
            <div className="text-center py-20">
              <p className="text-slate-400">No transactions found for this category.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ── Top Merchants ─────────────────────────────────────── */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 font-semibold">
                  Top Merchants
                </p>
                <div className="space-y-3">
                  {data!.merchants.slice(0, 5).map((m, idx) => (
                    <div
                      key={m.merchant}
                      className="bg-navy-950/50 rounded-xl p-4 flex items-center justify-between group relative"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-navy-800 flex items-center justify-center border border-navy-700 font-bold text-white uppercase text-sm">
                          {m.merchant.substring(0, 2)}
                        </div>
                        <div>
                          <p className="text-white font-medium capitalize">{m.merchant}</p>
                          <p className="text-slate-500 text-xs">{m.count} transactions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">£{fmtNum(m.total)}</p>
                        <button
                          onClick={() =>
                            setMerchantRecatIdx(merchantRecatIdx === idx ? null : idx)
                          }
                          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Recategorise Rule
                        </button>
                      </div>

                      {merchantRecatIdx === idx && (
                        <div
                          data-recat-dropdown
                          className="absolute top-16 right-0 w-56 bg-navy-800 border border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden"
                        >
                          <div className="p-2 border-b border-navy-700 bg-navy-900/50">
                            <p className="text-xs text-slate-400 font-medium">Reassign all to…</p>
                          </div>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                            {USER_SELECTABLE_CATEGORIES.map(cat => (
                              <button
                                key={cat.id}
                                onClick={() => handleMerchantRecategorise(m.merchant, cat.id)}
                                disabled={recatLoading}
                                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-purple-500/20 hover:text-purple-300 rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
                              >
                                <span>{cat.emoji}</span>
                                <span>{cat.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Transactions ──────────────────────────────────────── */}
              <div>
                {/* Section header + mobile search toggle */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Transactions
                    {debouncedSearch && (
                      <span className="ml-2 normal-case text-slate-600 font-normal">
                        {filteredTxns.length} of {data!.transactions.length}
                      </span>
                    )}
                  </p>
                  {/* Mobile: icon toggles the search bar */}
                  <button
                    className="sm:hidden text-slate-400 hover:text-mint-400 p-1 rounded transition-colors"
                    onClick={() => {
                      setMobileSearchOpen(v => !v);
                      if (!mobileSearchOpen) {
                        setTimeout(() => searchInputRef.current?.focus(), 80);
                      }
                    }}
                    aria-label={mobileSearchOpen ? 'Close search' : 'Search transactions'}
                  >
                    {mobileSearchOpen ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Search input — always visible on ≥sm, toggled on mobile */}
                <div className={`mb-4 relative ${mobileSearchOpen ? 'block' : 'hidden sm:block'}`}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={txnSearch}
                    onChange={e => setTxnSearch(e.target.value)}
                    placeholder="Filter by merchant, amount (e.g. £50), or category…"
                    className="w-full bg-navy-950/60 border border-navy-700 rounded-xl pl-9 pr-9 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-mint-400/50 focus:ring-1 focus:ring-mint-400/30 transition-all"
                  />
                  {txnSearch && (
                    <button
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors"
                      onClick={() => {
                        setTxnSearch('');
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Transaction list / empty state */}
                {filteredTxns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-sm bg-navy-950/20 rounded-xl border border-navy-800">
                    <Search className="h-6 w-6 mb-2 text-slate-600" />
                    <p>No transactions match your search</p>
                    <button
                      onClick={() => setTxnSearch('')}
                      className="mt-2 text-xs text-mint-400 hover:text-mint-300 transition-colors"
                    >
                      Clear filter
                    </button>
                  </div>
                ) : (
                  <div className="bg-navy-950/20 rounded-xl border border-navy-800 divide-y divide-navy-800">
                    {filteredTxns.map((txn, idx) => {
                      const dt = new Date(txn.timestamp);
                      const isRecatOpen = recatDropdown === txn.id;
                      const catDisplay = getCatDisplay(txn.category);
                      const isIncome = (txn.amount ?? 0) > 0;

                      return (
                        <div
                          key={txn.id ?? idx}
                          className="p-4 flex items-center gap-3 group relative"
                        >
                          {/* Merchant + date */}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {txn.merchant_name ?? txn.description}
                            </p>
                            <p className="text-slate-500 text-xs mt-0.5">
                              {dt.toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </p>
                          </div>

                          {/* Category badge — desktop (hidden on mobile, shown below amount) */}
                          <button
                            data-recat-dropdown
                            onClick={() =>
                              setRecatDropdown(isRecatOpen ? null : txn.id)
                            }
                            title="Click to change category"
                            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-navy-800 border border-navy-700 text-slate-300 hover:border-mint-400/40 hover:text-mint-300 transition-all whitespace-nowrap shrink-0"
                          >
                            <span>{catDisplay.emoji}</span>
                            <span>{catDisplay.label}</span>
                            <ChevronDown className="h-3 w-3 text-slate-500" />
                          </button>

                          {/* Amount + mobile category */}
                          <div className="text-right shrink-0">
                            <p
                              className={`text-sm font-medium ${
                                isIncome ? 'text-mint-400' : 'text-white'
                              }`}
                            >
                              {isIncome ? '+' : ''}£{fmtNum(Math.abs(txn.amount ?? 0))}
                            </p>
                            {/* Mobile category badge (tap to recategorise) */}
                            <button
                              data-recat-dropdown
                              onClick={() =>
                                setRecatDropdown(isRecatOpen ? null : txn.id)
                              }
                              className="sm:hidden inline-flex items-center gap-0.5 mt-0.5 text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                            >
                              <span>{catDisplay.emoji}</span>
                              <span className="max-w-[72px] truncate">{catDisplay.label}</span>
                            </button>
                          </div>

                          {/* Category change dropdown */}
                          {isRecatOpen && (
                            <div
                              data-recat-dropdown
                              className="absolute top-full right-0 mt-1 w-56 bg-navy-800 border border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden"
                            >
                              <div className="p-2 border-b border-navy-700 bg-navy-900/50 flex items-center justify-between">
                                <p className="text-xs text-slate-400 font-medium">
                                  Change category
                                </p>
                                <span className="text-[10px] text-slate-500">
                                  This transaction only
                                </span>
                              </div>
                              <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                                {USER_SELECTABLE_CATEGORIES.map(cat => {
                                  const isCurrent = cat.id === txn.category;
                                  return (
                                    <button
                                      key={cat.id}
                                      onClick={() =>
                                        handleTxnRecategorise(txn.id, cat.id)
                                      }
                                      disabled={recatLoading || isCurrent}
                                      className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 transition-colors ${
                                        isCurrent
                                          ? 'text-mint-400 bg-mint-400/10 cursor-default'
                                          : 'text-slate-300 hover:bg-purple-500/20 hover:text-purple-300 disabled:opacity-50'
                                      }`}
                                    >
                                      <span>{cat.emoji}</span>
                                      <span className="flex-1">{cat.label}</span>
                                      {isCurrent && (
                                        <span className="text-[10px] text-mint-400">✓</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
