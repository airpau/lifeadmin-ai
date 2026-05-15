import { useState, useEffect } from 'react';
import { X, Search, ChevronDown, CheckCircle2, Loader2, ArrowRight, Plus } from 'lucide-react';
import { fmtNum } from '@/lib/format';
import { cleanMerchantName, isGarbageMerchantName, pickRawMerchantSource } from '@/lib/merchant-utils';
import { USER_SELECTABLE_CATEGORIES } from '@/lib/categories';
import { createClient } from '@/lib/supabase/client';

interface CategoryDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string | null;
  incomeType?: string | null;
  searchQuery?: string | null;
  selectedMonth: string;
  onRecategorised: () => void;
}

// Derived from the canonical category taxonomy — always in sync with categories.ts.
// USER_SELECTABLE_CATEGORIES excludes 'income' and 'transfers' (system-only).
const ALL_CATEGORIES = USER_SELECTABLE_CATEGORIES.map(c => c.id);

// Income types the user can pick from when drilling into income.
// Must match the CHECK constraint on bank_transactions.income_type and REAL_INCOME_TYPES in money-hub-classification.
const INCOME_TYPES = [
  'salary', 'freelance', 'benefits', 'rental', 'investment',
  'refund', 'loan_repayment', 'gift', 'other',
];

// "This isn't income" escape hatch — picking one of these marks the txn as
// non-income (income_type = 'credit_loan') and labels it on the spending side.
const NON_INCOME_CATEGORIES = ['transfers', 'loans', 'mortgage', 'credit'];

