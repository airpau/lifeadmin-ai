'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Shield, CheckCircle, XCircle, Clock, RefreshCw, ExternalLink,
  Loader2, ArrowLeft, Search, Filter, AlertTriangle, Zap, FileText,
  ChevronDown, ChevronUp, Edit3,
} from 'lucide-react';
import Link from 'next/link';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

type ChangeType = 'content_update' | 'new_legislation' | 'repealed' | 'new_guidance' | 'regulator_change';
type Confidence = 'high' | 'medium' | 'low';
type QueueStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';

interface QueueItem {
  id: string;
  legal_reference_id: string | null;
  change_type: ChangeType;
  source_url: string | null;
  detected_change_summary: string;
  proposed_update: string | null;
  confidence: Confidence;
  status: QueueStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // joined
  legal_references?: {
    law_name: string;
    section: string | null;
    summary: string;
    category: string;
  } | null;
}

interface Stats {
  pending: number;
  autoApplied: number;
  approved: number;
  rejected: number;
  lastScanDate: string | null;
}

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  content_update: 'Content update',
  new_legislation: 'New legislation',
  repealed: 'Repealed',
  new_guidance: 'New guidance',
  regulator_change: 'Regulator change',
};

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; className: string; dotClass: string }> = {
  high: { label: 'High', className: 'text-green-400 bg-green-500/10 border-green-500/20', dotClass: 'bg-green-400' },
  medium: { label: 'Medium', className: 'text-amber-600 bg-amber-100 border-amber-200', dotClass: 'bg-amber-500' },
  low: { label: 'Low', className: 'text-red-400 bg-red-500/10 border-red-500/20', dotClass: 'bg-red-400' },
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; className: string }> = {
  pending: { label: 'Pending review', className: 'text-amber-600 bg-amber-100' },
  approved: { label: 'Approved', className: 'text-green-400 bg-green-500/10' },
  rejected: { label: 'Rejected', className: 'text-slate-600 bg-slate-100' },
  auto_applied: { label: 'Auto-applied', className: 'text-emerald-600 bg-emerald-500/10' },
};

function formatDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LegalUpdatesAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ pending: 0, autoApplied: 0, approved: 0, rejected: 0, lastScanDate: null });

  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);
      await fetchItems();
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('legal_update_queue')
      .select(`
        *,
        legal_references (
          law_name,
          section,
          summary,
          category
        )
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setItems(data as QueueItem[]);
      setStats({
        pending: data.filter(i => i.status === 'pending').length,
        autoApplied: data.filter(i => i.status === 'auto_applied').length,
        approved: data.filter(i => i.status === 'approved').length,
        rejected: data.filter(i => i.status === 'rejected').length,
        lastScanDate: data[0]?.created_at || null,
      });
    }
    setLoading(false);
  };

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/cron/legal-updates', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setScanResult(
          `Scan complete. ${data.changesDetected} changes found — ${data.autoApplied} auto-applied, ${data.queued} queued for review.`
        );
        await fetchItems();
      } else {
        setScanResult(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      setScanResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const doAction = async (id: string, action: 'approve' | 'reject') => {
    setActioning(id);
    try {
      const body: { action: string; edited_update?: string } = { action };
      if (action === 'approve' && editingId === id && editText) {
        body.edited_update = editText;
      }

      const res = await fetch(`/api/admin/legal-updates/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setItems(prev =>
          prev.map(item =>
            item.id === id
              ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' }
              : item
          )
        );
        setStats(prev => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          [action === 'approve' ? 'approved' : 'rejected']:
            prev[action === 'approve' ? 'approved' : 'rejected'] + 1,
        }));
        setEditingId(null);
        setEditText('');
      }
    } finally {
      setActioning(null);
    }
  };

  const filtered = items.filter(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (filterConfidence !== 'all' && item.confidence !== filterConfidence) return false;
    if (filterType !== 'all' && item.change_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.detected_change_summary.toLowerCase().includes(q) ||
        (item.legal_references?.law_name || '').toLowerCase().includes(q) ||
        (item.proposed_update || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">Admin access only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">
              <Zap className="h-9 w-9 text-amber-600" />
              Legal Updates
            </h1>
            <p className="text-slate-600">
              Self-learning legal intelligence queue.
              {stats.lastScanDate && ` Last scan: ${formatDate(stats.lastScanDate)}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/admin/legal-refs"
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 font-medium px-4 py-2.5 rounded-lg transition-all text-sm border border-slate-200/50"
            >
              <FileText className="h-4 w-4" />
              All References
            </Link>
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex items-center gap-2 bg-orange-500 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {scanning ? 'Scanning...' : 'Run Scan Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
          scanResult.startsWith('Scan') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {scanResult}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pending review', count: stats.pending, cls: 'border-amber-200 bg-amber-50', textCls: 'text-amber-600', statusKey: 'pending' },
          { label: 'Auto-applied', count: stats.autoApplied, cls: 'border-emerald-500/20 bg-emerald-500/5', textCls: 'text-emerald-600', statusKey: 'auto_applied' },
          { label: 'Approved', count: stats.approved, cls: 'border-green-500/20 bg-green-500/5', textCls: 'text-green-400', statusKey: 'approved' },
          { label: 'Rejected', count: stats.rejected, cls: 'border-slate-200 bg-slate-50', textCls: 'text-slate-600', statusKey: 'rejected' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setFilterStatus(filterStatus === card.statusKey ? 'all' : card.statusKey)}
            className={`border rounded-2xl p-5 text-left transition-all hover:opacity-80 ${card.cls} ${filterStatus === card.statusKey ? 'ring-1 ring-slate-300' : ''}`}
          >
            <p className={`text-3xl font-bold ${card.textCls}`}>{card.count}</p>
            <p className="text-slate-600 text-sm mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search changes..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200/50 rounded-xl text-slate-900 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-300"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200/50 rounded-xl text-slate-600 text-sm focus:outline-none focus:border-amber-300"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="auto_applied">Auto-applied</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterConfidence}
          onChange={e => setFilterConfidence(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200/50 rounded-xl text-slate-600 text-sm focus:outline-none focus:border-amber-300"
        >
          <option value="all">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200/50 rounded-xl text-slate-600 text-sm focus:outline-none focus:border-amber-300"
        >
          <option value="all">All types</option>
          {Object.entries(CHANGE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(search || filterStatus !== 'pending' || filterConfidence !== 'all' || filterType !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('pending'); setFilterConfidence('all'); setFilterType('all'); }}
            className="px-4 py-2.5 bg-white border border-slate-200/50 rounded-xl text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <p className="text-slate-500 text-sm mb-4">Showing {filtered.length} of {items.length} items</p>

      {/* Queue items */}
      <div className="space-y-3">
        {filtered.map(item => {
          const confidence = CONFIDENCE_CONFIG[item.confidence];
          const status = STATUS_CONFIG[item.status];
          const isExpanded = expandedId === item.id;
          const isEditing = editingId === item.id;
          const isPending = item.status === 'pending';
          const ref = item.legal_references;

          return (
            <div
              key={item.id}
              className="card overflow-hidden"
            >
              {/* Item header */}
              <button
                className="w-full px-5 py-4 text-left flex items-start gap-4 hover:bg-white/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                {/* Confidence dot */}
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${confidence.dotClass}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {ref ? (
                      <span className="text-slate-900 text-sm font-medium">
                        {ref.law_name}{ref.section ? ` — ${ref.section}` : ''}
                      </span>
                    ) : (
                      <span className="text-amber-600 text-sm font-medium">
                        {CHANGE_TYPE_LABELS[item.change_type]} (no existing ref)
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confidence.className}`}>
                      {confidence.label} confidence
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-xs bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200/50">
                      {CHANGE_TYPE_LABELS[item.change_type]}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed line-clamp-2">
                    {item.detected_change_summary}
                  </p>
                  <p className="text-slate-600 text-xs mt-1">{formatDate(item.created_at)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPending && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); doAction(item.id, 'approve'); }}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                      >
                        {actioning === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Approve
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); doAction(item.id, 'reject'); }}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Reject
                      </button>
                    </>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </div>
              </button>

              {/* Expanded detail: diff view + edit */}
              {isExpanded && (
                <div className="border-t border-slate-200/50 px-5 py-4 space-y-4">
                  {/* Side-by-side diff */}
                  {ref && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current reference</p>
                        <div className="bg-white/60 border border-slate-200/30 rounded-xl p-4">
                          <p className="text-slate-600 text-sm leading-relaxed">{ref.summary}</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Proposed update</p>
                          {isPending && item.proposed_update && (
                            <button
                              onClick={() => {
                                if (isEditing) {
                                  setEditingId(null);
                                  setEditText('');
                                } else {
                                  setEditingId(item.id);
                                  setEditText(item.proposed_update || '');
                                }
                              }}
                              className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs transition-colors"
                            >
                              <Edit3 className="h-3 w-3" />
                              {isEditing ? 'Cancel edit' : 'Edit'}
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={5}
                            className="w-full bg-white/60 border border-amber-300 rounded-xl p-4 text-slate-900 text-sm leading-relaxed focus:outline-none focus:border-amber-300 resize-none"
                          />
                        ) : (
                          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                            <p className="text-slate-700 text-sm leading-relaxed">
                              {item.proposed_update || 'No proposed text — this is a new legislation alert.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* New legislation (no existing ref) */}
                  {!ref && item.proposed_update && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Proposed addition</p>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-slate-700 text-sm leading-relaxed">{item.proposed_update}</p>
                      </div>
                    </div>
                  )}

                  {/* Source URL */}
                  {item.source_url && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">Source:</p>
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-500 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {item.source_url.slice(0, 80)}{item.source_url.length > 80 ? '...' : ''}
                      </a>
                    </div>
                  )}

                  {/* Reviewed info */}
                  {item.reviewed_at && (
                    <p className="text-xs text-slate-600">
                      {item.status === 'auto_applied' ? 'Auto-applied' : `Reviewed by ${item.reviewed_by}`} on {formatDate(item.reviewed_at)}
                    </p>
                  )}

                  {/* Confirm approve with edit */}
                  {isPending && isEditing && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => doAction(item.id, 'approve')}
                        disabled={actioning === item.id}
                        className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                      >
                        {actioning === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        Approve with edits
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <AlertTriangle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-600 text-sm">
            {items.length === 0 ? 'No items in queue. Run a scan to check for legal updates.' : 'No items match your filters.'}
          </p>
        </div>
      )}

      <p className="text-slate-600 text-xs mt-6 text-center">
        Weekly scan runs every Monday at 6am. High-confidence changes are auto-applied. Medium and low confidence are queued here for review.
      </p>
    </div>
  );
}
