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
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  current: { label: 'Current', icon: CheckCircle, className: 'text-green-400 bg-green-500/10' },
  updated: { label: 'Auto-updated', icon: RefreshCw, className: 'text-mint-400 bg-mint-400/10' },
  needs_review: { label: 'Needs review', icon: AlertTriangle, className: 'text-amber-400 bg-amber-500/10' },
  outdated: { label: 'Outdated', icon: AlertTriangle, className: 'text-red-400 bg-red-500/10' },
};

const STRENGTH_CONFIG: Record<string, string> = {
  strong: 'text-green-400',
  moderate: 'text-amber-400',
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

    if (!error && data) setRefs(data);
    setLoading(false);
  };

  const runVerification = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET || '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';
      const res = await fetch('/api/cron/verify-legal-refs', {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
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
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400">Admin access only.</p>
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
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3 font-[family-name:var(--font-heading)]">
              <Shield className="h-9 w-9 text-mint-400" />
              Legal References
            </h1>
            <p className="text-slate-400">{counts.total} references across {categories.length} categories</p>
          </div>
          <button
            onClick={runVerification}
            disabled={verifying}
            className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm shrink-0"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {verifying ? 'Verifying...' : 'Run Verification'}
          </button>
        </div>
      </div>

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
          { label: 'Auto-updated', count: counts.updated, className: 'border-mint-400/20 bg-mint-400/5', textClass: 'text-mint-400' },
          { label: 'Needs review', count: counts.needs_review, className: 'border-amber-500/20 bg-amber-500/5', textClass: 'text-amber-400' },
          { label: 'Outdated', count: counts.outdated, className: 'border-red-500/20 bg-red-500/5', textClass: 'text-red-400' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setFilterStatus(filterStatus === card.label.toLowerCase().replace(' ', '_') ? 'all' : card.label.toLowerCase().replace(' ', '_'))}
            className={`border rounded-2xl p-5 text-left transition-all hover:opacity-80 ${card.className}`}
          >
            <p className={`text-3xl font-bold ${card.textClass}`}>{card.count}</p>
            <p className="text-slate-400 text-sm mt-1">{card.label}</p>
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
            placeholder="Search references..."
            className="w-full pl-9 pr-4 py-2.5 bg-navy-900 border border-navy-700/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-mint-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-navy-900 border border-navy-700/50 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-mint-400"
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
          className="px-4 py-2.5 bg-navy-900 border border-navy-700/50 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-mint-400"
        >
          <option value="all">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
          ))}
        </select>
        {(search || filterStatus !== 'all' || filterCategory !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterCategory('all'); }}
            className="px-4 py-2.5 bg-navy-900 border border-navy-700/50 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-slate-500 text-sm mb-4">Showing {filtered.length} of {refs.length} references</p>

      {/* Table */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Law / Section</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Last verified</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden xl:table-cell">Strength</th>
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
                    className={`border-b border-navy-700/30 hover:bg-navy-800/50 transition-colors ${i % 2 === 0 ? '' : 'bg-navy-950/30'}`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-white text-sm font-medium">{ref.law_name}</p>
                      {ref.section && (
                        <p className="text-slate-500 text-xs mt-0.5">{ref.section}</p>
                      )}
                      <p className="text-slate-400 text-xs mt-1 line-clamp-2 max-w-sm">{ref.summary}</p>
                      {ref.verification_notes && (
                        <p className="text-amber-400/70 text-[11px] mt-1 line-clamp-1">{ref.verification_notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs bg-navy-800 text-slate-300 px-2.5 py-1 rounded-full border border-navy-700/50">
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
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        {formatDate(ref.last_verified)}
                      </div>
                      {ref.last_changed && (
                        <p className="text-slate-600 text-[11px] mt-0.5">Changed: {formatDate(ref.last_changed)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      <span className={`text-xs font-medium capitalize ${STRENGTH_CONFIG[ref.strength] || 'text-slate-400'}`}>
                        {ref.strength}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={ref.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-mint-400 hover:text-mint-300 transition-colors whitespace-nowrap"
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
            <p className="text-slate-400 text-sm">No references match your filters.</p>
          </div>
        )}
      </div>

      <p className="text-slate-600 text-xs mt-4 text-center">
        Verification runs automatically on the 1st of each month. Statutes are checked via legislation.gov.uk. Regulator rules are compared with a fast AI model.
      </p>
    </div>
  );
}
