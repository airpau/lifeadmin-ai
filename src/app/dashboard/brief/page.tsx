'use client';
// src/app/dashboard/brief/page.tsx
// Dedicated "your daily brief" page — renders the exact morning brief that was
// sent (persisted to daily_brief_log), so the WhatsApp/Telegram "open for the
// full brief" link lands somewhere that explains the update, not the generic
// dashboard.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Sunrise, Wallet, Scale, RefreshCw, Bell } from 'lucide-react';

interface Brief {
  brief_date: string;
  body_markdown: string;
  created_at: string;
}

/** Render Telegram/WhatsApp-style *bold* inline, keeping everything else as-is. */
function renderInline(line: string) {
  const parts = line.split('*');
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-900">{part}</strong> : <span key={i}>{part}</span>,
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

const QUICK_LINKS = [
  { href: '/dashboard/money-hub', label: 'Money Hub', icon: Wallet },
  { href: '/dashboard/disputes', label: 'Disputes', icon: Scale },
  { href: '/dashboard/subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { href: '/dashboard/notifications', label: 'All notifications', icon: Bell },
];

export default function BriefPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/brief/latest')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setBrief(d?.brief ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Sunrise className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Your daily brief</h1>
          <p className="text-sm text-slate-500">
            {brief ? formatDate(brief.brief_date) : 'The full picture from your morning summary'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your brief…
        </div>
      ) : brief ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-2 leading-relaxed text-slate-700">
            {brief.body_markdown.split('\n').map((line, i) =>
              line.trim() === '' ? (
                <div key={i} className="h-2" />
              ) : (
                <p key={i}>{renderInline(line)}</p>
              ),
            )}
          </div>
        </article>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="font-medium text-slate-700">No brief yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Your daily brief is sent each morning and will appear here. Check back after your next
            morning summary.
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Jump to
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
            >
              <Icon className="h-4 w-4 text-amber-600" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
