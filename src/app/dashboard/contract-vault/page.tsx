'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  FolderLock,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  Calendar,
  Loader2,
  Upload,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ContractExtraction {
  id: string;
  provider_name: string | null;
  contract_type: string | null;
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
  file_name: string | null;
  extracted_terms: any;
  created_at: string;
  disputes?: { id: string; provider_name: string; status: string } | null;
  subscriptions?: { id: string; provider_name: string; status: string; amount: number } | null;
}

interface Subscription {
  id: string;
  provider_name: string;
  category: string | null;
  contract_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  amount: number;
  billing_cycle: string;
  auto_renews: boolean | null;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  const now = new Date();
  return Math.floor((end.getTime() - now.getTime()) / 86400000);
}

function StatusBadge({ endDate }: { endDate: string | null }) {
  if (!endDate) return <span className="text-xs text-slate-500">No end date</span>;
  const days = daysUntil(endDate);
  if (days < 0) return <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Expired</span>;
  if (days <= 30) return <span className="text-xs bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-full font-medium">Expires in {days}d</span>;
  return <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>;
}

const TYPE_LABELS: Record<string, string> = {
  energy: 'Energy',
  broadband: 'Broadband',
  mobile: 'Mobile',
  insurance: 'Insurance',
  gym: 'Gym',
  streaming: 'Streaming',
  finance: 'Finance',
  other: 'Other',
};

