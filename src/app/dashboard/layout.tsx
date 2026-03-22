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
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Scanner', href: '/dashboard/scanner', icon: ScanSearch },
  { name: 'Complaints', href: '/dashboard/complaints', icon: FileText },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: CreditCard },
  { name: 'Forms', href: '/dashboard/forms', icon: Building2 },
  { name: 'Deals', href: '/dashboard/deals', icon: Tag },
  { name: 'Spending', href: '/dashboard/spending', icon: BarChart3 },
  { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null);
      // Try profile first, fall back to auth metadata
      if (user) {
        supabase.from('profiles').select('first_name, full_name').eq('id', user.id).single().then(({ data }) => {
          const name = data?.first_name || user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || null;
          setFirstName(name);
        });
      }
    });
  }, [supabase]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const NavContent = () => (
    <>
      <Link href="/dashboard" className="flex items-center gap-2 mb-8">
        <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
        <span className="text-xl font-bold text-white">
          Pay<span className="text-amber-500">backer</span>
        </span>
      </Link>

      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all min-h-[48px] ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
        {userEmail === 'aireypaul@googlemail.com' && (
          <Link
            href="/dashboard/admin"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all min-h-[48px] mt-4 border-t border-slate-800 pt-4 ${
              pathname === '/dashboard/admin'
                ? 'bg-red-500 text-white font-semibold'
                : 'text-red-400 hover:text-white hover:bg-red-500/10'
            }`}
          >
            <ShieldAlert className="h-5 w-5 flex-shrink-0" />
            <span>Admin</span>
          </Link>
        )}
      </nav>

      <div className="pt-6 border-t border-slate-800 mt-6">
        <div className="mb-3">
          {firstName && (
            <p className="text-sm font-semibold text-white mb-0.5">Welcome, {firstName}</p>
          )}
          <p className="text-xs text-slate-500 truncate">{userEmail}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-all w-full min-h-[44px]"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800 sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Paybacker" width={28} height={28} />
          <span className="text-lg font-bold text-white">
            Pay<span className="text-amber-500">backer</span>
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
          <aside className="relative w-72 bg-slate-900 border-r border-slate-800 p-6 flex flex-col">
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
        <aside className="hidden lg:flex w-64 min-h-screen bg-slate-900/50 backdrop-blur-sm border-r border-slate-800 p-6 flex-col">
          <NavContent />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 flex z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] transition-all ${
                isActive ? 'text-amber-500' : 'text-slate-500'
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
