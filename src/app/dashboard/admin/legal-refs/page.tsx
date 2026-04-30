'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Shield, CheckCircle, AlertTriangle, Clock, RefreshCw, ExternalLink,
  Loader2, ChevronLeft, ArrowLeft, Search, Filter,
} from 'lucide-react';
import Link from 'next/link';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface LegalRef {
  id: string;
  category: string;
  subcategory: string | null;
  law_name: string;
  section: string | null;
  summary: string;
  source_url: string;
  source_type: string;
  strength: string;
  escalation_body: string | null;
  verification_status: string;
  last_verified: string | null;
  last_changed: string | null;
  verification_notes: string | null;
  verified_url: string | null;
  auto_corrected?: boolean | null;
  created_at: string;
}

const PERPLEXITY_COST_PER_ROW_GBP = 0.005 * 0.79; // sonar-pro flat rate × USD→GBP

function relativeTime(d: string | null): string {
  if (!d) return 'Never';
  const then = new Date(d).getTime();
  const diff = Date.now() - then;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

const REVIEW_STATUSES = new Set(['needs_review', 'broken', 'stale', 'error', 'superseded']);
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

function isReviewable(r: LegalRef): boolean {
  if (REVIEW_STATUSES.has(r.verification_status)) return true;
  if (!r.last_verified) return true;
  const verifiedAt = new Date(r.last_verified).getTime();
  if (isNaN(verifiedAt)) return true;
  return Date.now() - verifiedAt > SIXTY_DAYS_MS;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  current: { label: 'Current', icon: CheckCircle, className: 'text-green-400 bg-green-500/10' },
  updated: { label: 'Auto-updated', icon: RefreshCw, className: 'text-emerald-600 bg-emerald-500/10' },
  needs_review: { label: 'Needs review', icon: AlertTriangle, className: 'text-amber-600 bg-amber-100' },
  outdated: { label: 'Outdated', icon: AlertTriangle, className: 'text-red-400 bg-red-500/10' },
};

const STRENGTH_CONFIG: Record<string, string> = {
  strong: 'text-green-400',
  moderate: 'text-amber-600',
  weak: 'text-red-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  energy: 'Energy',
  broadband: 'Broadband / Mobile',
  travel: 'Travel',
  parking: 'Parking',
  debt: 'Debt',
  finance: 'Finance',
  hmrc: 'HMRC',
  council_tax: 'Council Tax',
  dvla: 'DVLA',
  nhs: 'NHS',
};

function formatDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LegalRefsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [refs, setRefs] = useState<LegalRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [aiVerifyingIds, setAiVerifyingIds] = useState<Set<string>>(new Set());
  const [aiResults, setAiResults] = useState<Record<string, { status: string; notes: string; ok: boolean }>>({});
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [reviewPage, setReviewPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [verifyAllRunning, setVerifyAllRunning] = useState(false);
  const [verifyAllResult, setVerifyAllResult] = useState<string | null>(null);
  const [blockEffect, setBlockEffect] = useState<Record<string, { b2c: number; b2b: number; total: number }>>({});
  const REVIEW_PAGE_SIZE = 50;
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
      await fetchRefs();
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRefs = async () => {
    const { data, error } = await supabase
      .from('legal_references')
      .select('*')
      .order('category')
      .order('law_name');

    if (!error && data) {
      setRefs(data);
      // PR γ — fetch block-effect counts (how many letters / disputes cite each ref).
      try {
        const ids = data.map((r: any) => r.id).filter(Boolean);
        if (ids.length > 0) {
          const res = await fetch(`/api/admin/legal-refs/audit?block_effect=${ids.join(',')}`, { credentials: 'include' });
          if (res.ok) {
            const j = await res.json();
            if (j?.counts) setBlockEffect(j.counts);
          }
        }
      } catch {}
    }
    setLoading(false);
  };

  const runVerification = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/cron/verify-legal-refs', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setVerifyResult(
          `Done. ${data.current} current, ${data.updated} auto-updated, ${data.needs_review} need review, ${data.errors} errors out of ${data.total} references.`
        );
        await fetchRefs();
      } else {
        setVerifyResult(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setVerifyResult(`Failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const verifyWithAi = async (ids: string[]) => {
    if (ids.length === 0) return;
    const single = ids.length === 1;
    setAiVerifyingIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    try {
      if (single) {
        const res = await fetch('/api/admin/legal-refs/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ids[0] }),
        });
        const data = await res.json();
        const u = data?.updated;
        if (u) {
          setAiResults(prev => ({
            ...prev,
            [u.id]: {
              status: u.status,
              notes: u.error || u.notes || '',
              ok: u.status !== 'error',
            },
          }));
          setRefs(prev => prev.map(r => (r.id === u.id ? {
            ...r,
            verification_status: u.status === 'error' ? r.verification_status : u.status,
            verified_url: u.current_url ?? r.verified_url,
            verification_notes: u.notes ?? r.verification_notes,
            last_verified: u.status === 'error' ? r.last_verified : new Date().toISOString(),
          } : r)));
        }
      } else {
        // Batch in chunks of 25.
        setBatchProgress({ done: 0, total: ids.length });
        let done = 0;
        for (let i = 0; i < ids.length; i += 25) {
          const chunk = ids.slice(i, i + 25);
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch('/api/admin/legal-refs/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: chunk }),
          });
          // eslint-disable-next-line no-await-in-loop
          const data = await res.json();
          const results: Array<{ id: string; status: string; current_url: string | null; notes: string; error?: string }> = data?.results || [];
          setAiResults(prev => {
            const next = { ...prev };
            results.forEach(r => {
              next[r.id] = { status: r.status, notes: r.error || r.notes || '', ok: r.status !== 'error' };
            });
            return next;
          });
          setRefs(prev => prev.map(r => {
            const u = results.find(x => x.id === r.id);
            if (!u || u.status === 'error') return r;
            return {
              ...r,
              verification_status: u.status,
              verified_url: u.current_url ?? r.verified_url,
              verification_notes: u.notes ?? r.verification_notes,
              last_verified: new Date().toISOString(),
            };
          }));
          done += chunk.length;
          setBatchProgress({ done, total: ids.length });
        }
      }
    } catch (err: any) {
      console.error('verifyWithAi failed', err);
      ids.forEach(id => {
        setAiResults(prev => ({ ...prev, [id]: { status: 'error', notes: err?.message || 'Request failed', ok: false } }));
      });
    } finally {
      setAiVerifyingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      setTimeout(() => setBatchProgress(null), 2000);
    }
  };

  const filtered = refs.filter(r => {
    if (filterStatus !== 'all' && r.verification_status !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.law_name.toLowerCase().includes(q) ||
        (r.section || '').toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = [...new Set(refs.map(r => r.category))].sort();
  const counts = {
    total: refs.length,
    current: refs.filter(r => r.verification_status === 'current').length,
    updated: refs.filter(r => r.verification_status === 'updated').length,
    needs_review: refs.filter(r => r.verification_status === 'needs_review').length,
    outdated: refs.filter(r => r.verification_status === 'outdated').length,
  };

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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3 font-[family-name:var(--font-heading)]">
              <Shield className="h-9 w-9 text-emerald-600" />
              Legal References
            </h1>
            <p className="text-slate-600">{counts.total} references across {categories.length} categories</p>
          </div>
          <button
            onClick={runVerification}
            disabled={verifying}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm shrink-0"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {verifying ? 'Verifying...' : 'Run Verification'}
          </button>
        </div>
      </div>

      {/* PR γ — compliance debt alert. Refs cited in the last (audit
          window) that are currently stale. The block-effect counts come
          from legal_ref_usages so this surfaces refs that high-traffic
          flows depend on. */}
      {(() => {
        const usedRefs = refs.filter((r) => (blockEffect[r.id]?.total ?? 0) > 0);
        const staleUsed = usedRefs.filter((r) => !['current', 'updated', 'verified'].includes(r.verification_status));
        if (usedRefs.length === 0) return null;
        return (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
            staleUsed.length > 0 ? 'bg-red-500/10 border-red-500/20 text-red-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
          }`}>
            Refs used in the audit window: {usedRefs.length} / {staleUsed.length} stale{staleUsed.length > 0 ? ' — compliance debt' : ''}.
          </div>
        );
      })()}

      {/* Verify result banner */}
      {verifyResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
          verifyResult.startsWith('Done') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {verifyResult}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Current', count: counts.current, className: 'border-green-500/20 bg-green-500/5', textClass: 'text-green-400' },
          { label: 'Auto-updated', count: counts.updated, className: 'border-emerald-500/20 bg-emerald-500/5', textClass: 'text-emerald-600' },
          { label: 'Needs review', count: counts.needs_review, className: 'border-amber-200 bg-amber-50', textClass: 'text-amber-600' },
          { label: 'Outdated', count: counts.outdated, className: 'border-red-500/20 bg-red-500/5', textClass: 'text-red-400' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setFilterStatus(filterStatus === card.label.toLowerCase().replace(' ', '_') ? 'all' : card.label.toLowerCase().replace(' ', '_'))}
            className={`border rounded-2xl p-5 text-left transition-all hover:opacity-80 ${card.className}`}
          >
            <p className={`text-3xl font-bold ${card.textClass}`}>{card.count}</p>
            <p className="text-slate-600 text-sm mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-700" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search references..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All statuses</option>
          <option value="current">Current</option>
          <option value="updated">Auto-updated</option>
          <option value="needs_review">Needs review</option>
          <option value="outdated">Outdated</option>
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
          ))}
        </select>
        {(search || filterStatus !== 'all' || filterCategory !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterCategory('all'); }}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-slate-700 text-sm mb-4">Showing {filtered.length} of {refs.length} references</p>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Law / Section</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Last verified</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden xl:table-cell">Strength</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden xl:table-cell" title="How many B2C letters / B2B disputes are currently citing this ref. Wired in PR γ.">Block effect</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ref, i) => {
                const status = STATUS_CONFIG[ref.verification_status] || STATUS_CONFIG.needs_review;
                const StatusIcon = status.icon;
                return (
                  <tr
                    key={ref.id}
                    className={`border-b border-slate-200 hover:bg-slate-100/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-100/30'}`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-slate-900 text-sm font-medium">{ref.law_name}</p>
                      {ref.section && (
                        <p className="text-slate-700 text-xs mt-0.5">{ref.section}</p>
                      )}
                      <p className="text-slate-600 text-xs mt-1 line-clamp-2 max-w-sm">{ref.summary}</p>
                      {ref.verification_notes && (
                        <p className="text-amber-600/70 text-[11px] mt-1 line-clamp-1">{ref.verification_notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
                        {CATEGORY_LABELS[ref.category] || ref.category}
                      </span>
                      {ref.subcategory && (
                        <p className="text-slate-600 text-[11px] mt-1">{ref.subcategory.replace('_', ' ')}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      {ref.auto_corrected && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="Perplexity auto-overwrote the canonical citation. Please review.">
                          <AlertTriangle className="h-3 w-3" />
                          AI auto-correction
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        {formatDate(ref.last_verified)}
                      </div>
                      {ref.last_changed && (
                        <p className="text-slate-600 text-[11px] mt-0.5">Changed: {formatDate(ref.last_changed)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      <span className={`text-xs font-medium capitalize ${STRENGTH_CONFIG[ref.strength] || 'text-slate-600'}`}>
                        {ref.strength}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      {(() => {
                        const c = blockEffect[ref.id];
                        if (!c || c.total === 0) {
                          return <span className="text-xs text-slate-400">—</span>;
                        }
                        const stale = !['current', 'updated', 'verified'].includes(ref.verification_status);
                        return (
                          <span className={`text-xs font-medium ${stale && c.total > 0 ? 'text-red-600' : 'text-slate-700'}`} title={`B2C ${c.b2c} · B2B ${c.b2b}`}>
                            {c.total}{stale ? ' ⚠' : ''}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={ref.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-500 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View source
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Shield className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-600 text-sm">No references match your filters.</p>
          </div>
        )}
      </div>

      {/* Review queue — AI-assisted manual verification */}
      {(() => {
        const reviewable = refs
          .filter(isReviewable)
          .sort((a, b) => {
            // last_verified NULLS FIRST, then created_at DESC
            if (!a.last_verified && b.last_verified) return -1;
            if (a.last_verified && !b.last_verified) return 1;
            if (a.last_verified && b.last_verified) {
              const at = new Date(a.last_verified).getTime();
              const bt = new Date(b.last_verified).getTime();
              if (at !== bt) return at - bt;
            }
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        const totalPages = Math.max(1, Math.ceil(reviewable.length / REVIEW_PAGE_SIZE));
        const page = Math.min(reviewPage, totalPages - 1);
        const slice = reviewable.slice(page * REVIEW_PAGE_SIZE, (page + 1) * REVIEW_PAGE_SIZE);
        const allIds = reviewable.map(r => r.id);
        const totalCost = (reviewable.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(3);
        const anyVerifying = aiVerifyingIds.size > 0;
        return (
          <div className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-[family-name:var(--font-heading)]">
                  Review queue
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  {reviewable.length} reference{reviewable.length === 1 ? '' : 's'} need attention
                  {' '}— needs review, broken, stale, errored, never verified, or last verified &gt; 60 days ago.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {batchProgress && (
                  <span className="text-xs text-slate-600">
                    Verifying {batchProgress.done} of {batchProgress.total}…
                  </span>
                )}
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={anyVerifying || verifyAllRunning || reviewable.length === 0}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                >
                  {anyVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verify needs-review only
                </button>
                <button
                  onClick={() => setConfirmAllOpen(true)}
                  disabled={anyVerifying || verifyAllRunning || refs.length === 0}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  title="Re-verify every legal_references row to establish a clean baseline"
                >
                  {verifyAllRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Re-verify ALL refs (full baseline)
                </button>
              </div>
            </div>

            {verifyAllResult && (
              <div className={`mb-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                verifyAllResult.startsWith('Done') ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}>
                {verifyAllResult}
              </div>
            )}

            {confirmAllOpen && (
              <div
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                onClick={() => setConfirmAllOpen(false)}
              >
                <div
                  className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Re-verify ALL references</h3>
                  <p className="text-sm text-slate-600 mb-5">
                    This will re-verify all {refs.length} refs to establish a clean
                    compliance baseline. Cost ~£{(refs.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(2)}.
                    High-confidence corrections will auto-overwrite the canonical
                    citation fields and be flagged with an amber badge for your review.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmAllOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setConfirmAllOpen(false);
                        setVerifyAllRunning(true);
                        setVerifyAllResult(null);
                        try {
                          const res = await fetch('/api/admin/legal-refs/verify-all', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({}),
                          });
                          const data = await res.json();
                          if (data.ok && data.counts) {
                            const c = data.counts;
                            setVerifyAllResult(
                              `Done. ${c.verified} verified · ${c.updated} auto-updated · ${c.superseded} superseded · ${c.needs_review} needs review · ${c.broken} broken · ${c.error} errors · ${c.auto_corrected} auto-corrected (review).`
                            );
                            await fetchRefs();
                          } else {
                            setVerifyAllResult(`Error: ${data.error || 'Unknown error'}`);
                          }
                        } catch (err: any) {
                          setVerifyAllResult(`Failed: ${err?.message || 'Request failed'}`);
                        } finally {
                          setVerifyAllRunning(false);
                        }
                      }}
                      className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg"
                    >
                      Run full baseline
                    </button>
                  </div>
                </div>
              </div>
            )}

            {confirmOpen && (
              <div
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                onClick={() => setConfirmOpen(false)}
              >
                <div
                  className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm AI verification</h3>
                  <p className="text-sm text-slate-600 mb-5">
                    This will run Perplexity verification on {reviewable.length} row
                    {reviewable.length === 1 ? '' : 's'} at ~£0.004 each = £{totalCost} total.
                    Proceed?
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setConfirmOpen(false);
                        verifyWithAi(allIds);
                      }}
                      className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-lg"
                    >
                      Run verification
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Title / Source</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">Year</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">URL</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Last verified</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((ref) => {
                      const status = STATUS_CONFIG[ref.verification_status] || STATUS_CONFIG.needs_review;
                      const StatusIcon = status.icon;
                      const verifying = aiVerifyingIds.has(ref.id);
                      const result = aiResults[ref.id];
                      const year = (ref.created_at || '').slice(0, 4) || '—';
                      const truncated = ref.source_url.length > 50
                        ? ref.source_url.slice(0, 47) + '…'
                        : ref.source_url;
                      return (
                        <tr key={ref.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-slate-900 text-sm font-medium">{ref.law_name}</p>
                            <p className="text-slate-600 text-xs mt-0.5">{ref.source_type || '—'}{ref.section ? ` · ${ref.section}` : ''}</p>
                          </td>
                          <td className="px-5 py-4 text-slate-700 text-sm hidden md:table-cell">{year}</td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <a
                              href={ref.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-500 text-xs"
                              title={ref.source_url}
                            >
                              {truncated}
                            </a>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </span>
                            {ref.auto_corrected && (
                              <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="Perplexity auto-overwrote the canonical citation. Please review.">
                                <AlertTriangle className="h-3 w-3" />
                                AI auto-correction — please review
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell text-slate-600 text-xs">
                            {relativeTime(ref.last_verified)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <a
                                href={ref.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 px-2.5 py-1.5 border border-slate-200 rounded-lg"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open URL
                              </a>
                              <button
                                onClick={() => verifyWithAi([ref.id])}
                                disabled={verifying}
                                className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 px-2.5 py-1.5 rounded-lg"
                              >
                                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Verify with AI
                              </button>
                            </div>
                            {result && (
                              <p className={`text-[11px] mt-1.5 text-right ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                                {result.ok ? '✓ ' : '✗ '}{result.ok ? `Verified · ${result.status}` : result.notes || 'Failed'}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {reviewable.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-slate-600 text-sm">All references are up to date.</p>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-slate-600 text-xs">
                  Page {page + 1} of {totalPages} · showing {slice.length} of {reviewable.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReviewPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setReviewPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <p className="text-slate-600 text-xs mt-4 text-center">
        Verification runs automatically on the 1st of each month. Statutes are checked via legislation.gov.uk. Regulator rules are compared with a fast AI model.
      </p>
    </div>
  );
}
