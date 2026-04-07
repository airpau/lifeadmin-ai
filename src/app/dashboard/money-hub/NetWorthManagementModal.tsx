import { useState } from 'react';
import { X, Plus, Trash2, PiggyBank, Building2, CreditCard } from 'lucide-react';
import { formatGBP } from '@/lib/format';

export default function NetWorthManagementModal({ isOpen, onClose, data, onUpdated }: { isOpen: boolean, onClose: () => void, data: any, onUpdated: () => void }) {
  const [activeTab, setActiveTab] = useState<'assets' | 'liabilities'>('assets');
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [assetForm, setAssetForm] = useState({ type: 'savings', name: '', value: '' });
  const [liabilityForm, setLiabilityForm] = useState({ type: 'loan', name: '', balance: '' });

  const { assetsList = [], liabilitiesList = [] } = data.netWorth || {};

  const handleAddAsset = async () => {
    if (!assetForm.name || !assetForm.value) return;
    setLoading(true);
    try {
      await fetch('/api/money-hub/net-worth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'asset', asset_type: assetForm.type, asset_name: assetForm.name, estimated_value: parseFloat(assetForm.value) }),
      });
      setAssetForm({ type: 'savings', name: '', value: '' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleAddLiability = async () => {
    if (!liabilityForm.name || !liabilityForm.balance) return;
    setLoading(true);
    try {
      await fetch('/api/money-hub/net-worth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'liability', liability_type: liabilityForm.type, liability_name: liabilityForm.name, outstanding_balance: parseFloat(liabilityForm.balance) }),
      });
      setLiabilityForm({ type: 'loan', name: '', balance: '' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleDelete = async (id: string, type: 'asset' | 'liability') => {
    setLoading(true);
    try {
      await fetch(`/api/money-hub/net-worth?id=${id}&type=${type}`, { method: 'DELETE' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 pt-1"><PiggyBank className="h-6 w-6 text-mint-400" /> Manage Net Worth</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-navy-800 transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex border-b border-navy-800">
          <button onClick={() => setActiveTab('assets')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'assets' ? 'text-green-400 border-b-2 border-green-400' : 'text-slate-500 hover:text-slate-300'}`}>Assets</button>
          <button onClick={() => setActiveTab('liabilities')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'liabilities' ? 'text-red-400 border-b-2 border-red-400' : 'text-slate-500 hover:text-slate-300'}`}>Liabilities</button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'assets' ? (
            <div className="space-y-6">
              <div className="bg-navy-950/50 p-4 rounded-xl border border-navy-800">
                <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-green-400" /> Add Asset</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input type="text" placeholder="Asset Name (e.g. Monzo, House)" value={assetForm.name} onChange={e => setAssetForm(prev => ({ ...prev, name: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none col-span-2" />
                  <select value={assetForm.type} onChange={e => setAssetForm(prev => ({ ...prev, type: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none">
                    <option value="savings">Savings</option><option value="property">Property</option><option value="investment">Investment</option><option value="vehicle">Vehicle</option><option value="crypto">Crypto</option><option value="business">Business</option><option value="pension">Pension</option><option value="other">Other</option>
                  </select>
                  <input type="number" placeholder="Value (£)" value={assetForm.value} onChange={e => setAssetForm(prev => ({ ...prev, value: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none" />
                </div>
                <button onClick={handleAddAsset} disabled={loading || !assetForm.name || !assetForm.value} className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm flex justify-center items-center gap-2"><Plus className="h-4 w-4" /> Add Asset</button>
              </div>
              <div>
                {assetsList.length === 0 ? <p className="text-slate-500 text-sm">No assets added yet.</p> : assetsList.map((a: any) => (
                  <div key={a.id} className="flex justify-between items-center py-3 border-b border-navy-800 last:border-0">
                    <div><p className="text-white text-sm">{a.asset_name}</p><p className="text-xs text-slate-500 capitalize">{a.asset_type}</p></div>
                    <div className="flex items-center gap-4"><p className="text-green-400 font-semibold">£{formatGBP(a.estimated_value)}</p><button onClick={() => handleDelete(a.id, 'asset')} disabled={loading} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-navy-950/50 p-4 rounded-xl border border-navy-800">
                <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-red-400" /> Add Liability</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input type="text" placeholder="Liability Name (e.g. Loan, Mortgage)" value={liabilityForm.name} onChange={e => setLiabilityForm(prev => ({ ...prev, name: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-400 focus:outline-none col-span-2" />
                  <select value={liabilityForm.type} onChange={e => setLiabilityForm(prev => ({ ...prev, type: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-400 focus:outline-none">
                    <option value="loan">Loan</option><option value="mortgage">Mortgage</option><option value="credit_card">Credit Card</option><option value="car_finance">Car Finance</option><option value="overdraft">Overdraft</option><option value="other">Other</option>
                  </select>
                  <input type="number" placeholder="Balance (£)" value={liabilityForm.balance} onChange={e => setLiabilityForm(prev => ({ ...prev, balance: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-400 focus:outline-none" />
                </div>
                <button onClick={handleAddLiability} disabled={loading || !liabilityForm.name || !liabilityForm.balance} className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm flex justify-center items-center gap-2"><Plus className="h-4 w-4" /> Add Liability</button>
              </div>
              <div>
                {liabilitiesList.length === 0 ? <p className="text-slate-500 text-sm">No liabilities added yet.</p> : liabilitiesList.map((l: any) => (
                  <div key={l.id} className="flex justify-between items-center py-3 border-b border-navy-800 last:border-0">
                    <div><p className="text-white text-sm">{l.liability_name}</p><p className="text-xs text-slate-500 capitalize">{l.liability_type}</p></div>
                    <div className="flex items-center gap-4"><p className="text-red-400 font-semibold">£{formatGBP(l.outstanding_balance)}</p><button onClick={() => handleDelete(l.id, 'liability')} disabled={loading} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
