'use client';
// src/app/dashboard/notifications/page.tsx
// Notifications Inbox (batch7 NotificationsInbox) — wired to the existing
// /api/notifications backend (user_notifications table).

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Settings } from 'lucide-react';

interface NotificationRow {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link_url: string | null;
  dispute_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_ICON: Record<string, { icon: string; tone: 'mint' | 'orange' | 'text' }> = {
  dispute_reply: { icon: '💷', tone: 'mint' },
  dispute_created: { icon: '⚖️', tone: 'mint' },
  dispute_update: { icon: '⚖️', tone: 'mint' },
  price_increase: { icon: '📈', tone: 'orange' },
  renewal: { icon: '📅', tone: 'orange' },
  contract_reminder: { icon: '📅', tone: 'text' },
  subscription_reminder: { icon: '🔔', tone: 'orange' },
  weekly_digest: { icon: '📮', tone: 'text' },
  deal_match: { icon: '📬', tone: 'mint' },
  pocket_agent: { icon: '🤖', tone: 'orange' },
  refund: { icon: '💷', tone: 'mint' },
};

const TYPE_FILTER_GROUPS: Array<{ k: string; label: string; types: string[] }> = [
  { k: 'all', label: 'All', types: [] },
  { k: 'disputes', label: 'Disputes', types: ['dispute_reply', 'dispute_created', 'dispute_update', 'refund'] },
  { k: 'subscriptions', label: 'Subscriptions', types: ['subscription_reminder'] },
  { k: 'deals', label: 'Deals', types: ['deal_match'] },
  { k: 'contracts', label: 'Contracts', types: ['renewal', 'contract_reminder'] },
  { k: 'pocket_agent', label: 'Pocket Agent', types: ['pocket_agent', 'price_increase'] },
  { k: 'digests', label: 'Weekly digests', types: ['weekly_digest'] },
];

function bucketByDay(items: NotificationRow[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const buckets: Record<'Today' | 'Yesterday' | 'Earlier', NotificationRow[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  items.forEach((n) => {
    const t = new Date(n.created_at).getTime();
    if (t >= today) buckets.Today.push(n);
    else if (t >= yesterday) buckets.Yesterday.push(n);
    else buckets.Earlier.push(n);
  });
  return buckets;
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const delta = Date.now() - then;
  const m = Math.round(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    try {
      const res = await fetch('/api/notifications?limit=100');
      const data = await res.json();
      setRows(data.notifications || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    const grp = TYPE_FILTER_GROUPS.find((g) => g.k === filter);
    if (!grp) return rows;
    return rows.filter((r) => grp.types.includes(r.type || ''));
  }, [rows, filter]);

  const buckets = useMemo(() => bucketByDay(filtered), [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    TYPE_FILTER_GROUPS.forEach((g) => {
      if (g.k === 'all') return;
      c[g.k] = rows.filter((r) => g.types.includes(r.type || '')).length;
    });
    return c;
  }, [rows]);

  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setRows((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClick = async (n: NotificationRow) => {
    if (!n.read_at) {
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
      fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    if (n.link_url) window.location.href = n.link_url;
  };

  return (
    <div className="max-w-6xl">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }} className="notif-grid">
        <div>
          <div className="page-title-row" style={{ marginBottom: 18 }}>
            <div>
              <h1 className="page-title">Notifications</h1>
              <p className="page-sub">Everything Paybacker has found for you — disputes, deals, reminders, and weekly digests.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={markAllRead} disabled={markingAll || rows.every((r) => r.read_at)} className="cta-ghost">
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
              <Link href="/dashboard/profile?tab=notifications" className="cta-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Settings style={{ width: 13, height: 13 }} /> Settings
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: 'var(--text-3)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>You're all caught up.</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>New alerts will appear here as we spot them.</div>
            </div>
          ) : (
            (['Today', 'Yesterday', 'Earlier'] as const).map((g) => {
              const items = buckets[g];
              if (!items.length) return null;
              return (
                <div key={g} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10, paddingLeft: 2 }}>
                    {g}
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {items.map((n, i) => {
                      const meta = TYPE_ICON[n.type || ''] || { icon: '🔔', tone: 'text' as const };
                      const unread = !n.read_at;
                      const interactive = !!n.link_url;
                      return (
                        <div
                          key={n.id}
                          onClick={() => handleClick(n)}
                          {...(interactive
                            ? {
                                role: 'button',
                                tabIndex: 0,
                                onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleClick(n);
                                  }
                                },
                                'aria-label': `${n.title || 'Notification'}${unread ? ' (unread)' : ''}`,
                              }
                            : {})}
                          style={{
                            padding: '16px 20px',
                            borderBottom: i < items.length - 1 ? '1px solid var(--divider)' : 'none',
                            display: 'flex',
                            gap: 14,
                            alignItems: 'flex-start',
                            background: unread ? '#FEFDF7' : 'transparent',
                            cursor: interactive ? 'pointer' : 'default',
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9,
                              background: meta.tone === 'mint' ? 'var(--mint-wash)' : meta.tone === 'orange' ? '#FEF3C7' : '#F3F4F6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 17,
                              flexShrink: 0,
                            }}
                          >
                            {meta.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                              <div style={{ fontSize: 14.5, fontWeight: unread ? 700 : 600, color: 'var(--text)' }}>
                                {n.title || 'Notification'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                                {relativeTime(n.created_at)}
                              </div>
                            </div>
                            {n.body && (
                              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{n.body}</div>
                            )}
                          </div>
                          {unread && (
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mint-deep)', marginTop: 16, flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Filter rail */}
        <aside className="notif-rail">
          <div className="card" style={{ padding: 20, position: 'sticky', top: 80 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>
              Filter
            </div>
            {TYPE_FILTER_GROUPS.map((g) => {
              const on = filter === g.k;
              const n = counts[g.k] ?? 0;
              return (
                <button
                  key={g.k}
                  onClick={() => setFilter(g.k)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    margin: '2px -10px',
                    borderRadius: 8,
                    fontSize: 13.5,
                    color: 'var(--text)',
                    background: on ? 'var(--mint-wash)' : 'transparent',
                    fontWeight: on ? 600 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span>{g.label}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{n}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.notif-grid) { grid-template-columns: 1fr !important; }
          :global(.notif-rail) { display: none; }
        }
      `}</style>
    </div>
  );
}
