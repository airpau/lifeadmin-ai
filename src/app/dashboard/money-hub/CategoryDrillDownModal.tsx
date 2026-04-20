import { useState, useEffect } from 'react';
import { X, Search, ChevronDown, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { fmtNum } from '@/lib/format';
import { cleanMerchantName } from '@/lib/merchant-utils';

interface CategoryDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string | null;
  incomeType?: string | null;
  searchQuery?: string | null;
  selectedMonth: string;
  onRecategorised: (fromCategory: string, toCategory: string, amount: number) => void;
}

const ALL_CATEGORIES = [
  'bills', 'broadband', 'cash', 'charity', 'childcare', 'council_tax', 'credit',
  'eating_out', 'education', 'energy', 'fees', 'fitness', 'food', 'fuel',
  'gambling', 'groceries', 'healthcare', 'insurance', 'loans', 'mobile',
  'mortgage', 'motoring', 'other', 'parking', 'pets', 'professional',
  'property_management', 'shopping', 'software', 'streaming', 'transport',
  'transfers', 'travel', 'utility', 'water',
];

export default function CategoryDrillDownModal({ isOpen, onClose, category, incomeType, searchQuery, selectedMonth, onRecategorised }: CategoryDrillDownModalProps) {
  const [data, setData] = useState<{ transactions: any[]; merchants: any[]; totalSpent: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recatDropdown, setRecatDropdown] = useState<string | null>(null);
  const [merchantRecatIdx, setMerchantRecatIdx] = useState<number | null>(null);
  const [recatLoading, setRecatLoading] = useState(false);

  useEffect(() => {
    if (isOpen && (category || incomeType || searchQuery)) {
      loadData();
    } else {
      setData(null);
    }
  }, [isOpen, category, incomeType, searchQuery, selectedMonth]);

  const loadData = async () => {
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
      // silent
    }
    setLoading(false);
  };

  const handleRecategorise = async (merchantPattern: string, newCategory: string, movedAmount?: number) => {
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
      onRecategorised(category || incomeType || 'other', newCategory, movedAmount ?? 0);
    } catch {
      // silent
    }
    setRecatDropdown(null);
    setMerchantRecatIdx(null);
    setRecatLoading(false);
  };

  if (!isOpen || !(category || incomeType || searchQuery)) return null;

  let displayTitle = '';
  if (searchQuery) displayTitle = `Search: "${searchQuery}"`;
  else displayTitle = (incomeType || category!).replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-800">
          <div>
            <h2 className="text-xl font-bold text-white capitalize">{displayTitle}</h2>
            <p className="text-slate-400 text-sm mt-1">{selectedMonth ? new Date(`${selectedMonth}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'This month'}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-navy-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
            </div>
          ) : !data || data.transactions.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-400">No transactions found for this category.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* TOP MERCHANTS SUMMARY */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 font-semibold">Top Merchants</p>
                <div className="space-y-3">
                  {data.merchants.slice(0, 5).map((m, idx) => (
                    <div key={m.merchant} className="bg-navy-950/50 rounded-xl p-4 flex items-center justify-between group relative">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-navy-800 flex items-center justify-center border border-navy-700 font-bold text-white uppercase">
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
                          onClick={() => setMerchantRecatIdx(merchantRecatIdx === idx ? null : idx)}
                          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Recategorise Rule
                        </button>
                      </div>
                      
                      {merchantRecatIdx === idx && (
                        <div className="absolute top-16 right-0 w-48 bg-navy-800 border border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden">
                          <div className="p-2 border-b border-navy-700 bg-navy-900/50">
                            <p className="text-xs text-slate-400 font-medium">Reassign to...</p>
                          </div>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                            {ALL_CATEGORIES.map(c => (
                              <button
                                key={c}
                                onClick={() => handleRecategorise(m.merchant, c, m.total)}
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
                  ))}
                </div>
              </div>

              {/* INDIVIDUAL TRANSACTIONS */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 font-semibold">Transactions</p>
                <div className="bg-navy-950/20 rounded-xl border border-navy-800 divide-y divide-navy-800">
                  {data.transactions.map((txn, idx) => {
                    const dt = new Date(txn.timestamp);
                    const isRecatOpen = recatDropdown === txn.id;
                    return (
                      <div key={txn.id || idx} className="p-4 flex items-center justify-between group relative">
                        <div>
                          <p className="text-white text-sm font-medium">{txn.merchant_name || txn.description}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-sm font-medium">£{fmtNum(Math.abs(txn.amount))}</p>
                          <button 
                            onClick={() => setRecatDropdown(isRecatOpen ? null : txn.id)}
                            className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                          >
                            Change category
                          </button>
                        </div>

                        {isRecatOpen && (
                          <div className="absolute top-12 right-4 w-48 bg-navy-800 border border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden">
                            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                              {ALL_CATEGORIES.map(c => (
                                <button
                                  key={c}
                                  onClick={() => handleRecategorise(cleanMerchantName(txn.description || ''), c, Math.abs(txn.amount))}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
