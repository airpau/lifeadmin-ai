import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <Image src="/logo.png" alt="Paybacker" width={36} height={36} />
          <span className="text-2xl font-bold text-white">Pay<span className="text-amber-500">backer</span></span>
        </Link>

        <h1 className="text-6xl font-bold text-amber-500 mb-4">404</h1>
        <p className="text-xl text-white mb-2">Page not found</p>
        <p className="text-slate-400 mb-8">The page you are looking for does not exist or has been moved.</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-all">
            Go Home
          </Link>
          <Link href="/auth/signup" className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl transition-all">
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