export default function CategoryDrillDownModal({ isOpen, onClose, category, incomeType, searchQuery, selectedMonth, onRecategorised }: CategoryDrillDownModalProps) {
  const [data, setData] = useState<{ transactions: any[]; merchants: any[]; totalSpent: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recatDropdown, setRecatDropdown] = useState<string | null>(null);
  const [merchantRecatIdx, setMerchantRecatIdx] = useState<number | null>(null);
  const [recatLoading, setRecatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Business account detection — loaded once on first open
  const [hasBusinessAccount, setHasBusinessAccount] = useState(false);
  // Custom category creation
  const [showCustomInput, setShowCustomInput] = useState<string | null>(null); // holds the merchant pattern
  const [customCategoryValue, setCustomCategoryValue] = useState('');

  useEffect(() => {
    if (isOpen && (category || incomeType || searchQuery)) {
      loadData();
    } else {
      setData(null);
      setErrorMsg(null);
    }
  }, [isOpen, category, incomeType, searchQuery, selectedMonth]);

  // Detect business accounts once on first open — drives whether the Business
  // category group appears in the reassign dropdown.
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const supabase = createClient();
        const { data: bizConns } = await supabase
          .from('bank_connections')
          .select('id')
          .eq('is_business', true)
          .eq('status', 'active')
          .limit(1);
        setHasBusinessAccount(!!(bizConns && bizConns.length > 0));
      } catch {
        // Not critical — just won't show business categories
      }
    })();
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const monthParam = selectedMonth ? `&month=${selectedMonth}` : '';
      let typeParam = '';
      if (searchQuery) typeParam = `searchQuery=${encodeURIComponent(searchQuery)}`;
      else if (incomeType) typeParam = `income_type=${encodeURIComponent(incomeType)}`;
      else typeParam = `category=${encodeURIComponent(category!)}`;

      const res = await fetch(`/api/money-hub/transactions?${typeParam}${monthParam}`);
      if (!res.ok) {
        setErrorMsg('Could not load transactions — please retry.');
        setData(null);
        return;
      }
      const d = await res.json();
      setData(d);
    } catch {
      setErrorMsg('Could not load transactions — please retry.');
      setData(null);
    }
    setLoading(false);
  };

  // Unified recategorise handler.
  // `mode` decides whether we POST { newIncomeType } (income-type change) or
  // { newCategory } (spending-category / non-income label).
  const handleRecategorise = async (
    merchantPattern: string,
    newValue: string,
    mode: 'incomeType' | 'category' = 'category',
  ) => {
    setRecatLoading(true);
    setErrorMsg(null);
    try {
      const body: Record<string, any> =
        mode === 'incomeType'
          ? { merchantPattern, newIncomeType: newValue, applyToAll: true }
          : { merchantPattern, newCategory: newValue, applyToAll: true };

      const recatRes = await fetch('/api/money-hub/recategorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!recatRes.ok) {
        setErrorMsg('Recategorisation failed — please retry.');
        setRecatLoading(false);
        return;
      }

      // Teach the learning engine with the matching signal. A failure here
      // means the change applied to existing transactions but won't stick
      // for future ones — surface that so the user can retry.
      const learnBody: Record<string, any> = { rawName: merchantPattern };
      if (mode === 'incomeType') learnBody.incomeType = newValue;
      else learnBody.category = newValue;
      const learnRes = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(learnBody),
      });
      if (!learnRes.ok) {
        setErrorMsg('Applied for now, but the rule didn\'t save — future transactions may revert.');
      }

      await loadData();
      onRecategorised();
    } catch {
      setErrorMsg('Recategorisation failed — please retry.');
    }
    setRecatDropdown(null);
    setMerchantRecatIdx(null);
    setRecatLoading(false);
  };

  if (!isOpen || !(category || incomeType || searchQuery)) return null;

  let displayTitle = '';
  if (searchQuery) displayTitle = `Search: "${searchQuery}"`;
  else displayTitle = (incomeType || category!).replace(/_/g, ' ');

  // When the modal is opened in income context, the dropdown offers income types
  // plus a "Not income" escape hatch. Otherwise we fall back to spending categories.
  const isIncomeMode = !!incomeType;

  const renderReassignOptions = (pattern: string) => {
    if (isIncomeMode) {
      return (
        <>
          <div className="p-2 border-b border-slate-200 bg-white">
            <p className="text-xs text-slate-500 font-medium">Change income type</p>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
            {INCOME_TYPES.map(t => (
              <button
                key={`inc-${t}`}
                onClick={() => handleRecategorise(pattern, t, 'incomeType')}
                disabled={recatLoading}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-purple-500/20 hover:text-purple-300 rounded capitalize disabled:opacity-50"
              >
                {t.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-b border-slate-200 bg-white">
            <p className="text-xs text-slate-500 font-medium">Not income — tag as</p>
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar p-1">
            {NON_INCOME_CATEGORIES.map(c => (
              <button
                key={`nic-${c}`}
                onClick={() => handleRecategorise(pattern, c, 'category')}
                disabled={recatLoading}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-purple-500/20 hover:text-purple-300 rounded capitalize disabled:opacity-50"
              >
                {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </>
      );
    }
    // Filter categories: always show consumer groups; show Business group only
    // for users who have at least one business bank connection.
    const visibleCategories = USER_SELECTABLE_CATEGORIES.filter(
      c => c.group !== 'Business' || hasBusinessAccount,
    );

    // Group categories for display
    const groups = visibleCategories.reduce((acc, cat) => {
      if (!acc[cat.group]) acc[cat.group] = [];
      acc[cat.group].push(cat);
      return acc;
    }, {} as Record<string, typeof USER_SELECTABLE_CATEGORIES>);

    const isCustomMode = showCustomInput === pattern;

    return (
      <>
        <div className="p-2 border-b border-slate-200 bg-white">
          <p className="text-xs text-slate-500 font-medium">Reassign to...</p>
        </div>
        <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
          {Object.entries(groups).map(([group, cats]) => (
            <div key={group}>
              <p className="px-3 pt-2 pb-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{group}</p>
              {cats.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleRecategorise(pattern, c.id, 'category')}
                  disabled={recatLoading}
                  className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-purple-500/20 hover:text-purple-300 rounded disabled:opacity-50"
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Custom category creation */}
        <div className="border-t border-slate-200 p-1">
          {isCustomMode ? (
            <div className="flex gap-1 p-1">
              <input
                autoFocus
                type="text"
                value={customCategoryValue}
                onChange={e => setCustomCategoryValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customCategoryValue.trim()) {
                    handleRecategorise(pattern, customCategoryValue.trim().toLowerCase().replace(/\s+/g, '_'), 'category');
                    setShowCustomInput(null);
                    setCustomCategoryValue('');
                  } else if (e.key === 'Escape') {
                    setShowCustomInput(null);
                    setCustomCategoryValue('');
                  }
                }}
                placeholder="e.g. dog food"
                className="flex-1 text-sm px-2 py-1 rounded border border-slate-300 focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={() => {
                  if (customCategoryValue.trim()) {
                    handleRecategorise(pattern, customCategoryValue.trim().toLowerCase().replace(/\s+/g, '_'), 'category');
                    setShowCustomInput(null);
                    setCustomCategoryValue('');
                  }
                }}
                disabled={!customCategoryValue.trim() || recatLoading}
                className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setShowCustomInput(pattern); setCustomCategoryValue(''); }}
              className="w-full text-left px-3 py-2 text-sm text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 rounded flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Create custom category
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-white backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl rounded-b-none sm:rounded-2xl">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 capitalize truncate">{displayTitle}</h2>
            <p className="text-slate-500 text-sm mt-1">{selectedMonth ? new Date(`${selectedMonth}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'This month'}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-lg px-3 py-2 flex items-start justify-between gap-3">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-500 shrink-0" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
            </div>
          ) : !data || data.transactions.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500">No transactions found for this category.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* TOP MERCHANTS SUMMARY */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 font-semibold">Top Merchants</p>
                <div className="space-y-3">
                  {data.merchants.slice(0, 5).map((m, idx) => (
                    <div key={m.merchant} className="bg-white rounded-xl p-4 flex items-center justify-between group relative">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 font-bold text-slate-900 uppercase">
                          {m.merchant.substring(0, 2)}
                        </div>
                        <div>
                          <p className="text-slate-900 font-medium capitalize">{m.merchant}</p>
                          <p className="text-slate-500 text-xs">{m.count} transactions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-900 font-bold">£{fmtNum(m.total)}</p>
                        <button 
                          onClick={() => setMerchantRecatIdx(merchantRecatIdx === idx ? null : idx)}
                          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Recategorise Rule
                        </button>
                      </div>
                      
                      {merchantRecatIdx === idx && (
                        <div className="absolute top-16 right-0 w-56 max-w-[calc(100vw-2.5rem)] bg-slate-100 border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                          {renderReassignOptions(m.merchant)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* INDIVIDUAL TRANSACTIONS */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 font-semibold">Transactions</p>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-navy-800">
                  {data.transactions.map((txn, idx) => {
                    const dt = new Date(txn.timestamp);
                    const isRecatOpen = recatDropdown === txn.id;
                    return (
                      <div key={txn.id || idx} className="p-4 flex items-center justify-between group relative">
                        <div>
                          <p className="text-slate-900 text-sm font-medium">{isGarbageMerchantName(txn.merchant_name) ? (txn.description || txn.merchant_name) : txn.merchant_name}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-900 text-sm font-medium">£{fmtNum(Math.abs(txn.amount))}</p>
                          <button 
                            onClick={() => setRecatDropdown(isRecatOpen ? null : txn.id)}
                            className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                          >
                            Change category
                          </button>
                        </div>

                        {isRecatOpen && (
                          <div className="absolute top-12 right-4 w-56 max-w-[calc(100vw-2.5rem)] bg-slate-100 border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                            {renderReassignOptions(cleanMerchantName(txn.description || ''))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
