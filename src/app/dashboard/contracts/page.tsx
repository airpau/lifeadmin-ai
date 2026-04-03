'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText, Upload, Loader2, Shield, AlertCircle, CheckCircle,
  Clock, ChevronLeft, Trash2, ExternalLink, Link2, X, Plus,
  Search, ChevronDown, PenLine,
} from 'lucide-react';
import { cleanMerchantName } from '@/lib/merchant-utils';

// ============================================================
// Types
// ============================================================
interface Contract {
  id: string;
  provider_name: string | null;
  contract_type: string | null;
  file_url: string | null;
  file_name: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  minimum_term: string | null;
  notice_period: string | null;
  monthly_cost: number | null;
  annual_cost: number | null;
  cancellation_fee: string | null;
  early_exit_fee: string | null;
  price_increase_clause: string | null;
  auto_renewal: string | null;
  cooling_off_period: string | null;
  unfair_clauses: string[];
  raw_summary: string | null;
  dispute_id: string | null;
  subscription_id: string | null;
  created_at: string;
  disputes?: { id: string; provider_name: string; status: string } | null;
  subscriptions?: { id: string; provider_name: string; status: string; amount: number } | null;
}

interface SubscriptionOption {
  id: string;
  provider_name: string;
  display_name: string;
  category: string | null;
  amount: number;
}

// ============================================================
// Helpers
// ============================================================
const TYPE_LABELS: Record<string, string> = {
  energy: 'Energy', broadband: 'Broadband', mobile: 'Mobile',
  insurance: 'Insurance', gym: 'Gym', streaming: 'Streaming',
  finance: 'Finance', other: 'Other',
};

const CATEGORY_OPTIONS = [
  { value: 'energy', label: 'Energy' },
  { value: 'broadband', label: 'Broadband' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'gym', label: 'Gym' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' },
];

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getContractStatus(endDate: string | null): { label: string; className: string } {
  if (!endDate) return { label: 'Active', className: 'bg-green-500/10 text-green-400' };
  const end = new Date(endDate);
  const now = new Date();
  const daysLeft = Math.floor((end.getTime() - now.getTime()) / 86400000);

  if (daysLeft < 0) return { label: 'Expired', className: 'bg-red-500/10 text-red-400' };
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, className: 'bg-amber-500/10 text-amber-400' };
  return { label: 'Active', className: 'bg-green-500/10 text-green-400' };
}

