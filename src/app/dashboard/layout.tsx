'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  ScanSearch, 
  FileText, 
  CreditCard, 
  User, 
  LogOut,
  Sparkles 
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Scanner', href: '/dashboard/scanner', icon: ScanSearch },
  { name: 'Complaints', href: '/dashboard/complaints', icon: FileText },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: CreditCard },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    getUser();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-slate-900/50 backdrop-blur-sm border-r border-slate-800 p-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 mb-8">
            <Sparkles className="h-6 w-6 text-amber-500" />
            <span className="text-xl font-bold text-white">
              LifeAdmin<span className="text-amber-500">AI</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="mt-auto pt-6 border-t border-slate-800 absolute bottom-6 left-6 right-6">
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-1">Signed in as</p>
              <p className="text-sm text-white truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-all w-full"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm">Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
