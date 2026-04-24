'use client';

/**
 * Dashboard-wide banner surfaced when any of the user's email
 * connections is in a broken state — OAuth token expiry, IMAP auth
 * failure, or a recent error recorded by the Watchdog fetchers.
 *
 * Without this the user sees no sign that their alerts have stopped
 * flowing. Hitting "Reconnect" takes them to the appropriate OAuth
 * flow (or the IMAP profile tab for app-password connections).
 *
 * Dismissal is session-scoped (sessionStorage) — it reappears on the
 * next tab, because the underlying problem hasn't been fixed by
 * dismissing.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

interface UnhealthyEmail {
  id: string;
  email_address: string;
  provider_type: string;
  status: string;
  last_error: string;
}

const DISMISS_KEY = 'connection-health-banner-dismissed';

function reconnectPath(providerType: string): string {
  // Canonical + legacy aliases — matches the provider-gate sets in
  // /api/disputes/[id] so we're consistent across the codebase.
  const p = (providerType ?? '').toLowerCase();
  if (p === 'google' || p === 'gmail') return '/api/auth/google?reconnect=1';
  if (p === 'outlook' || p === 'microsoft') return '/api/auth/microsoft?reconnect=1';
  return '/dashboard/profile?connect_email=true';
}

function readableStatus(status: string, lastError: string): string {
  if (status === 'needs_reauth') return 'Sign-in expired';
  if (status === 'expired') return 'Access expired';
  if (status === 'disconnected') return 'Disconnected';
  if (lastError) return 'Sync error';
  return 'Needs attention';
}

export default function ConnectionHealthBanner() {
  const [unhealthy, setUnhealthy] = useState<UnhealthyEmail[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Respect a session-scoped dismiss.
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch { /* private mode — fall through */ }

    let cancelled = false;
    fetch('/api/connections/health', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled || !d) return;
        setUnhealthy(d.unhealthy_email ?? []);
      })
      .catch(() => { /* silent — banner just won't render */ });

    return () => { cancelled = true; };
  }, []);

  if (dismissed || unhealthy.length === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  // One or many — different copy so a single expiry doesn't read as "they all broke".
  const primary = unhealthy[0];
  const headline = unhealthy.length === 1
    ? `${primary.email_address} — ${readableStatus(primary.status, primary.last_error)}`
    : `${unhealthy.length} email connections need attention`;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">{headline}</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Watchdog has paused on {unhealthy.length === 1 ? 'this account' : 'these accounts'} — dispute replies,
            renewal reminders and cancellation confirmations won&apos;t come through
            until you reconnect.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unhealthy.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                href={reconnectPath(c.provider_type)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Reconnect {c.email_address}
              </Link>
            ))}
            {unhealthy.length > 3 && (
              <Link
                href="/dashboard/profile"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                View all {unhealthy.length} in Profile
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-amber-700 hover:text-amber-900 p-1 flex-shrink-0"
          title="Dismiss for this session"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
