import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — Paybacker",
  description:
    "Money-saving tips, switching guides and UK consumer rights advice from Paybacker.",
};

const posts = [
  {
    title: "Are You Overpaying on Energy in 2026? Here's How to Find Out",
    excerpt:
      "The energy price cap hits £1,641 from April 2026. Find out if you're on an expensive standard variable tariff and how switching could save you hundreds.",
    href: "/blog/are-you-overpaying-on-energy",
    date: "23 March 2026",
  },
  {
    title:
      "Your Broadband Contract Has Ended — You're Probably Being Overcharged",
    excerpt:
      "Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.",
    href: "/blog/broadband-contract-ended",
    date: "23 March 2026",
  },
];

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="container mx-auto px-6 py-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
            <span className="text-xl font-bold text-white">
              Pay<span className="text-amber-500">backer</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 md:gap-3 text-sm">
            <Link
              href="/about"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              About
            </Link>
            <Link
              href="/blog"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Blog
            </Link>
            <Link
              href="/pricing"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Pricing
            </Link>
            <Link
              href="/auth/login"
              className="text-slate-300 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-16 max-w-5xl">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Blog
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Money-saving tips and switching guides for UK consumers
          </p>
        </div>

        <div className="grid gap-6">
          {posts.map((post) => (
            <Link key={post.href} href={post.href} className="block group">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-slate-600 transition-all">
                <p className="text-slate-500 text-sm mb-2">{post.date}</p>
                <h2 className="text-xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                  {post.title}
                </h2>
                <p className="text-slate-400 text-sm mb-3">{post.excerpt}</p>
                <span className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                  Read more &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-slate-800 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/about" className="hover:text-white transition-all">
              About
            </Link>
            <Link href="/blog" className="hover:text-white transition-all">
              Blog
            </Link>
            <Link
              href="/privacy-policy"
              className="hover:text-white transition-all"
            >
              Privacy Policy
            </Link>
            <Link
              href="/legal/terms"
              className="hover:text-white transition-all"
            >
              Terms of Service
            </Link>
            <Link href="/pricing" className="hover:text-white transition-all">
              Pricing
            </Link>
            <a
              href="mailto:hello@paybacker.co.uk"
              className="hover:text-white transition-all"
            >
              Contact
            </a>
          </div>
          <p>
            Need help? Email{" "}
            <a
              href="mailto:support@paybacker.co.uk"
              className="text-amber-500 hover:text-amber-400"
            >
              support@paybacker.co.uk
            </a>
          </p>
          <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
