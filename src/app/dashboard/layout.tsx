'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  ScanSearch,
  FileText,
  CreditCard,
  Tag,
  User,
  LogOut,
  Menu,
  X,
  ShieldAlert,
  BarChart3,
  Gift,
  Building2,
  Wallet,
  BookOpen,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Money Hub', href: '/dashboard/money-hub', icon: Wallet },
  { name: 'Scanner', href: '/dashboard/scanner', icon: ScanSearch },
  { name: 'AI Letters', href: '/dashboard/complaints', icon: FileText },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: CreditCard },
  { name: 'Deals', href: '/dashboard/deals', icon: Tag },
  { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
  { name: 'Blog', href: '/blog', icon: BookOpen },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
      if (user) {
        const { data } = await supabase.from('profiles').select('first_name, full_name, subscription_tier').eq('id', user.id).single();
        const name = data?.first_name || user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || null;
        setFirstName(name);
        setUserTier(data?.subscription_tier || 'free');
      }
    };
    loadUser();

    // Also sync from Stripe to ensure tier is current
    fetch('/api/stripe/sync', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.tier) setUserTier(d.tier); })
      .catch(() => {});
  }, []);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const NavContent = () => (
    <>
      <Link href="/dashboard" className="flex items-center gap-2 mb-2">
        <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
        <span className="text-xl font-bold text-white">
          Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span>
        </span>
      </Link>

      {/* User info below logo */}
      <div className="mb-6 pb-6 border-b border-navy-700/50">
        {firstName && (
          <p className="text-sm font-medium text-white">{firstName}</p>
        )}
        <p className="text-xs text-slate-500 truncate">{userEmail}</p>
        <span className={`inline-block mt-1.5 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
          userTier === 'pro' ? 'text-brand-400 bg-brand-400/10' :
          userTier === 'essential' ? 'text-mint-400 bg-mint-400/10' :
          'text-slate-400 bg-slate-400/10'
        }`}>
          {userTier === 'pro' ? 'Pro Plan' : userTier === 'essential' ? 'Essential Plan' : 'Free Plan'}
        </span>
      </div>

      <nav className="space-y-0.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard' || item.href === '/blog'
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-lg transition-all duration-200 min-h-[44px] ${
                isActive
                  ? 'bg-mint-400/10 text-mint-400 border-l-2 border-mint-400 font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-navy-800/50 border-l-2 border-transparent'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{item.name}</span>
              {(item as any).comingSoon && (
                <span className="text-[9px] bg-navy-700 text-slate-400 px-1.5 py-0.5 rounded-full ml-auto">Soon</span>
              )}
            </Link>
          );
        })}
        {userEmail === 'aireypaul@googlemail.com' && (
          <Link
            href="/dashboard/admin"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-r-lg transition-all duration-200 min-h-[44px] mt-4 border-t border-navy-700/50 pt-4 ${
              pathname === '/dashboard/admin'
                ? 'bg-red-500/10 text-red-400 border-l-2 border-red-400 font-semibold'
                : 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border-l-2 border-transparent'
            }`}
          >
            <ShieldAlert className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">Admin</span>
          </Link>
        )}
      </nav>

      <div className="pt-6 border-t border-navy-700/50 mt-6">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-slate-500 hover:text-red-400 transition-all duration-200 w-full min-h-[44px]"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-navy-900 border-b border-navy-700/50 sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Paybacker" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-bold text-white">
            Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span>
          </span>
        </Link>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-[260px] bg-navy-900 border-r border-navy-700/50 p-6 flex flex-col">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
            >
              <X className="h-5 w-5" />
            </button>
            <NavContent />
          </aside>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-[260px] min-h-screen bg-navy-900 border-r border-navy-700/50 p-6 flex-col flex-shrink-0">
          <NavContent />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0 bg-navy-950 pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav - show 5 key items only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-navy-900/95 backdrop-blur-sm border-t border-navy-700/50 flex z-40">
        {[
          { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
          { name: 'Money Hub', href: '/dashboard/money-hub', icon: Wallet },
          { name: 'Letters', href: '/dashboard/complaints', icon: FileText },
          { name: 'Scanner', href: '/dashboard/scanner', icon: ScanSearch },
          { name: 'Subs', href: '/dashboard/subscriptions', icon: CreditCard },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard' || item.href === '/blog'
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] transition-all duration-200 ${
                isActive ? 'text-mint-400' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span className="text-[10px]">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom padding on mobile so content isn't behind nav */}
      <div className="h-16 lg:hidden" />
    </div>
  );
}
