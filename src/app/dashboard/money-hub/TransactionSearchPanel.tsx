'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { fmtNum } from '@/lib/format';
import { cleanMerchantName } from '@/lib/merchant-utils';

const ALL_CATEGORIES = [
  'bills', 'cash', 'charity', 'credit', 'eating_out', 'education', 'energy',
  'fees', 'fuel', 'gambling', 'groceries', 'healthcare', 'income', 'insurance',
  'motoring', 'other', 'parking', 'pets', 'shopping', 'software', 'streaming',
  'transport', 'transfers', 'travel', 'water',
];

interface SearchTransaction {
  id: string;
  description: string;
  merchant_name?: string;
  amount: number;
  category?: string;
  timestamp: string;
  kind?: string;
}

export default function TransactionSearchPanel({
  selectedMonth,
  refreshData,
}: {
  selectedMonth: string;
  refreshData: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [recatDropdown, setRecatDropdown] = useState<string | null>(null);
  const [recatLoading, setRecatLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // Abort any in-flight request from a previous query
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      setLoading(true);
      try {
        const monthParam = selectedMonth ? `&month=${selectedMonth}` : '';
        const res = await fetch(
          `/api/money-hub/transactions?search=${encodeURIComponent(query.trim())}${monthParam}`,
          { cache: 'no-store', signal }
        );
        const d = await res.json();
        setResults(d.transactions || []);
      } catch (err: any) {
        // Ignore AbortError — a newer request superseded this one
        if (err?.name !== 'AbortError') setResults([]);
      }
      setLoading(false);
    }, 300);
  }, [query, selectedMonth]);

  const handleRecategorise = async (txn: SearchTransaction, newCategory: string) => {
    setRecatLoading(true);
    try {
      const merchantPattern = cleanMerchantName(txn.merchant_name || txn.description || '');
      await fetch('/api/money-hub/recategorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantPattern, newCategory, applyToAll: true }),
      });
      setResults((prev) =>
        prev.map((r) => (r.id === txn.id ? { ...r, category: newCategory } : r))
      );
      refreshData();
    } catch {
      // silent
    }
    setRecatDropdown(null);
    setRecatLoading(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Search className="h-5 w-5 text-mint-400" />
        <h3 className="text-white font-semibold text-lg">Search Transactions</h3>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by merchant or description..."
          className="w-full bg-navy-800 border border-navy-700/50 rounded-xl pl-9 pr-9 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-mint-400/50 transition-colors"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 text-mint-400 animate-spin" />
        </div>
      )}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-8">
          No transactions found for &ldquo;{query}&rdquo;
        </p>
      )}

      {!loading && results.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          <div className="bg-navy-950/20 rounded-xl border border-navy-800 divide-y divide-navy-800">
            {results.map((txn) => {
              const dt = new Date(txn.timestamp);
              const isRecatOpen = recatDropdown === txn.id;
              const displayName = txn.merchant_name || txn.description || 'Unknown';
              return (
                <div key={txn.id} className="p-4 flex items-center justify-between relative">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{displayName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-slate-500 text-xs">
                        {dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {txn.category && (
                        <span className="text-[10px] bg-navy-800 text-slate-300 px-2 py-0.5 rounded-md capitalize">
                          {txn.category.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p
                      className={`text-sm font-medium ${
                        txn.amount >= 0 ? 'text-green-400' : 'text-white'
                      }`}
                    >
                      {txn.amount >= 0 ? '+' : ''}£{fmtNum(Math.abs(txn.amount))}
                    </p>
                    <button
                      onClick={() => setRecatDropdown(isRecatOpen ? null : txn.id)}
                      className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                    >
                      Change category
                    </button>
                  </div>

                  {isRecatOpen && (
                    <div className="absolute top-12 right-4 w-48 bg-navy-800 border border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden">
                      <div className="p-2 border-b border-navy-700 bg-navy-900/50">
                        <p className="text-xs text-slate-400 font-medium">Move to category...</p>
                      </div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {ALL_CATEGORIES.map((c) => (
                          <button
                            key={c}
                            onClick={() => handleRecategorise(txn, c)}
                            disabled={recatLoading}
                            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-purple-500/20 hover:text-purple-300 rounded capitalize disabled:opacity-50"
                          >
                            {c.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
