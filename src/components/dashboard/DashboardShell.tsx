'use client';

import { Fragment, type ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';

// ─── Icon library (ported verbatim from redesign/shell.jsx) ─────────────
const I = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  wallet: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5',
  card: 'M2 7h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  calendar: 'M3 7h18v14H3zM16 3v4M8 3v4M3 11h18',
  tag: 'M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12a2 2 0 0 0 2 2h14v-4',
  trophy:
    'M20 12V22H4V12M2 7h20v5H2zM12 22V7M12 7H7.5A2.5 2.5 0 0 1 7.5 2c2 0 4.5 2 4.5 5M12 7h4.5A2.5 2.5 0 0 0 16.5 2c-2 0-4.5 2-4.5 5',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plug:
    'M9 7V2M15 7V2M5 12h14M7 12v3a5 5 0 0 0 10 0v-3M12 20v2',
  shield:
    'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4zM9 12l2 2 4-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.35-4.35',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0',
  chev: 'M9 18l6-6-6-6',
  sun: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M18 6L6 18M6 6l12 12',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sparkle:
    'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z',
} as const;

type IconName = keyof typeof I;

function Icon({ n, ...p }: { n: IconName } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d={I[n]} />
    </svg>
  );
}

// ─── Nav structure ───────────────────────────────────────────────────────
// Groups follow the Claude design handoff (Main / Save money / Account).
// hrefs map to the existing app routes — we keep dashboard paths as they
// are to avoid breaking bookmarks or auth redirects.
type NavBadge = { t: string; c: 'new' | 'count' };
type NavItem = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  badge?: NavBadge;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Main',
    items: [
      { key: 'overview', label: 'Overview', icon: 'grid', href: '/dashboard' },
      { key: 'action-centre', label: 'Action Centre', icon: 'sparkle', href: '/dashboard/action-centre' },
      { key: 'money-hub', label: 'Money Hub', icon: 'wallet', href: '/dashboard/money-hub' },
      { key: 'subscriptions', label: 'Subscriptions', icon: 'card', href: '/dashboard/subscriptions' },
      { key: 'disputes', label: 'Disputes', icon: 'file', href: '/dashboard/disputes' },
      { key: 'vault', label: 'Contract Vault', icon: 'calendar', href: '/dashboard/contract-vault' },
    ],
  },
  {
    group: 'Save money',
    items: [
      { key: 'deals', label: 'Deals', icon: 'tag', href: '/dashboard/deals' },
      { key: 'rewards', label: 'Rewards', icon: 'trophy', href: '/dashboard/rewards' },
      {
        key: 'pocket-agent',
        label: 'Pocket Agent',
        icon: 'chat',
        href: '/dashboard/pocket-agent',
        badge: { t: 'New', c: 'new' },
      },
      {
        key: 'assistant',
        label: 'Paybacker Assistant',
        icon: 'plug',
        href: '/dashboard/settings/mcp',
      },
    ],
  },
  {
    group: 'Account',
    items: [
      { key: 'export', label: 'Export', icon: 'download', href: '/dashboard/export' },
      { key: 'profile', label: 'Profile', icon: 'user', href: '/dashboard/profile' },
    ],
  },
];

function getActiveKey(pathname: string): string {
  if (pathname === '/dashboard') return 'overview';
  if (pathname.startsWith('/dashboard/settings/mcp')) return 'assistant';
  if (pathname.startsWith('/dashboard/action-centre')) return 'action-centre';
  if (pathname.startsWith('/dashboard/money-hub')) return 'money-hub';
  if (pathname.startsWith('/dashboard/subscriptions')) return 'subscriptions';
  if (pathname.startsWith('/dashboard/disputes')) return 'disputes';
  if (pathname.startsWith('/dashboard/contract-vault')) return 'vault';
  if (pathname.startsWith('/dashboard/deals')) return 'deals';
  if (pathname.startsWith('/dashboard/rewards')) return 'rewards';
  if (pathname.startsWith('/dashboard/pocket-agent')) return 'pocket-agent';
  if (pathname.startsWith('/dashboard/export')) return 'export';
  if (pathname.startsWith('/dashboard/profile')) return 'profile';
  if (pathname.startsWith('/dashboard/admin')) return 'admin';
  return '';
}

function deriveCrumb(pathname: string): string[] {
  const key = getActiveKey(pathname);
  if (key === 'admin') return ['Dashboard', 'Admin'];
  for (const grp of NAV) {
    const item = grp.items.find((i) => i.key === key);
    if (item) return ['Dashboard', item.label];
  }
  return ['Dashboard', 'Overview'];
}

function initials(firstName: string | null, email: string | null): string {
  if (firstName) {
    const parts = firstName.trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts[1]?.[0] ?? '';
    return (a + b).toUpperCase() || 'U';
  }
  return (email?.[0] ?? 'U').toUpperCase();
}

function tierLabel(
  tier: UserSummary['tier'],
  isTrial: boolean,
  trialDaysLeft: number | null,
): string {
  if (isTrial) return trialDaysLeft ? `Pro Trial · ${trialDaysLeft}d` : 'Pro Trial';
  if (tier === 'pro') return 'Pro Plan';
  if (tier === 'essential') return 'Essential Plan';
  return 'Free Plan';
}

