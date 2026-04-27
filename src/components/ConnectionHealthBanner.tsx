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

interface UnhealthyBank {
  id: string;
  bank_name: string;
  provider: string;
  status: string;
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
  const [email, setEmail] = useState<UnhealthyEmail[]>([]);
  const [bank, setBank] = useState<UnhealthyBank[]>([]);
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
        setEmail(d.unhealthy_email ?? []);
        setBank(d.unhealthy_bank ?? []);
      })
      .catch(() => { /* silent — banner just won't render */ });

    return () => { cancelled = true; };
  }, []);

  const total = email.length + bank.length;
  if (dismissed || total === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  // Headline adapts to whether it's email, banks, or a mix — so a single
  // expired bank doesn't read as "all your accounts broke".
  let headline: string;
  if (total === 1) {
    if (email.length === 1) {
      headline = `${email[0].email_address} — ${readableStatus(email[0].status, email[0].last_error)}`;
    } else {
      headline = `${bank[0].bank_name} — ${bank[0].status.replace(/_/g, ' ')}`;
    }
  } else if (email.length > 0 && bank.length > 0) {
    headline = `${email.length} email + ${bank.length} bank connection${bank.length === 1 ? '' : 's'} need attention`;
  } else if (email.length > 0) {
    headline = `${email.length} email connections need attention`;
  } else {
    headline = `${bank.length} bank connections need attention`;
  }

  const explain =
    email.length > 0 && bank.length === 0 ? "Watchdog has paused — dispute replies, renewal reminders and cancellation confirmations won't come through until you reconnect."
    : bank.length > 0 && email.length === 0 ? "Transaction sync has stopped — Money Hub and price-increase detection won't see new activity until you reconnect."
    : "Email + bank sync is paused — alerts, replies and transactions won't update until each connection is reconnected.";

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">{headline}</p>
          <p className="text-xs text-amber-700 mt-0.5">{explain}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {email.slice(0, 2).map((c) => (
              <Link
                key={c.id}
                href={reconnectPath(c.provider_type)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Reconnect {c.email_address}
              </Link>
            ))}
            {bank.slice(0, 2).map((c) => (
              <Link
                key={c.id}
                href="/dashboard/subscriptions?connectBank=true"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Reconnect {c.bank_name}
              </Link>
            ))}
            {total > 4 && (
              <Link
                href="/dashboard/profile"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                View all {total} in Profile
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
