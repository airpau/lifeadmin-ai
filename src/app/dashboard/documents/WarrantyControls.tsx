'use client';

// Warranty or guarantee on one document: show it, set or correct it
// (every plan), and add a calendar or Todoist reminder before it ends
// (Essential and above).

import { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, ListChecks, Lock, ShieldCheck } from 'lucide-react';

export interface WarrantyDoc {
  id: string;
  warranty_until: string | null;
  warranty_note: string | null;
  warranty_todoist_task_id: string | null;
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function WarrantyBadge({ doc }: { doc: WarrantyDoc }) {
  if (!doc.warranty_until) return null;
  const today = new Date().toISOString().slice(0, 10);
  const ended = doc.warranty_until < today;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ended ? 'bg-slate-500/10 text-slate-600' : 'bg-teal-500/10 text-teal-700'}`} title={doc.warranty_note ?? undefined}>
      {ended ? 'Warranty ended' : 'Warranty to'} {fmtDate(doc.warranty_until)}
    </span>
  );
}

export default function WarrantyControls({
  doc,
  remindersEnabled,
  todoistConfigured,
  todoistConnected,
  onChange,
  onNotice,
}: {
  doc: WarrantyDoc;
  remindersEnabled: boolean;
  todoistConfigured: boolean;
  todoistConnected: boolean;
  onChange: (patch: Partial<WarrantyDoc>) => void;
  onNotice: (kind: 'ok' | 'error' | 'upgrade', text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(doc.warranty_until ?? '');
  const [months, setMonths] = useState('');
  const [note, setNote] = useState(doc.warranty_note ?? '');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = !!doc.warranty_until && doc.warranty_until > today;

  async function save(clear = false) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = clear
        ? { warranty_until: null }
        : months
          ? { months: Number(months), warranty_note: note || null }
          : { warranty_until: until || null, warranty_note: note || null };
      const res = await fetch(`/api/documents/${doc.id}/warranty`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        onNotice('error', data.error || 'Could not save the warranty.');
        return;
      }
      onChange({ warranty_until: data.warranty_until, warranty_note: data.warranty_note, ...(data.warranty_until !== doc.warranty_until ? { warranty_todoist_task_id: null } : {}) });
      setUntil(data.warranty_until ?? '');
      setMonths('');
      setOpen(false);
      onNotice('ok', clear ? 'Warranty removed.' : `Warranty saved: covered until ${fmtDate(data.warranty_until)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function todoist() {
    if (!todoistConnected) {
      window.location.href = '/api/auth/todoist';
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/warranty/todoist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsTodoist) {
          window.location.href = '/api/auth/todoist';
          return;
        }
        onNotice(data.upgradeRequired ? 'upgrade' : 'error', data.error || 'Todoist did not take the reminder.');
        return;
      }
      onChange({ warranty_todoist_task_id: data.taskId });
      onNotice('ok', `Warranty reminder added to Todoist for ${fmtDate(data.dueDate)}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800" title="Warranty or guarantee">
        <ShieldCheck className="h-3.5 w-3.5" /> Warranty
      </button>
      {upcoming && remindersEnabled && (
        <>
          <a href={`/api/documents/${doc.id}/warranty/ics`} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-800" title="Calendar reminder before the warranty ends">
            <CalendarPlus className="h-3.5 w-3.5" /> Warranty reminder
          </a>
          {todoistConfigured && (
            <button onClick={todoist} disabled={busy || !!doc.warranty_todoist_task_id} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 disabled:opacity-60 text-slate-800">
              <ListChecks className="h-3.5 w-3.5" /> {doc.warranty_todoist_task_id ? 'In Todoist' : 'Warranty to Todoist'}
            </button>
          )}
        </>
      )}
      {upcoming && !remindersEnabled && (
        <Link href="/pricing" title="Warranty reminders come with Essential" className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-dashed border-orange-300 text-orange-700">
          <Lock className="h-3.5 w-3.5" /> Remind me
        </Link>
      )}
      {open && (
        <div className="basis-full w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-end">
          <label>
            <span className="text-xs font-semibold text-slate-700 block mb-1">Covered until</span>
            <input type="date" value={until} onChange={(e) => { setUntil(e.target.value); setMonths(''); }} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-700 block mb-1">or length in months</span>
            <input type="number" min={1} max={300} value={months} onChange={(e) => setMonths(e.target.value)} placeholder="24" className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="flex-1 min-w-[160px]">
            <span className="text-xs font-semibold text-slate-700 block mb-1">What it covers</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Bosch washing machine" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <button onClick={() => save()} disabled={busy || (!until && !months)} className="text-sm px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold disabled:opacity-60">
            Save
          </button>
          {doc.warranty_until && (
            <button onClick={() => save(true)} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700">
              Remove
            </button>
          )}
          <p className="basis-full text-xs text-slate-500">A length is counted from the purchase date on the receipt. You can always correct a date we read from the receipt.</p>
        </div>
      )}
    </>
  );
}
