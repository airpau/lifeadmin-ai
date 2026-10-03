'use client';

// Weekly documents digest: off until the user turns it on. This is a
// shortcut for the 'document_digest' row on the notification settings
// page (the same preference, through the same route).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, Loader2 } from 'lucide-react';

interface Channels {
  email: boolean;
  telegram: boolean;
  whatsapp: boolean;
  push: boolean;
}

export default function DigestOptIn() {
  const [channels, setChannels] = useState<Channels | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/notification-preferences').then(async (r) => {
      if (!r.ok) return;
      const data = (await r.json()) as { events?: Array<{ event: string; channels: Channels }> };
      const row = data.events?.find((e) => e.event === 'document_digest');
      if (row) setChannels(row.channels);
    });
  }, []);

  if (!channels) return null;
  const on = channels.email || channels.telegram || channels.push;

  async function set(enable: boolean) {
    setBusy(true);
    setError(null);
    const next: Channels = { email: enable, telegram: enable, whatsapp: false, push: false };
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [{ event: 'document_digest', ...next }] }),
      });
      if (!res.ok) {
        setError('Could not save that. Please try again.');
        return;
      }
      setChannels(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-700 flex items-start gap-2" style={{ margin: 0 }}>
        <BellRing className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
        <span>
          {on
            ? 'Every Monday morning we send you the renewals, payment dates, expiry dates and warranties coming up in the next 30 days.'
            : 'Want a Monday morning round-up of the renewals, payment dates, expiry dates and warranties coming up in the next 30 days?'}{' '}
          <Link href="/dashboard/settings/notifications" className="text-orange-600 font-semibold hover:underline">Choose channels</Link>
          {error && <span className="block text-red-600">{error}</span>}
        </span>
      </p>
      <button
        onClick={() => set(!on)}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-60 ${on ? 'border border-slate-300 text-slate-700 hover:border-slate-400' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {on ? 'Turn off' : 'Turn on the weekly digest'}
      </button>
    </div>
  );
}
