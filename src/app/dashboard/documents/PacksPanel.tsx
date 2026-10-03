'use client';

// Packs tab of the Documents page: pick a pack type, set its options,
// check what was found and what is missing, add or remove documents,
// build, download and (Pro) share. Every gate shown here is also
// enforced by the routes; the page only decides what to offer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  Circle,
  Download,
  FolderArchive,
  Link2,
  Loader2,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DOC_TYPE_SINGULAR, type DocType } from '@/lib/documents/types';

type PackType = 'dispute_evidence' | 'lender' | 'tax_year' | 'insurance_claim';

interface PackTypeInfo {
  type: PackType;
  name: string;
  blurb: string;
  audience: string;
  checklist: Array<{ key: string; label: string; required: boolean }>;
}

interface Availability {
  canBuild: boolean;
  buildsPerMonth: number | null;
  buildsUsed: number;
  buildsLeft: number | null;
  canShare: boolean;
}

interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
  required: boolean;
  found: boolean;
  count: number;
  detail: string | null;
}

interface PreviewDoc {
  id: string;
  doc_type: DocType;
  supplier: string | null;
  amount: number | null;
  currency: string | null;
  doc_date: string | null;
  email_date: string | null;
  filename: string;
  summary: string | null;
}

interface Preview {
  title: string;
  description: string;
  checklist: ChecklistItem[];
  complete: boolean;
  documents: PreviewDoc[];
  excluded: Array<{ id: string; reason: string }>;
  truncated: boolean;
  bytes: number;
  manual: { added_ids: string[]; removed_ids: string[] };
}

interface Pack {
  id: string;
  pack_type: PackType;
  title: string;
  params: Record<string, unknown>;
  status: 'draft' | 'building' | 'ready' | 'failed';
  document_count: number;
  missing: Array<{ label: string; required: boolean }>;
  downloadable: boolean;
  size_bytes: number | null;
  error: string | null;
  generated_at: string | null;
}

interface DisputeOption {
  id: string;
  provider_name: string | null;
  issue_type: string | null;
  status: string | null;
  created_at: string;
}

interface ShareLink {
  id: string;
  label: string | null;
  token_prefix: string;
  expires_at: string;
  use_count: number;
  status: 'active' | 'expired' | 'revoked';
}