export default function ContractVaultPage() {
  const [uploadedContracts, setUploadedContracts] = useState<ContractExtraction[]>([]);
  const [subscriptionContracts, setSubscriptionContracts] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [providerName, setProviderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Load contracts and subscriptions
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load uploaded contracts
      try {
        const res = await fetch('/api/contracts');
        if (res.ok) {
          const data = await res.json();
          setUploadedContracts(data || []);
        }
      } catch (err) {
        console.error('Failed to load contracts:', err);
      }

      // Load subscriptions with contract end dates
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, provider_name, category, contract_type, contract_start_date, contract_end_date, amount, billing_cycle, auto_renews')
        .eq('user_id', user.id)
        .not('contract_end_date', 'is', null)
        .neq('status', 'cancelled')
        .order('contract_end_date', { ascending: true });

      setSubscriptionContracts(subs || []);
      setLoading(false);
    }
    load();
  }, []);

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF and image files (JPG, PNG, WebP) are supported.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File must be smaller than 10MB.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (providerName.trim()) {
        formData.append('customProviderName', providerName.trim());
      }

      const res = await fetch('/api/contracts/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const newContract = await res.json();
      setUploadedContracts((prev) => [newContract, ...prev]);
      setProviderName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // Delete contract
  const handleDelete = async (contractId: string) => {
    if (!confirm('Delete this contract? This action cannot be undone.')) return;

    try {
      const res = await fetch(`/api/contracts?id=${contractId}`, { method: 'DELETE' });
      if (res.ok) {
        setUploadedContracts((prev) => prev.filter((c) => c.id !== contractId));
      } else {
        setError('Failed to delete contract');
      }
    } catch (err) {
      setError('Failed to delete contract');
    }
  };

  const expiringSoon = subscriptionContracts.filter(
    (c) => c.contract_end_date && daysUntil(c.contract_end_date) <= 30 && daysUntil(c.contract_end_date) >= 0
  );
  const active = subscriptionContracts.filter(
    (c) => !c.contract_end_date || daysUntil(c.contract_end_date) > 30
  );
  const expired = subscriptionContracts.filter(
    (c) => c.contract_end_date && daysUntil(c.contract_end_date) < 0
  );

  return (
    <div className="space-y-6">
      {/* Variant A Contract Vault header (batch7.jsx). Wired to real counts:
          - Active = contracts currently live (rows in state)
          - Renewing soon = within 30 days
          - Disputes open = count where status suggests open dispute on the contract
          - Better-deal opportunity = placeholder until a comparison RPC lands */}
      <div className="page-title-row">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-[family-name:var(--font-heading)] flex items-center gap-2">
            <FolderLock className="h-6 w-6 text-orange-600" /> Contract Vault
          </h1>
          <p className="text-slate-600 text-sm mt-1">Upload contracts and track key terms. Get alerts before contracts auto-renew.</p>
        </div>
      </div>
      {(() => {
        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        // Contracts come from two sources in this page: uploaded PDF extractions
        // and auto-detected subscription-style rows. Combine for the count.
        const allContracts: Array<{ contract_end_date?: string | null }> = [
          ...(uploadedContracts as Array<{ contract_end_date?: string | null }>),
          ...(subscriptionContracts as Array<{ contract_end_date?: string | null }>),
        ];
        const activeCount = allContracts.length;
        const renewingSoon = allContracts.filter((c) => {
          if (!c.contract_end_date) return false;
          const end = new Date(c.contract_end_date);
          return end >= now && end <= in30;
        }).length;
        return (
          <div className="kpi-row c4" style={{marginBottom:16}}>
            <div className="kpi-card">
              <div className="k-label"><FolderLock className="h-3.5 w-3.5" /> Active contracts</div>
              <div className="k-val">{activeCount}</div>
              <div className="k-delta">Tracked in Vault</div>
            </div>
            <div className="kpi-card">
              <div className="k-label">Renewing in 30 days</div>
              <div className={`k-val ${renewingSoon > 0 ? 'amber' : ''}`}>{renewingSoon}</div>
              <div className="k-delta">Switch before auto-renew</div>
            </div>
            <div className="kpi-card">
              <div className="k-label">Disputes open</div>
              <div className="k-val">{0}</div>
              <div className="k-delta">Linked from Disputes Centre</div>
            </div>
            <div className="kpi-card">
              <div className="k-label">Better-deal opportunity</div>
              <div className="k-val green">—</div>
              <div className="k-delta">Comparison detector coming</div>
            </div>
          </div>
        );
      })()}

      {/* Upload Section */}
      <div className="bg-white border border-slate-200/50 rounded-2xl p-8">
        <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4" /> Upload Contract
        </h2>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive
              ? 'border-amber-300 bg-orange-500/5'
              : 'border-slate-200 hover:border-slate-300'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-900 font-semibold mb-1">Drag and drop a contract here</p>
          <p className="text-slate-600 text-sm mb-4">Or click to browse (PDF, JPG, PNG up to 10MB)</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-700 disabled:bg-slate-600 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Browse Files
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
        </div>

        {/* Provider Name Input */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 block">
            Provider Name (Optional)
          </label>
          <input
            type="text"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="e.g. British Gas, Virgin Media"
            className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-300"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Uploaded Contracts Section */}
          {uploadedContracts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Uploaded Contracts ({uploadedContracts.length})
              </h2>
              <div className="space-y-3">
                {uploadedContracts.map((contract) => (
                  <ContractCard key={contract.id} contract={contract} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}

          {/* Subscription Contracts Section */}
          {subscriptionContracts.length === 0 && uploadedContracts.length === 0 ? (
            <div className="bg-white border border-slate-200/50 rounded-2xl p-12 text-center">
              <FolderLock className="h-10 w-10 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-900 font-semibold mb-1">No contracts yet</p>
              <p className="text-slate-600 text-sm mb-6">
                Upload contracts above, or add a contract end date to any subscription to track it here.
              </p>
              <Link
                href="/dashboard/subscriptions"
                className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-700 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" /> Go to Subscriptions
              </Link>
            </div>
          ) : (
            subscriptionContracts.length > 0 && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-slate-900">{subscriptionContracts.length}</p>
                    <p className="text-slate-600 text-xs mt-0.5">Total Contracts</p>
                  </div>
                  <div className="bg-white border border-orange-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600">{expiringSoon.length}</p>
                    <p className="text-slate-600 text-xs mt-0.5">Expiring Soon</p>
                  </div>
                  <div className="bg-white border border-slate-200/50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">
                      £{subscriptionContracts.reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}
                    </p>
                    <p className="text-slate-600 text-xs mt-0.5">Monthly Value</p>
                  </div>
                </div>

                {/* Alert */}
                {expiringSoon.length > 0 && (
                  <div className="bg-orange-500/5 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-orange-600 font-semibold text-sm">
                        {expiringSoon.length} contract{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days
                      </p>
                      <p className="text-slate-600 text-xs mt-0.5">Review these before they auto-renew at potentially higher rates.</p>
                    </div>
                  </div>
                )}

                {/* Expiring Soon */}
                {expiringSoon.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Clock className="h-4 w-4" /> Expiring Soon
                    </h2>
                    <div className="space-y-3">
                      {expiringSoon.map((c) => (
                        <SubscriptionRow key={c.id} contract={c} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Active */}
                {active.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4" /> Active Contracts
                    </h2>
                    <div className="space-y-3">
                      {active.map((c) => (
                        <SubscriptionRow key={c.id} contract={c} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Expired */}
                {expired.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" /> Expired
                    </h2>
                    <div className="space-y-3 opacity-60">
                      {expired.map((c) => (
                        <SubscriptionRow key={c.id} contract={c} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

interface ContractCardProps {
  contract: ContractExtraction;
  onDelete: (id: string) => void;
}

function ContractCard({ contract, onDelete }: ContractCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200/50 rounded-xl overflow-hidden hover:border-amber-300/40 transition-colors">
      {/* Collapsed Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start justify-between gap-4 hover:bg-slate-100/50 transition-colors"
      >
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-slate-900 font-semibold text-sm truncate">
              {contract.provider_name || 'Unknown Provider'}
            </span>
            {contract.contract_type && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                {TYPE_LABELS[contract.contract_type] || contract.contract_type}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 truncate">{contract.file_name || 'Uploaded contract'}</p>
          {contract.raw_summary && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{contract.raw_summary}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {contract.unfair_clauses && contract.unfair_clauses.length > 0 && (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-xs text-red-400 font-medium">{contract.unfair_clauses.length}</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-600" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-600" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <>
          <div className="border-t border-slate-200/50"></div>
          <div className="p-4 space-y-4 bg-white/50">
            {/* Key Terms Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {contract.contract_start_date && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Start Date</p>
                  <p className="text-slate-900 text-sm font-medium">{formatDate(contract.contract_start_date)}</p>
                </div>
              )}
              {contract.contract_end_date && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">End Date</p>
                  <p className="text-slate-900 text-sm font-medium">{formatDate(contract.contract_end_date)}</p>
                </div>
              )}
              {contract.monthly_cost && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Monthly Cost</p>
                  <p className="text-slate-900 text-sm font-medium">£{contract.monthly_cost.toFixed(2)}</p>
                </div>
              )}
              {contract.annual_cost && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Annual Cost</p>
                  <p className="text-slate-900 text-sm font-medium">£{contract.annual_cost.toFixed(2)}</p>
                </div>
              )}
              {contract.minimum_term && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Minimum Term</p>
                  <p className="text-slate-900 text-sm font-medium">{contract.minimum_term}</p>
                </div>
              )}
              {contract.notice_period && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Notice Period</p>
                  <p className="text-slate-900 text-sm font-medium">{contract.notice_period}</p>
                </div>
              )}
            </div>

            {/* Key Clauses */}
            <div className="space-y-3">
              {contract.cancellation_fee && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Cancellation Fee</p>
                  <p className="text-sm text-slate-700">{contract.cancellation_fee}</p>
                </div>
              )}
              {contract.early_exit_fee && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Early Exit Fee</p>
                  <p className="text-sm text-slate-700">{contract.early_exit_fee}</p>
                </div>
              )}
              {contract.auto_renewal && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Auto-Renewal</p>
                  <p className="text-sm text-slate-700">{contract.auto_renewal}</p>
                </div>
              )}
              {contract.price_increase_clause && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Price Increases</p>
                  <p className="text-sm text-slate-700">{contract.price_increase_clause}</p>
                </div>
              )}
              {contract.cooling_off_period && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Cooling Off Period</p>
                  <p className="text-sm text-slate-700">{contract.cooling_off_period}</p>
                </div>
              )}
            </div>

            {/* Unfair Clauses Warning */}
            {contract.unfair_clauses && contract.unfair_clauses.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Potential Unfair Clauses
                </p>
                <ul className="space-y-1">
                  {contract.unfair_clauses.map((clause, idx) => (
                    <li key={idx} className="text-xs text-red-300 leading-relaxed">
                      • {clause}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Other Terms */}
            {contract.extracted_terms &&
              Array.isArray(contract.extracted_terms.extracted_terms) &&
              contract.extracted_terms.extracted_terms.length > 0 && (
                <div className="bg-slate-100/50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Other Notable Terms</p>
                  <ul className="space-y-1">
                    {contract.extracted_terms.extracted_terms.slice(0, 5).map((term: string, idx: number) => (
                      <li key={idx} className="text-xs text-slate-700">
                        • {term}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Delete Button */}
            <button
              onClick={() => onDelete(contract.id)}
              className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium mt-4 py-2 px-3 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Delete Contract
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SubscriptionRow({ contract: c }: { contract: Subscription }) {
  const daysLeft = c.contract_end_date ? daysUntil(c.contract_end_date) : null;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

  return (
    <Link
      href={`/dashboard/subscriptions?highlight=${c.id}`}
      className={`block bg-white border rounded-xl p-4 hover:border-amber-300/40 transition-colors ${
        isExpiringSoon ? 'border-orange-200' : 'border-slate-200/50'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-900 font-semibold text-sm truncate">{c.provider_name}</span>
            {c.contract_type && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                {TYPE_LABELS[c.contract_type] || c.contract_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            {c.contract_start_date && <span>From {formatDate(c.contract_start_date)}</span>}
            {c.contract_end_date && <span>To {formatDate(c.contract_end_date)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-slate-900 font-semibold text-sm">£{c.amount.toFixed(2)}/mo</span>
          <StatusBadge endDate={c.contract_end_date} />
        </div>
      </div>
    </Link>
  );
}
