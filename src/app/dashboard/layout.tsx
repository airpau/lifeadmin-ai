'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import TrialBanner from '@/components/TrialBanner';
import NotificationBell from '@/components/NotificationBell';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Tag,
  User,
  LogOut,
  Menu,
  ArrowRight,
  X,
  ShieldAlert,
  Gift,
  Wallet,
  FolderLock,
  MessageCircle,
  Plug,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import './dashboard.css';

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Money Hub', href: '/dashboard/money-hub', icon: Wallet },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: CreditCard },
  { name: 'Disputes', href: '/dashboard/disputes', icon: FileText },
  { name: 'Contract Vault', href: '/dashboard/contract-vault', icon: FolderLock },
  { name: 'Deals', href: '/dashboard/deals', icon: Tag },
  { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
  { name: 'Pocket Agent', href: '/dashboard/pocket-agent', icon: MessageCircle },
  { name: 'Paybacker Assistant', href: '/dashboard/settings/mcp', icon: Plug },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUserEmail(user.email || null);
      setAuthChecked(true);
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, full_name, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
          .eq('id', user.id)
          .single();
        const name =
          data?.first_name ||
          user.user_metadata?.first_name ||
          user.user_metadata?.full_name?.split(' ')[0] ||
          null;
        setFirstName(name);
        const profileTier = data?.subscription_tier || 'free';
        setUserTier(profileTier);

        // Detect founding member trial
        let isFoundingTrial = false;
        if (
          data?.subscription_status === 'trialing' &&
          !data?.stripe_subscription_id &&
          data?.subscription_tier !== 'free'
        ) {
          isFoundingTrial = true;
          const trialEnd = data?.trial_ends_at ? new Date(data.trial_ends_at) : null;
          if (trialEnd) {
            const days = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (days > 0) {
              setIsTrial(true);
              setTrialDaysLeft(days);
            } else {
              setTrialExpired(true);
              setUserTier('free');
              isFoundingTrial = false;
            }
          } else {
            setIsTrial(true);
          }
        }

        // Sync from Stripe to ensure tier is current.
        // Only apply the Stripe tier if it's an upgrade or a real downgrade
        // (not when user is on a founding member trial without a Stripe subscription).
        try {
          const syncRes = await fetch('/api/stripe/sync', { method: 'POST' });
          const syncData = await syncRes.json();
          if (syncData.tier && syncData.tier !== 'free') {
            setUserTier(syncData.tier);
          } else if (syncData.tier === 'free' && syncData.synced && !isFoundingTrial) {
            setUserTier('free');
          }
        } catch {
          // Stripe sync failed — keep profile tier
        }
      }
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const Brand = ({ onClick }: { onClick?: () => void }) => (
    <Link href="/dashboard" className="dash-brand" onClick={onClick}>
      <span className="logo-mark">P</span>
      <span className="logo-text">
        Pay<span className="deep">backer</span>
      </span>
    </Link>
  );

  const NavContent = () => {
    const isAdmin = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
      .split(',')
      .includes(userEmail || '');

    return (
      <>
        <Brand />

        <div className="dash-user">
          {firstName && (
            <p className="dash-user-name" title={firstName}>
              {firstName}
            </p>
          )}
          <p className="dash-user-email">{userEmail || ''}</p>
          {isTrial ? (
            <span className="tier-pill tier-trial">
              Pro Trial{trialDaysLeft ? ` · ${trialDaysLeft}d left` : ''}
            </span>
          ) : userTier === 'free' ? (
            <Link href="/pricing" className="tier-pill tier-free">
              Free Plan <ArrowRight width={10} height={10} aria-hidden="true" />
            </Link>
          ) : (
            <span
              className={`tier-pill ${
                userTier === 'pro' ? 'tier-pro' : 'tier-essential'
              }`}
            >
              {userTier === 'pro' ? 'Pro Plan' : 'Essential Plan'}
            </span>
          )}
          {userTier === 'free' && !isTrial && (
            <div className="upgrade-card">
              <p>Unlock Pocket Agent, unlimited letters &amp; more</p>
              <Link href="/pricing">Upgrade now</Link>
            </div>
          )}
        </div>

        <nav className="dash-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? 'is-active' : ''}
              >
                <Icon aria-hidden="true" />
                <span>{item.name}</span>
                {item.name === 'Pocket Agent' && (
                  <span className="nav-badge new">New</span>
                )}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className={`dash-admin ${pathname === '/dashboard/admin' ? 'is-active' : ''}`}
            >
              <ShieldAlert aria-hidden="true" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        <div className="dash-signout">
          <button onClick={handleSignOut} type="button">
            <LogOut aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </>
    );
  };

  if (!authChecked) {
    return (
      <div className="m-dash-root">
        <div className="dash-loader">
          <Loader2 aria-label="Loading" />
        </div>
      </div>
    );
  }

  return (
    <div className="m-dash-root">
      {/* Mobile header */}
      <header className="dash-mob-header">
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <NotificationBell />
          <button
            onClick={() => setSidebarOpen(true)}
            className="menu-btn"
            type="button"
            aria-label="Open menu"
          >
            <Menu width={20} height={20} />
          </button>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="dash-drawer-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="dash-drawer" role="dialog" aria-label="Main navigation">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="close-btn"
              aria-label="Close menu"
            >
              <X width={18} height={18} />
            </button>
            <NavContent />
          </aside>
        </>
      )}

      <div className="dash-shell">
        {/* Desktop sidebar */}
        <aside className="dash-sidebar is-desktop">
          <NavContent />
        </aside>

        {/* Main content */}
        <main className="dash-main">
          <div className="dash-main-top">
            <NotificationBell />
          </div>
          <div className="dash-body">
            {(isTrial || trialExpired) && (
              <TrialBanner daysLeft={trialDaysLeft} trialExpired={trialExpired} />
            )}
            {children}
          </div>

          <footer className="dash-footer">
            <Link href="/blog">Blog</Link>
            <span className="dot">·</span>
            <Link href="/dashboard/deals">Deals</Link>
            <span className="dot">·</span>
            <Link href="/about">About</Link>
            <span className="dot">·</span>
            <Link href="/pricing">Pricing</Link>
            <span className="dot">·</span>
            <a href="mailto:hello@paybacker.co.uk">Help</a>
          </footer>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="dash-bottom-nav" aria-label="Mobile navigation">
        {[
          { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
          { name: 'Money', href: '/dashboard/money-hub', icon: Wallet },
          { name: 'Disputes', href: '/dashboard/disputes', icon: FileText },
          { name: 'Deals', href: '/dashboard/deals', icon: Tag },
          { name: 'Subs', href: '/dashboard/subscriptions', icon: CreditCard },
        ].map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? 'is-active' : ''}
            >
              <Icon aria-hidden="true" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom padding on mobile so content isn't behind nav */}
      <div style={{ height: 60 }} className="dash-bottom-pad" aria-hidden="true" />
    </div>
  );
}