// ─── Public types & component ────────────────────────────────────────────
export type UserSummary = {
  firstName: string | null;
  email: string | null;
  tier: 'free' | 'essential' | 'pro';
  isTrial: boolean;
  trialDaysLeft: number | null;
};

export type DashboardShellProps = {
  user: UserSummary;
  isAdmin: boolean;
  onSignOut: () => void;
  /** Top banner slot (e.g. TrialBanner). Rendered above page content. */
  topBanner?: ReactNode;
  children: ReactNode;
};

export default function DashboardShell({
  user,
  isAdmin,
  onSignOut,
  topBanner,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeKey = getActiveKey(pathname);
  const crumb = deriveCrumb(pathname);

  const sidebar = (
    <Sidebar
      user={user}
      isAdmin={isAdmin}
      activeKey={activeKey}
      onSignOut={onSignOut}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="shell-v2">
      {/* Mobile header — only visible < 980px via CSS */}
      <header className="shell-v2-mob-header">
        <Link href="/dashboard" className="brand">
          <div className="logo-box">P</div>
          <div className="brand-name">
            Pay<span>backer</span>
          </div>
        </Link>
        <div className="shell-v2-mob-actions">
          {/* Tier pill on mobile — desktop has it inside the sidebar
              card, but mobile hides the sidebar so users had no way
              to see what plan they're on without opening the menu. */}
          <span
            className="shell-v2-mob-tier"
            title="Tap menu to manage your plan"
            data-tier={user.tier ?? 'free'}
          >
            {tierLabel(user.tier, user.isTrial, user.trialDaysLeft)}
          </span>
          <NotificationBell />
          <button
            type="button"
            className="icon-btn"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Icon n="menu" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="shell-v2-drawer-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="shell-v2-drawer" role="dialog" aria-label="Navigation">
            <button
              type="button"
              className="icon-btn shell-v2-drawer-close"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <Icon n="x" />
            </button>
            {sidebar}
          </aside>
        </>
      )}

      {/* Desktop shell */}
      <div className="shell">
        {sidebar}
        <div className="main">
          <Topbar crumb={crumb} />
          <div className="main-inner">
            {topBanner}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({
  user,
  isAdmin,
  activeKey,
  onSignOut,
  onNavigate,
}: {
  user: UserSummary;
  isAdmin: boolean;
  activeKey: string;
  onSignOut: () => void;
  onNavigate: () => void;
}) {
  const showUpgrade = user.tier === 'free' && !user.isTrial;

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand" onClick={onNavigate}>
        <div className="logo-box">P</div>
        <div className="brand-name">
          Pay<span>backer</span>
        </div>
      </Link>

      <div className="user-card">
        <div className="avatar">{initials(user.firstName, user.email)}</div>
        <div>
          <div className="u-name" title={user.firstName ?? ''}>
            {user.firstName ?? 'You'}
          </div>
          <div className="u-email" title={user.email ?? ''}>
            {user.email ?? ''}
          </div>
          <span className="u-plan">
            {tierLabel(user.tier, user.isTrial, user.trialDaysLeft)}
          </span>
        </div>
      </div>

      {NAV.map((grp) => (
        <Fragment key={grp.group}>
          <div className="nav-section-label">{grp.group}</div>
          {grp.items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              onClick={onNavigate}
              className={`nav-item ${it.key === activeKey ? 'active' : ''}`}
            >
              <Icon n={it.icon} className="n-icon" />
              <span>{it.label}</span>
              {it.badge && (
                <span className={`n-badge ${it.badge.c}`}>{it.badge.t}</span>
              )}
            </Link>
          ))}
        </Fragment>
      ))}

      {isAdmin && (
        <>
          <div className="nav-section-label">Admin</div>
          <Link
            href="/dashboard/admin"
            onClick={onNavigate}
            className={`nav-item ${activeKey === 'admin' ? 'active' : ''}`}
          >
            <Icon n="shield" className="n-icon" />
            <span>Admin</span>
          </Link>
        </>
      )}

      <div className="sidebar-footer">
        {showUpgrade && (
          <div className="upgrade-card">
            <h5>Unlock the full sweep</h5>
            <p>Unlimited letters, Pocket Agent, Money Hub deal alerts.</p>
            <Link className="btn" href="/pricing" onClick={onNavigate}>
              Upgrade →
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="nav-item shell-v2-signout"
        >
          <Icon n="logout" className="n-icon" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Topbar ──────────────────────────────────────────────────────────────
function Topbar({ crumb }: { crumb: string[] }) {
  return (
    <div className="topbar">
      <div className="crumb">
        {crumb.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon n="chev" />}
            {i === crumb.length - 1 ? <strong>{c}</strong> : <span>{c}</span>}
          </Fragment>
        ))}
      </div>
      <div className="searchbar" aria-hidden="true">
        <Icon n="search" />
        <span className="searchbar-placeholder">
          Search subscriptions, disputes, deals…
        </span>
        <kbd>⌘K</kbd>
      </div>
      <div className="topbar-actions">
        <div className="shell-v2-bell-slot">
          <NotificationBell />
        </div>
      </div>
    </div>
  );
}
