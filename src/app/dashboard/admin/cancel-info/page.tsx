'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pencil, Save, X, Search, RefreshCw, ShieldAlert, Mail, Phone, Link as LinkIcon } from 'lucide-react';

type DataSource = 'seed' | 'ai' | 'admin' | 'perplexity';
type Confidence = 'high' | 'medium' | 'low';
type AutoSupport = 'none' | 'email' | 'api';

interface Row {
  id: string;
  provider: string;
  display_name: string | null;
  category: string | null;
  method: string;
  email: string | null;
  phone: string | null;
  url: string | null;
  tips: string | null;
  data_source: DataSource;
  confidence: Confidence;
  auto_cancel_support: AutoSupport;
  last_verified_at: string | null;
  updated_at: string | null;
}

interface Stats {
  total: number;
  verified_30d: number;
  unverified: number;
  by_confidence: Record<Confidence, number>;
  by_source: Record<DataSource, number>;
}

function freshnessLabel(v: string | null): { text: string; tone: 'ok' | 'warn' | 'stale' } {
  if (!v) return { text: 'Never verified', tone: 'stale' };
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
  if (days < 1) return { text: 'Today', tone: 'ok' };
  if (days < 30) return { text: `${days}d ago`, tone: 'ok' };
  if (days < 90) return { text: `~${Math.round(days / 7)}w ago`, tone: 'warn' };
  return { text: `${Math.round(days / 30)}mo ago`, tone: 'stale' };
}

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const SOURCE_COLOR: Record<DataSource, string> = {
  seed: 'bg-slate-100 text-slate-600 border-slate-200',
  ai: 'bg-amber-50 text-amber-700 border-amber-200',
  admin: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  perplexity: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export default function AdminCancelInfoPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | DataSource>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/cancel-info');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setStats(data.stats ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.data_source !== sourceFilter) return false;
      if (!q) return true;
      return (
        r.provider.toLowerCase().includes(q) ||
        (r.display_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, sourceFilter]);

  const startEdit = (row: Row) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };
  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cancel-info?id=${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: draft.display_name,
          category: draft.category,
          method: draft.method,
          email: draft.email,
          phone: draft.phone,
          url: draft.url,
          tips: draft.tips,
          auto_cancel_support: draft.auto_cancel_support,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Save failed');
        return;
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/admin" className="text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cancellation coverage</h1>
          <p className="text-sm text-slate-600">
            Every provider our cancel-info endpoint can answer for. Rows with
            low confidence + stale verification are the refresh cron&apos;s next candidates.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Total providers</div>
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Verified &lt; 30d</div>
            <div className="text-2xl font-bold text-green-600">{stats.verified_30d}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Never verified</div>
            <div className="text-2xl font-bold text-amber-600">{stats.unverified}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">High confidence</div>
            <div className="text-2xl font-bold text-slate-900">{stats.by_confidence.high}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search provider, email, category…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as 'all' | DataSource)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All sources</option>
          <option value="seed">Seed (hand-maintained)</option>
          <option value="perplexity">Perplexity (weekly refresh)</option>
          <option value="ai">AI (inline fallback)</option>
          <option value="admin">Admin override</option>
        </select>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>

      {err && (
        <div className="card p-4 border-red-500/30 bg-red-500/10 text-red-700 mb-4 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> {err}
        </div>
      )}

      {loading ? (
        <div className="card p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Provider</th>
                  <th className="text-left px-4 py-3">Contact</th>
                  <th className="text-left px-4 py-3">Confidence</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Verified</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const editing = editingId === r.id;
                  const fresh = freshnessLabel(r.last_verified_at);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 align-top">
                        {editing ? (
                          <input
                            value={draft.display_name ?? ''}
                            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm"
                          />
                        ) : (
                          <div>
                            <div className="font-medium text-slate-900">{r.display_name ?? r.provider}</div>
                            <div className="text-xs text-slate-500">{r.category ?? '—'}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {editing ? (
                          <div className="space-y-1">
                            <input value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="email" className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
                            <input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="phone" className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
                            <input value={draft.url ?? ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="url" className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
                          </div>
                        ) : (
                          <div className="space-y-0.5 text-xs">
                            {r.email && <div className="flex items-center gap-1 text-slate-700"><Mail className="h-3 w-3" /> {r.email}</div>}
                            {r.phone && <div className="flex items-center gap-1 text-slate-700"><Phone className="h-3 w-3" /> {r.phone}</div>}
                            {r.url && <div className="flex items-center gap-1 text-slate-500 truncate max-w-xs"><LinkIcon className="h-3 w-3" /> {r.url.replace('https://', '')}</div>}
                            {!r.email && !r.phone && !r.url && <span className="text-slate-400">—</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOR[r.confidence]}`}>{r.confidence}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_COLOR[r.data_source]}`}>{r.data_source}</span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs">
                        <span className={
                          fresh.tone === 'ok' ? 'text-green-600'
                          : fresh.tone === 'warn' ? 'text-amber-600'
                          : 'text-slate-500'
                        }>{fresh.text}</span>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {editing ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-600 disabled:opacity-50"
                              title="Save"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </button>
                            <button onClick={cancelEdit} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Cancel">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(r)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      No providers match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-4">
        The refresh cron (/api/cron/refresh-cancellation-info) runs every Monday 03:00 UTC.
        It picks the oldest rows first and verifies them via Perplexity, promoting data_source to
        &quot;perplexity&quot; on success. Admin edits lock confidence to &quot;high&quot; so
        the cron won&apos;t overwrite them.
      </p>
    </div>
  );
}
