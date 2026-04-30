'use client';

import { useEffect, useState } from 'react';
import { X, Search, Loader2, Building2 } from 'lucide-react';

// TrueLayer decommissioned 2026-04-27. Yapily is the only path now.
const OPEN_BANKING_PROVIDER = 'yapily' as const;

interface Institution {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface BankPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Legacy export kept so existing onClick handlers compile without
 * change. Yapily is institution-pickered (the modal does the work),
 * so this returns false to indicate "open the modal — there is no
 * direct redirect path on Yapily."
 */
export function connectBankDirect() {
  return false;
}

export default function BankPickerModal({ isOpen, onClose }: BankPickerModalProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Yapily: load institution list
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInstitutions([]);
    fetch('/api/yapily/institutions', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const list = data.institutions ?? [];
        console.log('[BankPicker] Loaded', list.length, 'institutions');
        setInstitutions(list);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Yapily: institution picker
  const filtered = search
    ? institutions.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : institutions;

  const handleSelect = async (institution: Institution) => {
    setConnecting(institution.id);
    try {
      const returnTo = encodeURIComponent(window.location.pathname);
      const res = await fetch(`/api/auth/yapily?institutionId=${encodeURIComponent(institution.id)}&returnTo=${returnTo}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setConnecting(null);
        return;
      }
      if (data.authorisationUrl) {
        window.location.href = data.authorisationUrl;
      }
    } catch {
      setError('Failed to start bank connection');
      setConnecting(null);
    }
  };

  const providerLabel = 'Yapily';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Connect Your Bank</h2>
            <p className="text-slate-500 text-sm mt-0.5">Select your bank to connect securely via Open Banking</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search banks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              autoFocus
            />
          </div>
        </div>

        {/* Bank list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">
              {search ? `No banks found matching "${search}"` : 'No banks available'}
            </p>
          )}

          {!loading && !error && filtered.map(inst => (
            <button
              key={inst.id}
              onClick={() => handleSelect(inst)}
              disabled={connecting !== null}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 transition-colors text-left disabled:opacity-50"
            >
              {inst.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inst.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-slate-500" />
                </div>
              )}
              <span className="text-slate-900 text-sm font-medium flex-1">{inst.name}</span>
              {connecting === inst.id && (
                <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <p className="text-xs text-slate-500 text-center">
            FCA regulated via {providerLabel}. Read-only access. We never store your bank credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
