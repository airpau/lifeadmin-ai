'use client';

/**
 * /dashboard/settings/spaces
 *
 * Create / rename / configure Account Spaces — Emma-style groupings
 * of bank connections so users can separate "Personal" from
 * "Business" from "Joint" in the Money Hub.
 *
 * Pro-gated for multi-space use. Free + Essential still see the
 * default "Everything" Space and can rename it but can't add more.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Plus, Trash2, Check, Sparkles, Briefcase,
  Users as UsersIcon, PiggyBank, Home, Globe, CircleDot, X,
} from 'lucide-react';

interface Connection {
  id: string;
  bank_name: string | null;
  provider: string | null;
  status: string;
  account_display_names: string[] | null;
}

interface Space {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  is_default: boolean;
  connection_ids: string[];
  sort_order: number;
}

const EMOJI_CHOICES = ['🌍', '🏠', '💼', '💰', '🎯', '👨‍👩‍👧', '✈️', '🏡', '🧾', '🪙'];

export default function SpacesSettingsPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tierMessage, setTierMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState<string>('💼');
  const [newConnectionIds, setNewConnectionIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/spaces', { credentials: 'include', cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setSpaces(d.spaces ?? []);
      setConnections(d.connections ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const beginCreate = () => {
    setCreating(true);
    setEditingId(null);
    setNewName('');
    setNewEmoji('💼');
    setNewConnectionIds(new Set());
  };

  const beginEdit = (space: Space) => {
    setEditingId(space.id);
    setCreating(false);
    setNewName(space.name);
    setNewEmoji(space.emoji ?? '🌍');
    setNewConnectionIds(new Set(space.connection_ids));
  };

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setTierMessage(null);
  };

  const toggleConn = (id: string) => {
    setNewConnectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!newName.trim()) return;
    const body = {
      name: newName.trim(),
      emoji: newEmoji,
      connection_ids: Array.from(newConnectionIds),
    };
    const res = editingId
      ? await fetch(`/api/spaces/${editingId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await fetch('/api/spaces', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
    const d = await res.json();
    if (!res.ok) {
      if (d.reason === 'max_spaces_reached') {
        setTierMessage(d.message || 'Upgrade to Pro to add more Spaces.');
      } else {
        setError(d.error || 'Save failed');
      }
      return;
    }
    setCreating(false);
    setEditingId(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this Space? Your accounts and transactions are not affected.')) return;
    const res = await fetch(`/api/spaces/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Delete failed');
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link href="/dashboard/money-hub" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Money Hub
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Spaces</h1>
      <p className="text-sm text-slate-500 mb-6">
        Group your bank connections to separate personal, business and joint finances. Switch between Spaces in the Money Hub header.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {/* List of existing Spaces */}
      <div className="space-y-3 mb-6">
        {spaces.map((s) => (
          <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4">
            {editingId === s.id ? (
              <SpaceEditor
                name={newName} setName={setNewName}
                emoji={newEmoji} setEmoji={setNewEmoji}
                connections={connections}
                selected={newConnectionIds}
                toggleConn={toggleConn}
                onSave={save}
                onCancel={cancel}
                isDefault={s.is_default}
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{s.emoji ?? '🌍'}</span>
                    <span className="font-semibold text-slate-900 truncate">{s.name}</span>
                    {s.is_default && <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Default</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.connection_ids.length === 0
                      ? 'All connected banks'
                      : `${s.connection_ids.length} bank${s.connection_ids.length === 1 ? '' : 's'} included`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => beginEdit(s)} className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Edit</button>
                  {!s.is_default && (
                    <button onClick={() => remove(s.id)} className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg" title="Delete Space">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="bg-white border border-emerald-300 rounded-xl p-4 mb-6">
          <SpaceEditor
            name={newName} setName={setNewName}
            emoji={newEmoji} setEmoji={setNewEmoji}
            connections={connections}
            selected={newConnectionIds}
            toggleConn={toggleConn}
            onSave={save}
            onCancel={cancel}
            isDefault={false}
          />
        </div>
      ) : (
        <button
          onClick={beginCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm"
        >
          <Plus className="h-4 w-4" /> New Space
        </button>
      )}

      {tierMessage && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">{tierMessage}</p>
            <Link href="/pricing" className="text-xs font-medium text-amber-700 hover:text-amber-800 underline mt-1 inline-block">View plans</Link>
          </div>
          <button onClick={() => setTierMessage(null)} className="text-slate-400 hover:text-slate-900"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function SpaceEditor({
  name, setName, emoji, setEmoji, connections, selected, toggleConn, onSave, onCancel, isDefault,
}: {
  name: string; setName: (s: string) => void;
  emoji: string; setEmoji: (s: string) => void;
  connections: Connection[]; selected: Set<string>;
  toggleConn: (id: string) => void;
  onSave: () => void; onCancel: () => void;
  isDefault: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="text-2xl bg-transparent border-0 focus:outline-none"
        >
          {EMOJI_CHOICES.map((em) => <option key={em} value={em}>{em}</option>)}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Business"
          maxLength={40}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">
          {isDefault
            ? 'The default Space always includes every bank. You can rename and re-emoji it, but membership is fixed.'
            : 'Which bank connections should this Space include? Leave everything unchecked to include all banks.'}
        </p>
        {!isDefault && (
          <div className="space-y-1 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2">
            {connections.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-2">No bank connections yet.</p>
            ) : connections.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-800 p-2 hover:bg-slate-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleConn(c.id)}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span>{c.bank_name || c.provider || 'Bank'}</span>
                <span className="text-xs text-slate-500">
                  {c.account_display_names?.length ? `· ${c.account_display_names.length} accounts` : ''}
                </span>
                {c.status !== 'active' && <span className="text-xs text-amber-700">· {c.status}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">Cancel</button>
        <button
          onClick={onSave}
          disabled={!name.trim()}
          className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          <Check className="h-4 w-4" /> Save Space
        </button>
      </div>
    </div>
  );
}
