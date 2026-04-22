'use client';

/**
 * NotificationBell
 *
 * Dashboard header widget: bell icon + unread pulse, click opens a popover
 * listing the most recent notifications. Used by the Watchdog feature to
 * surface auto-imported dispute replies, but generic — any future notification
 * type with `type`, `title`, `body`, `link_url` will render here.
 *
 * Data flow:
 *   - Polls GET /api/notifications/unread-count every 60s.
 *   - Opens GET /api/notifications?limit=15 on click.
 *   - Clicking a notification routes to `link_url` and POSTs mark-read.
 *   - "Mark all as read" calls mark-read with { all: true }.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Mail, FileText, Sparkles, X } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  dispute_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const ICON_FOR_TYPE: Record<string, typeof Bell> = {
  dispute_reply: Mail,
  dispute_resolved: Sparkles,
  letter_ready: FileText,
};

function timeAgoShort(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Number(data.count ?? 0));
    } catch {
      /* silent */
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=15', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 60s
  useEffect(() => {
    fetchUnreadCount();
    const i = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(i);
  }, [fetchUnreadCount]);

  // Refetch list whenever popover opens
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotificationClick = async (n: Notification) => {
    // Optimistic: drop from unread immediately
    setItems((prev) =>
      prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)),
    );
    setUnreadCount((c) => Math.max(0, n.read_at ? c : c - 1));

    fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    }).catch(() => {});

    if (n.link_url) {
      setOpen(false);
      router.push(n.link_url);
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* silent */
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-brand-400 animate-ping" />
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-brand-400" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {items.some((i) => !i.read_at) && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-slate-500 hover:text-mint-400 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-900 p-0.5"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-500 text-sm">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">You're all caught up</p>
              </div>
            ) : (
              <ul className="divide-y divide-navy-800/70">
                {items.map((n) => {
                  const Icon = ICON_FOR_TYPE[n.type] ?? Bell;
                  const unread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-100 transition-colors flex gap-3 ${
                          unread ? 'bg-mint-400/[0.03]' : ''
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                            unread
                              ? 'bg-mint-400/10 text-mint-400'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm truncate ${
                                unread ? 'text-slate-900 font-semibold' : 'text-slate-500'
                              }`}
                            >
                              {n.title}
                            </p>
                            {unread && (
                              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-slate-600 mt-1">
                            {timeAgoShort(n.created_at)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
