'use client';

/**
 * /dashboard/money-hub/categories — Category management.
 *
 * Lists every Tier-1 canonical category grouped by section. Under each
 * canonical row the user sees their existing Tier-2 subcategories and a
 * compact "Add subcategory" affordance.
 *
 * Tier-1 is never user-editable — those IDs are the basis of cross-user
 * spending statistics. Tier-2 is fully user-owned: rename, delete, or add
 * as many as they like under any spending parent.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import {
  CATEGORIES_BY_GROUP,
  USER_SELECTABLE_CATEGORIES,
  type Category,
} from '@/lib/categories';

interface UserSubcategory {
  id: string;
  parent_category: Category;
  name: string;
  emoji: string | null;
  created_at?: string;
}

export default function CategoryManagementPage() {
  const [subcats, setSubcats] = useState<UserSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/money-hub/user-categories', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSubcats(json.subcategories ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byParent = useMemo(() => {
    const map = new Map<string, UserSubcategory[]>();
    for (const s of subcats) {
      const arr = map.get(s.parent_category) ?? [];
      arr.push(s);
      map.set(s.parent_category, arr);
    }
    return map;
  }, [subcats]);

  async function addSubcat(parent: string, name: string, emoji?: string) {
    const res = await fetch('/api/money-hub/user-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent, name, emoji }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed');
    }
    await load();
  }

  async function renameSubcat(id: string, name: string) {
    const res = await fetch(`/api/money-hub/user-categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed');
    }
    await load();
  }

  async function deleteSubcat(id: string) {
    const res = await fetch(`/api/money-hub/user-categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed');
    }
    await load();
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <Link href="/dashboard/money-hub" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Money Hub
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Categories</h1>
        <p className="text-slate-600 text-sm mt-1">
          Paybacker groups every transaction into one of these top-level categories so that
          spending stats and budgets stay comparable. You can add your own labels underneath
          any of them — those subcategories are private and won&apos;t change the totals.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        Object.entries(CATEGORIES_BY_GROUP).map(([group, cats]) => (
          <section key={group} className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/60">
              <span className="text-sm font-semibold text-slate-700">{group}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {cats.map((c) => (
                <ParentRow
                  key={c.id}
                  parent={c}
                  childSubcats={byParent.get(c.id) ?? []}
                  onAdd={(name, emoji) => addSubcat(c.id, name, emoji)}
                  onRename={renameSubcat}
                  onDelete={deleteSubcat}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ParentRow({
  parent, childSubcats, onAdd, onRename, onDelete,
}: {
  parent: (typeof USER_SELECTABLE_CATEGORIES)[number];
  childSubcats: UserSubcategory[];
  onAdd: (name: string, emoji?: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onAdd(newName.trim(), newEmoji.trim() || undefined);
      setNewName('');
      setNewEmoji('');
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">{parent.emoji}</span>
        <span className="font-medium text-slate-900 flex-1">{parent.label}</span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Add subcategory
        </button>
      </div>

      {childSubcats.length > 0 && (
        <ul className="mt-2 ml-7 space-y-1">
          {childSubcats.map((s) => (
            <SubcategoryRow
              key={s.id}
              sub={s}
              onRename={(name) => onRename(s.id, name)}
              onDelete={() => onDelete(s.id)}
            />
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 ml-7 flex items-center gap-2">
          <input
            type="text"
            placeholder="emoji"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
            className="w-14 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="text"
            placeholder="Subcategory name (e.g. Organic)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            maxLength={50}
            className="flex-1 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={busy || !newName.trim()}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
          >
            {busy ? '…' : 'Save'}
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(''); setNewEmoji(''); setErr(null); }}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {err && (
        <div className="mt-1 ml-7 text-xs text-red-600">{err}</div>
      )}
    </li>
  );
}

function SubcategoryRow({
  sub, onRename, onDelete,
}: {
  sub: UserSubcategory;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sub.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const cleaned = draft.trim();
    if (!cleaned || cleaned === sub.name) {
      setEditing(false);
      setDraft(sub.name);
      return;
    }
    setBusy(true);
    try {
      await onRename(cleaned);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete subcategory "${sub.name}"? Transactions will keep the parent category — only the personal label is removed.`)) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 text-sm text-slate-700">
      <span aria-hidden className="text-slate-400">{sub.emoji ?? '·'}</span>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(sub.name); } }}
            maxLength={50}
            className="flex-1 text-sm border border-slate-200 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
          <button onClick={save} disabled={busy} className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setEditing(false); setDraft(sub.name); }} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1">{sub.name}</span>
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700" aria-label="Rename">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={remove} disabled={busy} className="text-slate-400 hover:text-red-600 disabled:opacity-50" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  );
}