type Notice = { kind: 'ok' | 'error' | 'upgrade'; text: string } | null;

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number | null, currency: string | null): string {
  if (n === null || n === undefined) return '';
  const v = Number(n).toFixed(2);
  return !currency || currency === 'GBP' ? `£${v}` : `${v} ${currency}`;
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** UK tax year start for a date: 6 April onwards belongs to that year. */
function taxYearStart(d = new Date()): number {
  const y = d.getFullYear();
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 406 ? y : y - 1;
}

const STATUS_LABEL: Record<Pack['status'], string> = {
  draft: 'Not built yet',
  building: 'Building',
  ready: 'Ready to download',
  failed: 'Build failed',
};

// ---------------------------------------------------------------------------

export default function PacksPanel({ initialType, initialDisputeId }: { initialType?: string | null; initialDisputeId?: string | null }) {
  const [types, setTypes] = useState<PackTypeInfo[]>([]);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [editor, setEditor] = useState<{ type: PackType; packId: string | null; params: Record<string, unknown>; title: string } | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([fetch('/api/documents/packs/types'), fetch('/api/documents/packs')]);
    if (t.ok) {
      const d = await t.json();
      setTypes(d.types ?? []);
      setAvail(d.availability ?? null);
    }
    if (p.ok) setPacks((await p.json()).packs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from a dispute: open the evidence bundle for it.
  useEffect(() => {
    if (initialType === 'dispute_evidence' && initialDisputeId) {
      setEditor({ type: 'dispute_evidence', packId: null, params: { dispute_id: initialDisputeId }, title: '' });
    } else if (initialType && ['lender', 'tax_year', 'insurance_claim', 'dispute_evidence'].includes(initialType)) {
      setEditor({ type: initialType as PackType, packId: null, params: initialType === 'tax_year' ? { tax_year: taxYearStart() - 1 } : {}, title: '' });
    }
  }, [initialType, initialDisputeId]);

  async function build(pack: Pack) {
    setBusyPack(pack.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/documents/packs/${pack.id}/build`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: data.upgradeRequired ? 'upgrade' : 'error', text: data.error || 'The pack could not be built.' });
      } else {
        setNotice({ kind: 'ok', text: `${data.pack.title} is ready to download.${data.skipped ? ` ${data.skipped} file${data.skipped === 1 ? '' : 's'} could not be read and ${data.skipped === 1 ? 'was' : 'were'} left out.` : ''}` });
      }
      await load();
    } catch {
      setNotice({ kind: 'error', text: 'The pack could not be built. Please try again.' });
    } finally {
      setBusyPack(null);
    }
  }

  async function download(pack: Pack) {
    setBusyPack(pack.id);
    try {
      const res = await fetch(`/api/documents/packs/${pack.id}/download`);
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error || 'Could not download the pack.' });
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusyPack(null);
    }
  }

  async function remove(pack: Pack) {
    if (!window.confirm(`Delete "${pack.title}"? The ZIP and any links to it stop working. Your documents stay in your vault.`)) return;
    setBusyPack(pack.id);
    try {
      const res = await fetch(`/api/documents/packs/${pack.id}`, { method: 'DELETE' });
      if (!res.ok) setNotice({ kind: 'error', text: (await res.json()).error || 'Could not delete the pack.' });
      await load();
    } finally {
      setBusyPack(null);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      {avail && avail.buildsPerMonth !== null && (
        <div className="flex items-start gap-2 bg-orange-500/5 border border-orange-200 rounded-xl p-3 text-sm text-slate-700">
          <Lock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
          <div>
            You can check what any pack would contain for free. On the Free plan you can build {avail.buildsPerMonth} pack a month
            {avail.buildsLeft === 0 ? ', and you have used it this month.' : '.'} Essential builds as many as you need.{' '}
            <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">See plans</Link>
          </div>
        </div>
      )}

      {editor ? (
        <PackEditor
          key={`${editor.type}-${editor.packId ?? 'new'}`}
          info={types.find((t) => t.type === editor.type) ?? null}
          initial={editor}
          avail={avail}
          onClose={() => setEditor(null)}
          onSaved={async (msg, buildPackId) => {
            setEditor(null);
            await load();
            if (msg) setNotice(msg);
            if (buildPackId) {
              const p = (await (await fetch('/api/documents/packs')).json()).packs?.find((x: Pack) => x.id === buildPackId);
              if (p) await build(p);
            }
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {types.map((t) => (
            <div key={t.type} className="bg-white border border-slate-200/50 rounded-2xl p-5 flex flex-col">
              <h3 className="text-slate-900 font-semibold flex items-center gap-2">
                <FolderArchive className="h-4 w-4 text-orange-600" /> {t.name}
              </h3>
              <p className="text-sm text-slate-600 mt-1 flex-1">{t.blurb}</p>
              <p className="text-xs text-slate-500 mt-2">{t.audience}</p>
              <button
                onClick={() => setEditor({ type: t.type, packId: null, params: t.type === 'tax_year' ? { tax_year: taxYearStart() - 1 } : {}, title: '' })}
                className="mt-3 self-start inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-4 py-2 rounded-lg"
              >
                <Search className="h-4 w-4" /> Check what I have
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200/50 rounded-2xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider">Your packs</h2>
        {packs.length === 0 ? (
          <p className="text-sm text-slate-600">No packs yet. Pick one above to see what you already have and what is missing.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {packs.map((p) => {
              const busy = busyPack === p.id;
              const missingRequired = (p.missing ?? []).filter((m) => m.required).length;
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-slate-900 font-semibold">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        {types.find((t) => t.type === p.pack_type)?.name ?? 'Pack'} · {p.document_count} document{p.document_count === 1 ? '' : 's'} ·{' '}
                        <span className={p.status === 'failed' ? 'text-red-600' : p.status === 'ready' ? 'text-emerald-700' : ''}>{STATUS_LABEL[p.status]}</span>
                        {p.generated_at && p.status === 'ready' ? ` on ${fmtDate(p.generated_at)}` : ''}
                        {p.size_bytes && p.status === 'ready' ? `, ${fmtSize(p.size_bytes)}` : ''}
                      </p>
                      {missingRequired > 0 && <p className="text-xs text-orange-700 mt-0.5">{missingRequired} usual item{missingRequired === 1 ? '' : 's'} missing</p>}
                      {p.error && <p className="text-xs text-red-600 mt-0.5">{p.error}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setEditor({ type: p.pack_type, packId: p.id, params: p.params, title: p.title })}
                        disabled={busy}
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => build(p)}
                        disabled={busy || p.status === 'building'}
                        className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800 disabled:opacity-60"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />}
                        {p.status === 'ready' ? 'Build again' : 'Build'}
                      </button>
                      {p.downloadable && (
                        <button onClick={() => download(p)} disabled={busy} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                      )}
                      {p.downloadable &&
                        (avail?.canShare ? (
                          <button onClick={() => setSharing(sharing === p.id ? null : p.id)} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800">
                            <Link2 className="h-3.5 w-3.5" /> Share
                          </button>
                        ) : (
                          <Link href="/pricing" title="Sharing a pack by link comes with Pro" className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-dashed border-orange-300 text-orange-700">
                            <Lock className="h-3.5 w-3.5" /> Share
                          </Link>
                        ))}
                      <button onClick={() => remove(p)} disabled={busy} title="Delete pack" className="inline-flex items-center text-sm px-2 py-1.5 rounded-lg border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {sharing === p.id && <PackShare packId={p.id} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Packs are built from your own documents and never sent to anyone by Paybacker. Identity documents such as passports and driving licences are never put in a pack.
        </p>
      </div>
    </div>
  );
}

function NoticeBar({ notice, onClose }: { notice: NonNullable<Notice>; onClose?: () => void }) {
  return (
    <div
      className={`rounded-xl p-3 flex items-start gap-2 text-sm border ${
        notice.kind === 'ok' ? 'bg-emerald-500/5 border-emerald-200 text-emerald-800' : notice.kind === 'upgrade' ? 'bg-orange-500/5 border-orange-200 text-slate-800' : 'bg-red-500/5 border-red-200 text-red-700'
      }`}
    >
      {notice.kind === 'ok' ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : notice.kind === 'upgrade' ? <Lock className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600" /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
      <div className="flex-1">
        {notice.text}{' '}
        {notice.kind === 'upgrade' && <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">See plans</Link>}
      </div>
      {onClose && (
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create or review one pack
// ---------------------------------------------------------------------------

function PackEditor({
  info,
  initial,
  avail,
  onClose,
  onSaved,
}: {
  info: PackTypeInfo | null;
  initial: { type: PackType; packId: string | null; params: Record<string, unknown>; title: string };
  avail: Availability | null;
  onClose: () => void;
  onSaved: (msg: Notice, buildPackId?: string) => void | Promise<void>;
}) {
  const startManual = {
    added_ids: Array.isArray(initial.params.added_ids) ? (initial.params.added_ids as string[]) : [],
    removed_ids: Array.isArray(initial.params.removed_ids) ? (initial.params.removed_ids as string[]) : [],
  };
  const [params, setParams] = useState<Record<string, unknown>>(() => {
    const { added_ids: _a, removed_ids: _r, ...rest } = initial.params;
    void _a;
    void _r;
    return rest;
  });
  const [manual, setManual] = useState(startManual);
  const [title, setTitle] = useState(initial.title);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<DisputeOption[]>([]);
  const [policies, setPolicies] = useState<PreviewDoc[]>([]);
  const type = initial.type;

  useEffect(() => {
    if (type === 'dispute_evidence') {
      void fetch('/api/documents/packs/disputes').then(async (r) => r.ok && setDisputes((await r.json()).disputes ?? []));
    }
    if (type === 'insurance_claim') {
      void Promise.all([fetch('/api/documents?type=policy&limit=100'), fetch('/api/documents?type=certificate&limit=100')]).then(async ([a, b]) => {
        const docs: PreviewDoc[] = [];
        if (a.ok) docs.push(...((await a.json()).documents ?? []));
        if (b.ok) docs.push(...((await b.json()).documents ?? []));
        setPolicies(docs);
      });
    }
  }, [type]);

  const check = useCallback(
    async (m = manual, p = params) => {
      setChecking(true);
      setError(null);
      try {
        const res = await fetch('/api/documents/packs/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pack_type: type, params: p, ...m }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPreview(null);
          setError(data.error || 'Could not check your documents.');
          return;
        }
        setPreview(data);
        if (!title) setTitle(data.title);
      } finally {
        setChecking(false);
      }
    },
    [manual, params, type, title],
  );

  // Review an existing pack, or arrive with options already set: check straight away.
  useEffect(() => {
    const ready = type === 'lender' || type === 'tax_year' || (type === 'dispute_evidence' && params.dispute_id) || (type === 'insurance_claim' && initial.packId);
    if (ready) void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeDoc(id: string) {
    const m = { added_ids: manual.added_ids.filter((x) => x !== id), removed_ids: [...new Set([...manual.removed_ids, id])] };
    setManual(m);
    void check(m);
  }

  function addDoc(id: string) {
    const m = { added_ids: [...new Set([...manual.added_ids, id])], removed_ids: manual.removed_ids.filter((x) => x !== id) };
    setManual(m);
    void check(m);
  }

  async function save(andBuild: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(initial.packId ? `/api/documents/packs/${initial.packId}` : '/api/documents/packs', {
        method: initial.packId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_type: type, params, title, ...manual }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save the pack.');
        return;
      }
      await onSaved(andBuild ? null : { kind: 'ok', text: `Saved "${data.pack.title}". Build it when you are ready.` }, andBuild ? data.pack.id : undefined);
    } finally {
      setSaving(false);
    }
  }

  const selectedIds = useMemo(() => new Set((preview?.documents ?? []).map((d) => d.id)), [preview]);
  const thisYear = taxYearStart();
  const canBuild = !avail || avail.canBuild || !!initial.packId;

  return (
    <div className="bg-white border border-orange-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{info?.name ?? 'Pack'}</h2>
          <p className="text-sm text-slate-600">{info?.blurb}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {type === 'dispute_evidence' && (
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Which dispute</span>
            <select
              value={String(params.dispute_id ?? '')}
              onChange={(e) => {
                const p = { dispute_id: e.target.value };
                setParams(p);
                setTitle('');
                if (e.target.value) void check(manual, p);
              }}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
            >
              <option value="">Choose a dispute</option>
              {disputes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.provider_name || 'Dispute'} · {fmtDate(d.created_at)}
                  {d.issue_type ? ` · ${d.issue_type.replace(/_/g, ' ')}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'tax_year' && (
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Tax year</span>
            <select
              value={String(params.tax_year ?? thisYear - 1)}
              onChange={(e) => {
                const p = { tax_year: Number(e.target.value) };
                setParams(p);
                setTitle('');
                void check(manual, p);
              }}
              className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
            >
              {Array.from({ length: 7 }, (_, i) => thisYear - i).map((y) => (
                <option key={y} value={y}>
                  6 April {y} to 5 April {y + 1}
                  {y === thisYear ? ' (this tax year so far)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'insurance_claim' && (
          <InsuranceOptions
            params={params}
            policies={policies}
            onChange={(p) => {
              setParams(p);
              setPreview(null);
            }}
          />
        )}

        {(type !== 'lender' || preview) && (
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={preview?.title ?? 'Name this pack'}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
            />
          </label>
        )}

        <button
          onClick={() => check()}
          disabled={checking}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {preview ? 'Check again' : 'Check my documents'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Checklist</h3>
            <p className="text-xs text-slate-500 mb-2">{preview.description}</p>
            <ul className="space-y-2">
              {preview.checklist.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {c.found ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : c.required ? (
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <span className="text-slate-900">
                      {c.label}
                      {c.count > 0 ? ` (${c.count})` : ''}
                    </span>
                    {!c.required && <span className="text-xs text-slate-500"> optional</span>}
                    {c.detail && <p className="text-xs text-slate-500">{c.detail}</p>}
                    {!c.found && <p className="text-xs text-slate-500">{c.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              In this pack: {preview.documents.length} document{preview.documents.length === 1 ? '' : 's'}
              {preview.bytes ? `, about ${fmtSize(preview.bytes)}` : ''}
            </h3>
            {preview.documents.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing yet. Add documents from your vault below.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {preview.documents.map((d) => (
                  <li key={d.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-slate-500">{fmtDate(d.doc_date || d.email_date)}</span>{' '}
                      <span className="text-slate-900 font-medium">{d.supplier || 'Unknown supplier'}</span>{' '}
                      <span className="text-slate-600">{DOC_TYPE_SINGULAR[d.doc_type].toLowerCase()}</span>
                      {d.amount !== null && <span className="text-slate-900"> {fmtMoney(d.amount, d.currency)}</span>}
                    </span>
                    <button onClick={() => removeDoc(d.id)} title="Leave this out" className="text-slate-400 hover:text-red-600 flex-shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {preview.excluded.length > 0 && (
              <p className="text-xs text-orange-700 mt-2">
                {preview.excluded.length} document{preview.excluded.length === 1 ? ' looks' : 's look'} like ID and {preview.excluded.length === 1 ? 'was' : 'were'} left out. Identity documents are never put in a pack.
              </p>
            )}
            {preview.truncated && <p className="text-xs text-orange-700 mt-2">This pack holds the first 300 documents only.</p>}
            {manual.removed_ids.length > 0 && (
              <button
                onClick={() => {
                  const m = { ...manual, removed_ids: [] };
                  setManual(m);
                  void check(m);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 mt-2"
              >
                Put back the {manual.removed_ids.length} document{manual.removed_ids.length === 1 ? '' : 's'} you left out
              </button>
            )}
          </div>

          <AddDocuments exclude={selectedIds} onAdd={addDoc} />

          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={() => save(true)}
              disabled={saving || !canBuild}
              title={!canBuild ? 'You have used this month’s free build' : undefined}
              className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-lg"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderArchive className="h-4 w-4" />}
              {initial.packId ? 'Save and build' : 'Build pack'}
            </button>
            <button onClick={() => save(false)} disabled={saving} className="text-sm px-4 py-2 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800">
              {initial.packId ? 'Save changes' : 'Save for later'}
            </button>
            {!canBuild && (
              <span className="text-xs text-slate-600 self-center">
                You have used this month&apos;s free build.{' '}
                <Link href="/pricing" className="text-orange-600 font-semibold hover:underline">Upgrade to build more</Link>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InsuranceOptions({
  params,
  policies,
  onChange,
}: {
  params: Record<string, unknown>;
  policies: PreviewDoc[];
  onChange: (p: Record<string, unknown>) => void;
}) {
  const itemIds = Array.isArray(params.item_ids) ? (params.item_ids as string[]) : [];
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PreviewDoc[]>([]);
  const [chosen, setChosen] = useState<Record<string, PreviewDoc>>({});

  useEffect(() => {
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({ type: 'receipt', limit: '30' });
      if (q.trim()) sp.set('q', q.trim());
      const res = await fetch(`/api/documents?${sp}`);
      if (res.ok) setResults((await res.json()).documents ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function toggle(d: PreviewDoc) {
    const next = itemIds.includes(d.id) ? itemIds.filter((x) => x !== d.id) : [...itemIds, d.id];
    setChosen((c) => ({ ...c, [d.id]: d }));
    onChange({ ...params, item_ids: next });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Your policy</span>
        <select
          value={String(params.policy_document_id ?? '')}
          onChange={(e) => onChange({ ...params, policy_document_id: e.target.value })}
          className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
        >
          <option value="">Choose the policy you are claiming on</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.supplier || 'Policy'} · {p.summary || p.filename} · {fmtDate(p.doc_date || p.email_date)}
            </option>
          ))}
        </select>
        {policies.length === 0 && <span className="text-xs text-slate-500">No policies in your vault yet. Press Find my documents or import one from Google Drive.</span>}
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">What happened</span>
        <textarea
          value={String(params.incident ?? '')}
          onChange={(e) => onChange({ ...params, incident: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="For example: my laptop and headphones were stolen from my car outside the house."
          className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">When it happened</span>
        <input
          type="date"
          value={String(params.incident_date ?? '')}
          onChange={(e) => onChange({ ...params, incident_date: e.target.value || null })}
          className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm"
        />
      </label>
      <div>
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Receipts for the items ({itemIds.length} chosen)</span>
        <span className="relative block mb-2">
          <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your receipts"
            className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-900 text-sm"
          />
        </span>
        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
          {[...itemIds.filter((id) => !results.some((r) => r.id === id) && chosen[id]).map((id) => chosen[id]), ...results].map((d) => (
            <li key={d.id} className="px-3 py-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={itemIds.includes(d.id)} onChange={() => toggle(d)} />
                <span className="text-slate-500">{fmtDate(d.doc_date || d.email_date)}</span>
                <span className="text-slate-900 font-medium">{d.supplier || 'Unknown'}</span>
                <span className="text-slate-600 truncate">{d.summary || d.filename}</span>
                {d.amount !== null && <span className="text-slate-900 ml-auto">{fmtMoney(d.amount, d.currency)}</span>}
              </label>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No receipts found.</li>}
        </ul>
      </div>
    </div>
  );
}

function AddDocuments({ exclude, onAdd }: { exclude: Set<string>; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PreviewDoc[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({ limit: '30' });
      if (q.trim()) sp.set('q', q.trim());
      const res = await fetch(`/api/documents?${sp}`);
      if (res.ok) setResults((await res.json()).documents ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm text-orange-600 font-semibold hover:underline">
        <Plus className="h-4 w-4" /> Add a document from your vault
      </button>
    );
  }
  const shown = results.filter((d) => !exclude.has(d.id));
  return (
    <div className="space-y-2">
      <span className="relative block">
        <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by supplier, file name or subject" className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-900 text-sm" />
      </span>
      <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {shown.map((d) => (
          <li key={d.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-slate-500">{fmtDate(d.doc_date || d.email_date)}</span> <span className="text-slate-900 font-medium">{d.supplier || 'Unknown'}</span>{' '}
              <span className="text-slate-600">{DOC_TYPE_SINGULAR[d.doc_type].toLowerCase()}</span>
            </span>
            <button onClick={() => onAdd(d.id)} className="text-xs px-2 py-1 rounded-lg border border-slate-300 hover:border-slate-400 flex-shrink-0">
              Add
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nothing else matches.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share one pack (Pro)
// ---------------------------------------------------------------------------

function PackShare({ packId }: { packId: string }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/packs/${packId}/share`);
    if (res.ok) setLinks((await res.json()).links ?? []);
  }, [packId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/packs/${packId}/share`, {
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
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <p className="text-sm text-slate-600">
        Send a read-only link to this pack only, for example to your accountant, lender or an ombudsman. They can download the ZIP and nothing else. The link expires on its own and you can switch it off at any time.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[180px]">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Who it is for (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Mortgage broker" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm" />
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">Lasts for</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm">
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
    </div>
  );
}
