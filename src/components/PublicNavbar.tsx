'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WAITLIST_MODE } from '@/lib/config';

const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/deals', label: 'Deals' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/for-business', label: 'For Business' },
  { href: '/docs/paybacker-assistant', label: 'Paybacker Assistant' },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="fixed top-0 w-full z-50 bg-navy-950/80 backdrop-blur-xl border-b border-navy-700/50">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
          <span className="text-xl font-bold text-white">Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span></span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-navy-800 transition-all">
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-2">
          {isLoggedIn === null ? (
            <div className="h-9 w-24 bg-navy-800 rounded-xl animate-pulse"></div>
          ) : isLoggedIn ? (
            <Link href="/dashboard" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-2 rounded-xl transition-all duration-200 text-sm shadow-[--shadow-glow-mint]">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="border border-navy-700 hover:border-mint-400/50 text-slate-300 hover:text-white px-4 py-2 rounded-xl transition-all duration-200 text-sm">
                Sign In
              </Link>
              {WAITLIST_MODE ? (
                <a href="#waitlist" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-xl transition-all duration-200 text-sm shadow-[--shadow-glow-mint]">
                  Get Started
                </a>
              ) : (
                <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-xl transition-all duration-200 text-sm shadow-[--shadow-glow-mint]">
                  Get Started
                </Link>
              )}
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-slate-300 hover:text-white p-2"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-navy-900 border-t border-navy-700/50">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-slate-300 hover:text-white text-sm px-4 py-3 rounded-lg hover:bg-navy-800 transition-all"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-navy-700/50 mt-2 pt-3 flex flex-col gap-2">
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-3 rounded-xl transition-all text-sm text-center shadow-[--shadow-glow-mint]"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setMobileOpen(false)}
                    className="border border-navy-700 hover:border-mint-400/50 text-slate-300 hover:text-white px-4 py-3 rounded-xl transition-all text-sm text-center"
                  >
                    Sign In
                  </Link>
                  {WAITLIST_MODE ? (
                    <a
                      href="#waitlist"
                      onClick={() => setMobileOpen(false)}
                      className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-3 rounded-xl transition-all text-sm text-center shadow-[--shadow-glow-mint]"
                    >
                      Get Started
                    </a>
                  ) : (
                    <Link
                      href="/auth/signup"
                      onClick={() => setMobileOpen(false)}
                      className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-3 rounded-xl transition-all text-sm text-center shadow-[--shadow-glow-mint]"
                    >
                      Get Started
                    </Link>
                  )}
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
