'use client';

import Link from 'next/link';
import { useState, FormEvent } from 'react';

export function BlogFooter() {
  return (
    <footer className="container mx-auto px-6 py-8 border-t border-navy-700/50 mt-16">
      <div className="text-center text-slate-500 text-sm space-y-3">
        <div className="flex flex-wrap justify-center gap-6">
          <Link href="/about" className="hover:text-white transition-all">About</Link>
          <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
          <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
          <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-white transition-all">Terms of Service</Link>
          <Link href="/cookie-policy" className="hover:text-white transition-all">Cookies</Link>
          <a href="mailto:hello@paybacker.co.uk" className="hover:text-white transition-all">Contact</a>
        </div>
        <p>
          Need help? Email{' '}
          <a href="mailto:support@paybacker.co.uk" className="text-mint-400 hover:text-mint-300">
            support@paybacker.co.uk
          </a>
        </p>
        <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function BlogNewsletterBanner() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setState('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 my-10 text-center">
      <h2 className="text-xl font-bold text-white mb-2">Get money-saving tips in your inbox</h2>
      <p className="text-slate-400 text-sm mb-5">
        UK consumer rights guides, switching alerts and deal finds — free, no spam.
      </p>
      {state === 'done' ? (
        <p className="text-mint-400 font-medium">You&apos;re on the list.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <input
            type="email"
            required
            placeholder="your@email.co.uk"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="flex-1 bg-navy-800 border border-navy-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-mint-400"
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            className="bg-mint-400 hover:bg-mint-500 disabled:opacity-60 text-navy-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            {state === 'loading' ? 'Saving…' : 'Subscribe'}
          </button>
        </form>
      )}
      {state === 'error' && (
        <p className="text-red-400 text-sm mt-2">Something went wrong — please try again.</p>
      )}
    </div>
  );
}
