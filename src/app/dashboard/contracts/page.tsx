'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText, Upload, Loader2, Shield, AlertCircle, CheckCircle,
  Clock, ChevronLeft, Trash2, ExternalLink, Link2, X, Plus,
} from 'lucide-react';

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

// ============================================================
// Helpers
// ============================================================
const TYPE_LABELS: Record<string, string> = {
  energy: 'Energy', broadband: 'Broadband', mobile: 'Mobile',
  insurance: 'Insurance', gym: 'Gym', streaming: 'Streaming',
  finance: 'Finance', other: 'Other',
};

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
          <Link href={`/dashboard/complaints`} className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 border border-navy-700/50 hover:border-mint-400/30 text-slate-300 rounded-lg text-sm transition-all">
            <Link2 className="h-4 w-4" /> View linked dispute
          </Link>
        )}
        {contract.subscriptions && (
          <Link href="/dashboard/subscriptions" className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 border border-navy-700/50 hover:border-mint-400/30 text-slate-300 rounded-lg text-sm transition-all">
            <Link2 className="h-4 w-4" /> View subscription
          </Link>
        )}
        <Link
          href={`/dashboard/complaints?new=1&company=${encodeURIComponent(contract.provider_name || '')}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg text-sm transition-all"
        >
          <FileText className="h-4 w-4" /> Write a complaint letter
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Upload Modal
// ============================================================
function UploadModal({ subscriptions, onClose, onUploaded }: {
  subscriptions: Array<{ id: string; provider_name: string }>;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (subscriptionId) fd.append('subscriptionId', subscriptionId);
      // If no subscription, we need at least one link — use a dummy dispute or make subscription_id enough
      // The CHECK constraint requires at least one, so we must have subscriptionId
      if (!subscriptionId) {
        // Upload without link — we'll need to handle this in the API
        // For now, require subscription selection
        alert('Please select a subscription to link this contract to.');
        setUploading(false);
        return;
      }

      const res = await fetch('/api/contracts/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      onUploaded();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to upload contract.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-700/50">
          <h2 className="text-lg font-bold text-white">Upload a contract</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Which subscription is this for?</label>
            <select
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
              className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
            >
              <option value="">Select a subscription</option>
              {subscriptions.map(s => (
                <option key={s.id} value={s.id}>{s.provider_name}</option>
              ))}
            </select>
          </div>

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
              <label className="flex items-center gap-3 w-full px-4 py-6 bg-navy-950 border-2 border-dashed border-purple-500/30 rounded-lg text-slate-400 hover:border-purple-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm text-center justify-center">
                <Upload className="h-6 w-6 text-purple-400" />
                <span>Drop your contract here or click to browse</span>
                <input
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
            <p className="text-[11px] text-slate-600 mt-2">PDF, JPG, or PNG. We read the key terms and flag anything unfair.</p>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || !subscriptionId || uploading}
            className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Reading your contract...</>
            ) : (
              <><Shield className="h-4 w-4" /> Upload and analyse</>
            )}
          </button>
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
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; provider_name: string }>>([]);
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
      .then((data: any) => {
        const subs = Array.isArray(data) ? data : data.subscriptions || [];
        setSubscriptions(subs.map((s: any) => ({ id: s.id, provider_name: s.provider_name })));
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
          className="flex items-center gap-2 px-4 py-2.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg transition-all"
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
              className={`text-xs px-3 py-1.5 rounded-full transition-all ${filterType === 'all' ? 'bg-mint-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
            >
              All ({contracts.length})
            </button>
            {types.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all ${filterType === t ? 'bg-mint-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
              >
                {TYPE_LABELS[t] || t}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
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
          <Loader2 className="h-8 w-8 animate-spin text-mint-400" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-navy-950/50 border border-dashed border-navy-700/50 rounded-2xl p-12 text-center">
          <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-white mb-2">No contracts uploaded yet</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">Upload a contract and we will read the key terms, flag anything unfair, and use it to write stronger complaint letters.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold rounded-lg transition-all"
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
                className="text-left bg-navy-900 border border-navy-700/50 rounded-2xl p-5 hover:border-mint-400/30 transition-all"
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