/** Strip reference numbers, trailing digits, and normalize casing for display */
function cleanProviderDisplay(raw: string): string {
  // Use cleanMerchantName for the heavy lifting
  const cleaned = cleanMerchantName(raw);
  // Additional cleanup: strip trailing reference numbers (8+ digits or alphanumeric refs)
  return cleaned
    .replace(/[\s-]*\d{6,}[A-Z]*$/i, '')
    .replace(/[\s-]*[A-Z0-9]{8,}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Searchable Supplier Dropdown
// ============================================================
function SupplierDropdown({
  subscriptions,
  value,
  customName,
  onChange,
  onCustomNameChange,
}: {
  subscriptions: SubscriptionOption[];
  value: string; // subscription id or 'other'
  customName: string;
  onChange: (id: string) => void;
  onCustomNameChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = subscriptions.filter(s =>
    s.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = value === 'other'
    ? 'Other / Not in my list'
    : subscriptions.find(s => s.id === value)?.display_name || '';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-left focus:outline-none focus:border-amber-400 transition-all"
      >
        <span className={value ? 'text-white' : 'text-slate-500'}>
          {value ? selectedLabel : 'Select a supplier...'}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-navy-900 border border-navy-700/50 rounded-lg shadow-2xl max-h-64 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-navy-700/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-navy-950 border border-navy-700/50 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-48">
            {filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-navy-800 transition-all flex items-center justify-between ${value === s.id ? 'bg-navy-800 text-amber-400' : 'text-slate-300'}`}
              >
                <span className="truncate">{s.display_name}</span>
                {s.category && (
                  <span className="text-[10px] text-slate-500 ml-2 flex-shrink-0">{TYPE_LABELS[s.category] || s.category}</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-slate-500 px-4 py-3">No matching suppliers</p>
            )}

            {/* Other option */}
            <button
              type="button"
              onClick={() => { onChange('other'); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-4 py-2.5 text-sm border-t border-navy-700/50 hover:bg-navy-800 transition-all flex items-center gap-2 ${value === 'other' ? 'bg-navy-800 text-amber-400' : 'text-slate-400'}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Other / Not in my list
            </button>
          </div>
        </div>
      )}

      {/* Custom name input when "other" is selected */}
      {value === 'other' && (
        <input
          type="text"
          placeholder="Enter supplier name..."
          value={customName}
          onChange={(e) => onCustomNameChange(e.target.value)}
          className="mt-2 w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
      )}
    </div>
  );
}

// ============================================================
// Contract Detail
// ============================================================
function ContractDetail({ contract, onBack, onDelete }: {
  contract: Contract;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const status = getContractStatus(contract.contract_end_date);

  const handleDelete = async () => {
    if (!confirm('Delete this contract? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/contracts?id=${contract.id}`, { method: 'DELETE' });
      onDelete();
    } catch {
      alert('Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  const terms = [
    { label: 'Minimum term', value: contract.minimum_term },
    { label: 'Notice period', value: contract.notice_period },
    { label: 'Monthly cost', value: contract.monthly_cost ? `£${contract.monthly_cost}` : null },
    { label: 'Annual cost', value: contract.annual_cost ? `£${contract.annual_cost}` : null },
    { label: 'Cancellation fee', value: contract.cancellation_fee },
    { label: 'Early exit fee', value: contract.early_exit_fee },
    { label: 'Price increases', value: contract.price_increase_clause },
    { label: 'Auto-renewal', value: contract.auto_renewal },
    { label: 'Cooling-off period', value: contract.cooling_off_period },
  ].filter(t => t.value);

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm transition-all">
        <ChevronLeft className="h-4 w-4" /> Back to contracts
      </button>

      {/* Header */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              {contract.provider_name ? `Your ${contract.provider_name} contract` : 'Contract details'}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              {contract.contract_type && (
                <span className="text-slate-400 text-sm">{TYPE_LABELS[contract.contract_type] || contract.contract_type}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>{status.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {contract.file_url && (
              <a href={contract.file_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-navy-800 transition-all" title="Download original">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button onClick={handleDelete} disabled={deleting} className="text-slate-400 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all" title="Delete contract">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dates */}
        {(contract.contract_start_date || contract.contract_end_date) && (
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            {contract.contract_start_date && <span>Started: {formatDate(contract.contract_start_date)}</span>}
            {contract.contract_end_date && <span>Ends: {formatDate(contract.contract_end_date)}</span>}
          </div>
        )}

        {/* Summary */}
        {contract.raw_summary && (
          <p className="text-slate-300 text-sm mt-4">{contract.raw_summary}</p>
        )}
      </div>

      {/* Key terms */}
      {terms.length > 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">Key terms</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {terms.map((term) => (
              <div key={term.label} className="bg-navy-950 rounded-lg px-4 py-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{term.label}</p>
                <p className="text-sm text-slate-300">{term.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unfair clauses */}
      {contract.unfair_clauses && contract.unfair_clauses.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" /> Clauses to watch out for
          </h2>
          <ul className="space-y-2">
            {contract.unfair_clauses.map((clause, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                {clause}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-3">Under the Consumer Rights Act 2015 Part 2, unfair terms are not binding on consumers.</p>
        </div>
      )}

      {/* Links */}
      <div className="flex gap-3">
        {contract.disputes && (
          <Link href={`/dashboard/complaints`} className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 border border-navy-700/50 hover:border-amber-400/30 text-slate-300 rounded-lg text-sm transition-all">
            <Link2 className="h-4 w-4" /> View linked dispute
          </Link>
        )}
        {contract.subscriptions && (
          <Link href="/dashboard/subscriptions" className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 border border-navy-700/50 hover:border-amber-400/30 text-slate-300 rounded-lg text-sm transition-all">
            <Link2 className="h-4 w-4" /> View subscription
          </Link>
        )}
        <Link
          href={`/dashboard/complaints?new=1&company=${encodeURIComponent(contract.provider_name || '')}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-navy-950 font-semibold rounded-lg text-sm transition-all"
        >
          <FileText className="h-4 w-4" /> Write a complaint letter
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Upload Modal (with file upload + manual entry tabs)
// ============================================================
function UploadModal({ subscriptions, onClose, onUploaded }: {
  subscriptions: SubscriptionOption[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [tab, setTab] = useState<'upload' | 'manual'>('upload');

  // Shared state
  const [supplierId, setSupplierId] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');

  // Upload tab state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Manual tab state
  const [manualCategory, setManualCategory] = useState('');
  const [manualMonthlyCost, setManualMonthlyCost] = useState('');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualAutoRenews, setManualAutoRenews] = useState(true);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedSupplierName = supplierId === 'other'
    ? customSupplierName
    : subscriptions.find(s => s.id === supplierId)?.display_name || '';

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (dropped.size > 10 * 1024 * 1024) { alert('Maximum 10MB.'); return; }
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(dropped.type)) { alert('Please upload a PDF or image file.'); return; }
      setFile(dropped);
    }
  }, []);

  // File upload handler
  const handleUpload = async () => {
    if (!file) return;
    if (!supplierId) {
      alert('Please select a supplier.');
      return;
    }
    if (supplierId === 'other' && !customSupplierName.trim()) {
      alert('Please enter the supplier name.');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (supplierId !== 'other') {
        fd.append('subscriptionId', supplierId);
      }
      if (supplierId === 'other') {
        fd.append('customProviderName', customSupplierName.trim());
      }

      const res = await fetch('/api/contracts/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      onUploaded();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload contract.';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  // Manual entry handler
  const handleManualSave = async () => {
    if (!supplierId) {
      alert('Please select a supplier.');
      return;
    }
    if (supplierId === 'other' && !customSupplierName.trim()) {
      alert('Please enter the supplier name.');
      return;
    }

    setSaving(true);
    try {
      if (supplierId === 'other') {
        // Create a new subscription with contract details
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_name: customSupplierName.trim(),
            category: manualCategory || null,
            amount: manualMonthlyCost ? parseFloat(manualMonthlyCost) : 0,
            billing_cycle: 'monthly',
            contract_start_date: manualStartDate || null,
            contract_end_date: manualEndDate || null,
            auto_renews: manualAutoRenews,
            contract_end_source: 'manual',
            source: 'manual',
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to save');
        }
      } else {
        // Update existing subscription with contract dates
        const updatePayload: Record<string, unknown> = {};
        if (manualStartDate) updatePayload.contract_start_date = manualStartDate;
        if (manualEndDate) updatePayload.contract_end_date = manualEndDate;
        if (manualCategory) updatePayload.contract_type = manualCategory;
        if (manualMonthlyCost) updatePayload.amount = parseFloat(manualMonthlyCost);
        updatePayload.auto_renews = manualAutoRenews;
        updatePayload.contract_end_source = 'manual';

        const res = await fetch(`/api/subscriptions/${supplierId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to save');
        }
      }
      onUploaded();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save contract details.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-md shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-navy-700/50">
          <h2 className="text-lg font-bold text-white">Add a contract</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-navy-700/50">
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${tab === 'upload' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white'}`}
          >
            <Upload className="h-4 w-4" /> Upload file
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${tab === 'manual' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white'}`}
          >
            <PenLine className="h-4 w-4" /> Enter manually
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Supplier dropdown (shared between tabs) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Which supplier is this for?</label>
            <SupplierDropdown
              subscriptions={subscriptions}
              value={supplierId}
              customName={customSupplierName}
              onChange={setSupplierId}
              onCustomNameChange={setCustomSupplierName}
            />
          </div>

          {/* ======================== Upload tab ======================== */}
          {tab === 'upload' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Contract file</label>
                {file ? (
                  <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-400" />
                      <span className="text-purple-400 text-xs font-medium truncate max-w-[200px]">{file.name}</span>
                    </div>
                    <button onClick={() => setFile(null)} className="text-slate-500 hover:text-white text-xs">Remove</button>
                  </div>
                ) : (
                  <label
                    className={`flex flex-col items-center gap-2 w-full px-4 py-6 bg-navy-950 border-2 border-dashed rounded-lg cursor-pointer transition-all text-sm text-center ${
                      dragActive
                        ? 'border-amber-400 bg-amber-400/5'
                        : 'border-purple-500/30 hover:border-purple-400/50'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <Upload className={`h-6 w-6 ${dragActive ? 'text-amber-400' : 'text-purple-400'}`} />
                    <span className={dragActive ? 'text-amber-400' : 'text-slate-400'}>
                      {dragActive ? 'Drop your file here' : 'Drag and drop, or click to browse'}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 10 * 1024 * 1024) { alert('Maximum 10MB.'); return; }
                          setFile(f);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                <p className="text-[11px] text-slate-600 mt-2">PDF, JPG, or PNG up to 10MB. We read the key terms and flag anything unfair.</p>
              </div>

              <button
                onClick={handleUpload}
                disabled={!file || !supplierId || (supplierId === 'other' && !customSupplierName.trim()) || uploading}
                className="w-full bg-amber-400 hover:bg-amber-500 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Reading your contract...</>
                ) : (
                  <><Shield className="h-4 w-4" /> Upload and analyse</>
                )}
              </button>
            </>
          )}

          {/* ======================== Manual tab ======================== */}
          {tab === 'manual' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">Select category</option>
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Monthly cost (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 29.99"
                  value={manualMonthlyCost}
                  onChange={(e) => setManualMonthlyCost(e.target.value)}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Start date</label>
                  <input
                    type="date"
                    value={manualStartDate}
                    onChange={(e) => setManualStartDate(e.target.value)}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">End date</label>
                  <input
                    type="date"
                    value={manualEndDate}
                    onChange={(e) => setManualEndDate(e.target.value)}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400 [color-scheme:dark]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`relative w-10 h-5 rounded-full transition-all ${manualAutoRenews ? 'bg-amber-400' : 'bg-navy-700'}`}
                  onClick={() => setManualAutoRenews(!manualAutoRenews)}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${manualAutoRenews ? 'left-5' : 'left-0.5'}`} />
                </div>
                <span className="text-sm text-slate-300">Auto-renews</span>
              </label>

              <button
                onClick={handleManualSave}
                disabled={!supplierId || (supplierId === 'other' && !customSupplierName.trim()) || saving}
                className="w-full bg-amber-400 hover:bg-amber-500 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><CheckCircle className="h-4 w-4" /> Save contract details</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Contracts Page
// ============================================================
export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionOption[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState<'end_date' | 'recent'>('end_date');

  const fetchContracts = () => {
    fetch('/api/contracts')
      .then(r => r.json())
      .then(setContracts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchContracts();
    // Fetch subscriptions for the upload modal
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as Record<string, unknown>).subscriptions || [];
        const subs = (arr as Array<Record<string, unknown>>).map((s) => ({
          id: s.id as string,
          provider_name: s.provider_name as string,
          display_name: cleanProviderDisplay(s.provider_name as string),
          category: (s.category as string | null) || null,
          amount: (s.amount as number) || 0,
        }));
        // Deduplicate by display_name, keeping the first occurrence
        const seen = new Set<string>();
        const unique = subs.filter(s => {
          const key = s.display_name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Sort alphabetically
        unique.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setSubscriptions(unique);
      })
      .catch(() => {});
  }, []);

  if (selectedContract) {
    return (
      <ContractDetail
        contract={selectedContract}
        onBack={() => setSelectedContract(null)}
        onDelete={() => { setSelectedContract(null); fetchContracts(); }}
      />
    );
  }

  // Filter and sort
  let filtered = contracts;
  if (filterType !== 'all') {
    filtered = filtered.filter(c => c.contract_type === filterType);
  }
  if (sortBy === 'end_date') {
    filtered = [...filtered].sort((a, b) => {
      if (!a.contract_end_date) return 1;
      if (!b.contract_end_date) return -1;
      return new Date(a.contract_end_date).getTime() - new Date(b.contract_end_date).getTime();
    });
  }

  const types = [...new Set(contracts.map(c => c.contract_type).filter(Boolean))] as string[];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)]">My Contracts</h1>
          <p className="text-slate-400 mt-1">Upload your contracts and we find the clauses that matter</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-navy-950 font-semibold rounded-lg transition-all"
        >
          <Plus className="h-4 w-4" /> Upload contract
        </button>
      </div>

      {showUpload && (
        <UploadModal
          subscriptions={subscriptions}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); fetchContracts(); }}
        />
      )}

      {/* Filters */}
      {contracts.length > 0 && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`text-xs px-3 py-1.5 rounded-full transition-all ${filterType === 'all' ? 'bg-amber-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
            >
              All ({contracts.length})
            </button>
            {types.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all ${filterType === t ? 'bg-amber-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
              >
                {TYPE_LABELS[t] || t}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'end_date' | 'recent')}
            className="ml-auto text-xs bg-navy-800 border border-navy-700/50 rounded-lg px-3 py-1.5 text-slate-400"
          >
            <option value="end_date">Ending soonest</option>
            <option value="recent">Recently added</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-navy-950/50 border border-dashed border-navy-700/50 rounded-2xl p-12 text-center">
          <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-white mb-2">No contracts uploaded yet</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">Upload a contract and we will read the key terms, flag anything unfair, and use it to write stronger complaint letters.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 hover:bg-amber-500 text-navy-950 font-semibold rounded-lg transition-all"
          >
            <Upload className="h-4 w-4" /> Upload your first contract
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const status = getContractStatus(c.contract_end_date);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedContract(c)}
                className="text-left bg-navy-900 border border-navy-700/50 rounded-2xl p-5 hover:border-amber-400/30 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <Shield className="h-5 w-5 text-purple-400" />
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <h3 className="text-white font-semibold mb-1 truncate">
                  {c.provider_name || 'Unknown provider'}
                </h3>
                {c.contract_type && (
                  <p className="text-slate-500 text-xs mb-2">{TYPE_LABELS[c.contract_type] || c.contract_type}</p>
                )}
                {c.raw_summary && (
                  <p className="text-slate-400 text-xs line-clamp-2 mb-3">{c.raw_summary}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  {c.contract_end_date && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Ends {formatDate(c.contract_end_date)}
                    </span>
                  )}
                  {c.unfair_clauses && c.unfair_clauses.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertCircle className="h-3 w-3" /> {c.unfair_clauses.length} warning{c.unfair_clauses.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
