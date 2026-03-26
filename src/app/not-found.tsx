import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="Paybacker" width={36} height={36} className="rounded-lg" />
          <span className="text-2xl font-bold text-white">Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span></span>
        </Link>

        <h1 className="text-6xl font-bold text-mint-400 mb-4 font-[family-name:var(--font-heading)]">404</h1>
        <p className="text-xl text-white mb-2">Page not found</p>
        <p className="text-slate-400 mb-8">The page you are looking for does not exist or has been moved.</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all">
            Go Home
          </Link>
          <Link href="/auth/signup" className="bg-navy-900 hover:bg-navy-800 text-white font-semibold px-6 py-3 rounded-xl transition-all border border-navy-700/50">
            Generate Free Letter
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 justify-center text-sm text-slate-500">
          <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
          <Link href="/deals" className="hover:text-white transition-all">Deals</Link>
          <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
          <Link href="/about" className="hover:text-white transition-all">About</Link>
        </div>
      </div>
    </div>
  );
}
