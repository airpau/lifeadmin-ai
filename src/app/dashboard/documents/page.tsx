'use client';

// Documents vault: receipts, invoices, bills, statements, certificates,
// policies, contracts and letters found in the user's inbox or imported
// from Google Drive. Every gate shown here is also enforced server side;
// the page only decides what to offer.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DOC_TYPES, DOC_TYPE_LABELS, DOC_TYPE_SINGULAR, type DocType, type DocumentRow } from '@/lib/documents/types';

// ---------------------------------------------------------------------------
// Types for the status endpoint
// ---------------------------------------------------------------------------

interface Status {
  tier: string;
  entitlements: {
    documentsPerMonth: number | null;
    autoDocumentFiling: boolean;
    documentReminders: boolean;
    driveDocumentFiling: boolean;
    accountantRegister: boolean;
    driveImportMaxFiles: number;
  };
  quota: { limit: number | null; used: number; remaining: number | null };
  inboxesConnected: number;
  drive: { connected: boolean; source: 'drive_connection' | null; needsReauth: boolean; email: string | null };
  todoist: { connected: boolean; configured: boolean };
  picker: { configured: boolean; apiKey: string; appId: string };
}

interface ShareLink {
  id: string;
  token_prefix: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  status: 'active' | 'expired' | 'revoked';
}

type Notice = { kind: 'ok' | 'error' | 'upgrade'; text: string } | null;

// ---------------------------------------------------------------------------
// Google Picker (loaded on demand)
// ---------------------------------------------------------------------------

interface PickerDoc { id: string }
interface PickerResponse { action: string; docs?: PickerDoc[] }
interface PickerBuilderLike {
  addView(v: unknown): PickerBuilderLike;
  setOAuthToken(t: string): PickerBuilderLike;
  setDeveloperKey(k: string): PickerBuilderLike;
  setAppId(id: string): PickerBuilderLike;
  setTitle(t: string): PickerBuilderLike;
  enableFeature(f: unknown): PickerBuilderLike;
  setCallback(cb: (r: PickerResponse) => void): PickerBuilderLike;
  build(): { setVisible(v: boolean): void };
}
interface GooglePickerNs {
  picker: {
    DocsView: new (viewId?: unknown) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(m: string): unknown };
    PickerBuilder: new () => PickerBuilderLike;
    ViewId: { DOCS: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}
interface PickerWindow {
  gapi?: { load(name: string, cb: () => void): void };
  google?: GooglePickerNs;
}

const PICKER_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load Google Drive'));
    document.head.appendChild(el);
  });
}

async function openPicker(cfg: { accessToken: string; apiKey: string; appId: string }, multi: boolean): Promise<string[]> {
  await loadScript('https://apis.google.com/js/api.js');
  const w = window as unknown as PickerWindow;
  await new Promise<void>((resolve) => w.gapi!.load('picker', () => resolve()));
  const g = w.google!;
  return new Promise((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS);
    view.setIncludeFolders(false);
    view.setSelectFolderEnabled(false);
    view.setMimeTypes(PICKER_MIME_TYPES);
    let builder = new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setTitle(multi ? 'Choose documents to add to Paybacker' : 'Choose a document to add to Paybacker')
      .setCallback((r) => {
        if (r.action === g.picker.Action.PICKED) resolve((r.docs ?? []).map((d) => d.id));
        else if (r.action === g.picker.Action.CANCEL) resolve([]);
      });
    if (multi) builder = builder.enableFeature(g.picker.Feature.MULTISELECT_ENABLED);
    builder.build().setVisible(true);
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number | null, currency: string | null): string {
  if (n === null || n === undefined) return '';
  const v = Number(n).toFixed(2);
  return !currency || currency === 'GBP' ? `£${v}` : `${v} ${currency}`;
}

function upcomingKeyDate(d: DocumentRow): { label: string; date: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const all = [
    d.due_date ? { label: 'Due', date: d.due_date } : null,
    d.renewal_date ? { label: 'Renews', date: d.renewal_date } : null,
    d.expiry_date ? { label: 'Expires', date: d.expiry_date } : null,
  ].filter((x): x is { label: string; date: string } => !!x && x.date > today);
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all[0] ?? null;
}

const TYPE_BADGE: Record<DocType, string> = {
  receipt: 'bg-emerald-500/10 text-emerald-700',
  invoice: 'bg-sky-500/10 text-sky-700',
  bill: 'bg-orange-500/10 text-orange-700',
  statement: 'bg-indigo-500/10 text-indigo-700',
  certificate: 'bg-teal-500/10 text-teal-700',
  policy: 'bg-violet-500/10 text-violet-700',
  contract: 'bg-amber-500/10 text-amber-700',
  letter: 'bg-slate-500/10 text-slate-700',
  other: 'bg-slate-500/10 text-slate-600',
};

function UpgradeNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-orange-500/5 border border-orange-200 rounded-xl p-3 text-sm text-slate-700">
      <Lock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
      <div>
        {children}{' '}
        <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">
          See plans
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>}>
      <DocumentsVault />
    </Suspense>
  );
}

