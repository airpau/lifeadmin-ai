import Link from 'next/link';
import Image from 'next/image';
import CookieSettingsButton from '@/components/CookieSettingsButton';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-mint-400/5 via-transparent to-transparent pointer-events-none" />
      <div className="relative">
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={32} height={32} className="rounded-lg" />
              <span className="text-xl font-bold text-white">
                Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/pricing" className="hidden md:block text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-navy-900 transition-all">
                Pricing
              </Link>
              <Link href="/auth/login" className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-navy-900 transition-all">
                Sign In
              </Link>
              <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-sm font-semibold px-4 py-2 rounded-xl transition-all">
                Get Started Free
              </Link>
            </div>
          </div>
        </header>

        {children}

        <footer className="border-t border-navy-700/50 py-8 mt-16">
          <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-slate-500 text-sm">Paybacker LTD &mdash; paybacker.co.uk</div>
            <div className="flex gap-4 text-slate-500 text-sm">
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-all">About</Link>
              <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy</Link>
              <Link href="/cookie-policy" className="hover:text-white transition-all">Cookies</Link>
              <Link href="/terms-of-service" className="hover:text-white transition-all">Terms</Link>
              <CookieSettingsButton />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