function DocumentsVault() {
  const params = useSearchParams();
  const focusId = params.get('doc');

  const [status, setStatus] = useState<Status | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [finding, setFinding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [type, setType] = useState<'' | DocType>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const ent = status?.entitlements;

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/documents/status');
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ limit: '200' });
    if (type) sp.set('type', type);
    if (q.trim()) sp.set('q', q.trim());
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    try {
      const res = await fetch(`/api/documents?${sp}`);
      const data = await res.json();
      if (res.ok) {
        setDocs(data.documents ?? []);
        setTotal(data.total ?? 0);
      } else {
        setNotice({ kind: 'error', text: data.error || 'Could not load your documents.' });
      }
    } finally {
      setLoading(false);
    }
  }, [type, q, from, to]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const t = setTimeout(() => void loadDocs(), 250);
    return () => clearTimeout(t);
  }, [loadDocs]);

  // Messages after returning from Google or Todoist
  useEffect(() => {
    if (params.get('drive_connected')) setNotice({ kind: 'ok', text: 'Google Drive is connected.' });
    else if (params.get('drive_error')) setNotice({ kind: 'error', text: 'Google Drive was not connected. Please try again and tick the Drive box on the Google screen.' });
    else if (params.get('todoist_connected')) setNotice({ kind: 'ok', text: 'Todoist is connected. Use the Todoist button on any document with a date.' });
    else if (params.get('todoist_error') === 'upgrade') setNotice({ kind: 'upgrade', text: 'Todoist reminders come with Essential.' });
    else if (params.get('todoist_error')) setNotice({ kind: 'error', text: 'Todoist was not connected. Please try again.' });
  }, [params]);

  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`doc-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, loading]);

  // ---- actions ------------------------------------------------------------

  async function findDocuments() {
    setFinding(true);
    setNotice(null);
    try {
      const res = await fetch('/api/documents/find', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: data.upgradeRequired ? 'upgrade' : 'error', text: data.error || 'Something went wrong. Please try again.' });
        return;
      }
      const parts: string[] = [];
      parts.push(data.saved === 0 ? 'No new documents this time.' : `Filed ${data.saved} new document${data.saved === 1 ? '' : 's'}.`);
      if (data.duplicates > 0) parts.push(`${data.duplicates} you already had.`);
      if (data.driveFiled > 0) parts.push(`${data.driveFiled} copied to your Google Drive.`);
      const reconnect = (data.connections ?? []).filter((c: { status: string }) => c.status === 'needs_reauth');
      if (reconnect.length) parts.push(`Please reconnect ${reconnect.map((c: { email: string }) => c.email).join(', ')}.`);
      if (data.message) parts.push(data.message);
      setNotice({ kind: data.stoppedFor === 'quota' ? 'upgrade' : 'ok', text: parts.join(' ') });
      await Promise.all([loadDocs(), loadStatus()]);
    } catch {
      setNotice({ kind: 'error', text: 'Something went wrong. Please try again.' });
    } finally {
      setFinding(false);
    }
  }

  async function importFromDrive() {
    if (!status) return;
    setNotice(null);
    if (!status.drive.connected) {
      window.location.href = '/api/auth/google-drive';
      return;
    }
    setImporting(true);
    try {
      const tokRes = await fetch('/api/documents/drive/picker-token');
      const cfg = await tokRes.json();
      if (!tokRes.ok) {
        if (cfg.needsDrive) {
          window.location.href = '/api/auth/google-drive';
          return;
        }
        setNotice({ kind: 'error', text: cfg.error || 'Google Drive is not available right now.' });
        return;
      }
      const ids = await openPicker(cfg, (ent?.driveImportMaxFiles ?? 1) > 1);
      if (ids.length === 0) return;
      const res = await fetch('/api/documents/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: data.upgradeRequired ? 'upgrade' : 'error', text: data.error || 'The import did not work. Please try again.' });
        return;
      }
      const problems = (data.results ?? []).filter((r: { status: string }) => r.status === 'error' || r.status === 'skipped');
      setNotice({
        kind: problems.length && !data.saved ? 'error' : 'ok',
        text:
          (data.saved ? `Added ${data.saved} document${data.saved === 1 ? '' : 's'} from Google Drive.` : 'Nothing new was added.') +
          (problems.length ? ` ${problems.map((p: { message?: string }) => p.message).filter(Boolean).join(' ')}` : ''),
      });
      await Promise.all([loadDocs(), loadStatus()]);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Google Drive did not open. Please try again.' });
    } finally {
      setImporting(false);
    }
  }

  async function openDoc(d: DocumentRow, mode: 'view' | 'download') {
    setBusyId(d.id);
    try {
      const res = await fetch(`/api/documents/${d.id}/download?mode=${mode}`);
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error || 'Could not open that document.' });
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDoc(d: DocumentRow) {
    const extra = d.drive_link ? ' The copy in your Google Drive will stay there.' : '';
    if (!window.confirm(`Remove "${d.filename}" from your vault?${extra}`)) return;
    setBusyId(d.id);
    try {
      const res = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error || 'Could not remove that document.' });
        return;
      }
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
      setTotal((t) => Math.max(0, t - 1));
    } finally {
      setBusyId(null);
    }
  }

  async function addToTodoist(d: DocumentRow) {
    if (!status?.todoist.connected) {
      window.location.href = '/api/auth/todoist';
      return;
    }
    setBusyId(d.id);
    try {
      const res = await fetch(`/api/documents/${d.id}/todoist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsTodoist) {
          window.location.href = '/api/auth/todoist';
          return;
        }
        setNotice({ kind: data.upgradeRequired ? 'upgrade' : 'error', text: data.error || 'Todoist did not take the reminder.' });
        return;
      }
      setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, todoist_task_id: data.taskId } : x)));
      setNotice({ kind: 'ok', text: `Added to Todoist for ${fmtDate(data.dueDate)}.` });
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(which: 'drive' | 'todoist') {
    const label = which === 'drive' ? 'Google Drive' : 'Todoist';
    if (!window.confirm(`Disconnect ${label}?`)) return;
    const res = await fetch(`/api/documents/${which}/disconnect`, { method: 'POST' });
    setNotice(res.ok ? { kind: 'ok', text: `${label} is disconnected.` } : { kind: 'error', text: `Could not disconnect ${label}.` });
    await loadStatus();
  }

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const upcoming = docs.filter((d) => {
      const k = upcomingKeyDate(d);
      return !!k && k.date >= today && k.date <= in30;
    }).length;
    const thisYear = new Date().getFullYear().toString();
    const spend = docs
      .filter((d) => (d.doc_type === 'receipt' || d.doc_type === 'invoice' || d.doc_type === 'bill') && (d.doc_date || '').startsWith(thisYear) && (!d.currency || d.currency === 'GBP'))
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    return { upcoming, spend };
  }, [docs]);

  // ---- render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="page-title-row">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-[family-name:var(--font-heading)] flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-orange-600" /> Documents
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Every receipt, bill, policy and certificate from your inbox, filed in one place. Find anything in seconds and never miss a renewal.
          </p>
        </div>
      </div>

      <div className="kpi-row c4" style={{ marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="k-label">Documents filed</div>
          <div className="k-val">{total}</div>
          <div className="k-delta">In your vault</div>
        </div>
        <div className="kpi-card">
          <div className="k-label">Dates in the next 30 days</div>
          <div className={`k-val ${stats.upcoming > 0 ? 'amber' : ''}`}>{stats.upcoming}</div>
          <div className="k-delta">Renewals, due and expiry dates</div>
        </div>
        <div className="kpi-card">
          <div className="k-label">Receipts and bills this year</div>
          <div className="k-val">£{stats.spend.toFixed(2)}</div>
          <div className="k-delta">From the documents shown</div>
        </div>
        <div className="kpi-card">
          <div className="k-label">This month</div>
          <div className="k-val">
            {status?.quota.limit != null ? `${status.quota.used} / ${status.quota.limit}` : status ? 'Unlimited' : ''}
          </div>
          <div className="k-delta">{status?.entitlements.autoDocumentFiling ? 'Filed automatically every day' : 'Filed when you press Find'}</div>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl p-3 flex items-start gap-2 text-sm border ${
            notice.kind === 'ok'
              ? 'bg-emerald-500/5 border-emerald-200 text-emerald-800'
              : notice.kind === 'upgrade'
                ? 'bg-orange-500/5 border-orange-200 text-slate-800'
                : 'bg-red-500/5 border-red-200 text-red-700'
          }`}
        >
          {notice.kind === 'ok' ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : notice.kind === 'upgrade' ? <Lock className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600" /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <div>
            {notice.text}{' '}
            {notice.kind === 'upgrade' && (
              <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">
                See plans
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border border-slate-200/50 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={findDocuments}
            disabled={finding || !status}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {finding ? 'Looking through your inbox...' : 'Find my documents'}
          </button>
          <button
            onClick={importFromDrive}
            disabled={importing || !status || !status.picker.configured}
            title={status && !status.picker.configured ? 'Google Drive import is coming soon' : undefined}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-slate-400 disabled:opacity-60 text-slate-800 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            {status?.drive.connected ? 'Import from Google Drive' : 'Connect Google Drive'}
          </button>
          {ent?.accountantRegister ? (
            <button
              onClick={() => {
                // A file download, not a page: plain navigation is right here.
                window.location.href = '/api/documents/register';
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" /> Register for my accountant (CSV)
            </button>
          ) : null}
        </div>

        {status && status.inboxesConnected === 0 && (
          <p className="text-sm text-slate-600">
            Connect your Gmail or Outlook first so we can find your receipts and bills.{' '}
            <Link href="/dashboard/profile" className="text-orange-600 font-semibold hover:underline">Connect an inbox</Link>
          </p>
        )}
        {status && !ent?.autoDocumentFiling && (
          <UpgradeNote>
            On Free we look when you press the button and keep up to {ent?.documentsPerMonth ?? 20} documents a month. Essential files new receipts and bills for you every day, with reminders before renewals.
          </UpgradeNote>
        )}
        {status && ent?.autoDocumentFiling && !ent.driveDocumentFiling && (
          <p className="text-xs text-slate-500">
            New documents are filed for you every day. Pro also puts a copy of each one into your own Google Drive, neatly sorted by type and year.
          </p>
        )}
        {status && ent?.driveDocumentFiling && (
          <p className="text-xs text-slate-500">
            {status.drive.connected
              ? 'A copy of each new document goes into the Paybacker folder in your Google Drive, sorted by type and year.'
              : 'Connect Google Drive and we will also file a copy of each new document into a Paybacker folder in your Drive.'}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/50 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[200px]">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Search</span>
          <span className="relative block">
            <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Supplier, file name or subject"
              className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-900 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-300"
            />
          </span>
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as '' | DocType)}
            className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
          >
            <option value="">All types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm" />
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm" />
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>
      ) : docs.length === 0 ? (
        <div className="bg-white border border-slate-200/50 rounded-2xl p-12 text-center">
          <FileText className="h-10 w-10 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-900 font-semibold mb-1">{q || type || from || to ? 'Nothing matches those filters' : 'No documents yet'}</p>
          <p className="text-slate-600 text-sm">
            {q || type || from || to
              ? 'Try a different search.'
              : 'Press Find my documents and we will pull your receipts, bills, policies and certificates out of your inbox.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => {
            const key = upcomingKeyDate(d);
            const busy = busyId === d.id;
            return (
              <div
                key={d.id}
                id={`doc-${d.id}`}
                className={`bg-white border rounded-xl p-4 ${focusId === d.id ? 'border-orange-300 ring-2 ring-orange-200' : 'border-slate-200/50'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[d.doc_type]}`}>{DOC_TYPE_SINGULAR[d.doc_type]}</span>
                      {d.supplier && <span className="text-slate-900 font-semibold">{d.supplier}</span>}
                      {d.amount !== null && <span className="text-slate-900">{fmtMoney(d.amount, d.currency)}</span>}
                      {d.vat_amount !== null && <span className="text-xs text-slate-500">VAT {fmtMoney(d.vat_amount, d.currency)}</span>}
                      {key && (
                        <span className="text-xs bg-orange-500/10 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                          {key.label} {fmtDate(key.date)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 truncate">{d.summary || d.filename}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {fmtDate(d.doc_date || d.email_date || d.created_at)} · {d.filename}
                      {d.source === 'drive' ? ' · from Google Drive' : d.email_from ? ` · from ${d.email_from}` : ''}
                    </p>
                    {d.drive_link && (
                      <a href={d.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 mt-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> In your Google Drive
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openDoc(d, 'view')} disabled={busy} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Open
                    </button>
                    {key && ent?.documentReminders && (
                      <>
                        <a href={`/api/documents/${d.id}/ics`} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800">
                          <CalendarPlus className="h-3.5 w-3.5" /> Calendar
                        </a>
                        {status?.todoist.configured && (
                          <button
                            onClick={() => addToTodoist(d)}
                            disabled={busy || !!d.todoist_task_id}
                            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 disabled:opacity-60 text-slate-800"
                          >
                            <ListChecks className="h-3.5 w-3.5" /> {d.todoist_task_id ? 'In Todoist' : 'Todoist'}
                          </button>
                        )}
                      </>
                    )}
                    {key && ent && !ent.documentReminders && (
                      <Link href="/pricing" title="Reminders come with Essential" className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-dashed border-orange-300 text-orange-700">
                        <Lock className="h-3.5 w-3.5" /> Remind me
                      </Link>
                    )}
                    <button onClick={() => deleteDoc(d)} disabled={busy} title="Remove from vault" className="inline-flex items-center text-sm px-2 py-1.5 rounded-lg border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {total > docs.length && <p className="text-xs text-slate-500 text-center">Showing the latest {docs.length} of {total}. Use search or the filters to find older ones.</p>}
        </div>
      )}

      {/* Connections */}
      {status && (
        <div className="bg-white border border-slate-200/50 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider">Connections</h2>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-700">
              <HardDrive className="inline h-4 w-4 mr-1 text-slate-500" />
              Google Drive:{' '}
              {status.drive.connected
                ? `connected${status.drive.email ? ` (${status.drive.email})` : ''}`
                : status.drive.needsReauth
                  ? 'needs reconnecting'
                  : 'not connected'}
            </span>
            {status.drive.connected ? (
              <button onClick={() => disconnect('drive')} className="text-slate-500 hover:text-red-600 text-xs">Disconnect</button>
            ) : (
              <a href="/api/auth/google-drive" className="text-orange-600 font-semibold text-xs hover:underline">Connect</a>
            )}
          </div>
          {status.todoist.configured && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">
                <ListChecks className="inline h-4 w-4 mr-1 text-slate-500" />
                Todoist: {status.todoist.connected ? 'connected' : 'not connected'}
              </span>
              {!ent?.documentReminders ? (
                <span className="text-xs text-slate-500">Comes with Essential</span>
              ) : status.todoist.connected ? (
                <button onClick={() => disconnect('todoist')} className="text-slate-500 hover:text-red-600 text-xs">Disconnect</button>
              ) : (
                <a href="/api/auth/todoist" className="text-orange-600 font-semibold text-xs hover:underline">Connect</a>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            We only ask Google Drive for access to files you pick and the Paybacker folder we create. We never see the rest of your Drive.
          </p>
        </div>
      )}

      {/* Accountant share panel */}
      {status && <SharePanel enabled={!!ent?.accountantRegister} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accountant share links (Pro)
// ---------------------------------------------------------------------------

function SharePanel({ enabled }: { enabled: boolean }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch('/api/documents/share-links');
    if (res.ok) setLinks((await res.json()).links ?? []);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/documents/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create the link.');
        return;
      }
      setCreated(data.url);
      setLabel('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Switch this link off now? Anyone using it will lose access straight away.')) return;
    const res = await fetch(`/api/documents/share-links/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <div className="bg-white border border-slate-200/50 rounded-2xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
        <Link2 className="h-4 w-4" /> Share with your accountant
      </h2>
      {!enabled ? (
        <UpgradeNote>
          Pro gives your accountant a read-only link to your documents register, so tax return time is a forwarded link instead of a shoebox. You decide how long it lasts and can switch it off at any time.
        </UpgradeNote>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Create a read-only link to your documents register. Your accountant can see the list and download files. The link expires on its own and you can switch it off at any time.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 min-w-[200px]">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Name (optional)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="e.g. 2026 tax return"
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
              />
            </label>
            <label>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Lasts for</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm">
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-lg">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {created && (
            <div className="bg-emerald-500/5 border border-emerald-200 rounded-xl p-3 text-sm space-y-2">
              <p className="text-emerald-800 font-semibold">Copy this link now. For your security we only show it once.</p>
              <div className="flex gap-2">
                <input readOnly value={created} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800" onFocus={(e) => e.currentTarget.select()} />
                <button onClick={() => void navigator.clipboard?.writeText(created)} className="text-xs px-3 py-1 rounded-lg border border-slate-300">Copy</button>
              </div>
            </div>
          )}
          {links.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {links.map((l) => (
                <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-700">
                    {l.label || `Link ${l.token_prefix}`}{' '}
                    <span className="text-xs text-slate-500">
                      {l.status === 'active' ? `until ${fmtDate(l.expires_at)}` : l.status === 'revoked' ? 'switched off' : 'expired'}
                      {l.use_count > 0 ? `, opened ${l.use_count} time${l.use_count === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                  {l.status === 'active' && (
                    <button onClick={() => revoke(l.id)} className="text-xs text-slate-500 hover:text-red-600">Switch off</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
