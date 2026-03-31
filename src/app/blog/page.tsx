import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PublicNavbar from '@/components/PublicNavbar';

export const metadata: Metadata = {
  title: "Blog - Money-Saving Tips and UK Consumer Rights | Paybacker",
  description:
    "Money-saving tips, switching guides and UK consumer rights advice from Paybacker.",
  keywords: [
    "money saving tips UK",
    "consumer rights advice",
    "switching guide",
    "energy saving",
    "broadband deals",
  ],
  openGraph: {
    title: "Blog - Money-Saving Tips and UK Consumer Rights | Paybacker",
    description:
      "Money-saving tips, switching guides and UK consumer rights advice from Paybacker.",
    url: "https://paybacker.co.uk/blog",
    siteName: "Paybacker",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Blog - Money-Saving Tips and UK Consumer Rights | Paybacker",
    description:
      "Money-saving tips, switching guides and UK consumer rights advice from Paybacker.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/blog",
  },
};

const posts = [
  {
    title: "How to Claim Flight Delay Compensation UK - Up to £520",
    excerpt:
      "Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person for delayed or cancelled flights. You can claim for flights in the last 6 years.",
    href: "/blog/how-to-claim-flight-delay-compensation-uk",
    date: "25 March 2026",
  },
  {
    title: "Are You Overpaying on Energy in 2026? Here's How to Find Out",
    excerpt:
      "The energy price cap hits £1,641 from April 2026. Find out if you're on an expensive standard variable tariff and how switching could save you hundreds.",
    href: "/blog/are-you-overpaying-on-energy",
    date: "23 March 2026",
  },
  {
    title:
      "Your Broadband Contract Has Ended - You're Probably Being Overcharged",
    excerpt:
      "Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.",
    href: "/blog/broadband-contract-ended",
    date: "23 March 2026",
  },
];

export const revalidate = 3600; // Revalidate every hour

export default async function BlogIndexPage() {
  // Fetch dynamic blog posts from database
  let dynamicPosts: any[] | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);
    dynamicPosts = data;
  }

  // Merge static posts with dynamic ones (dynamic first, then static)
  const allPosts = [
    ...(dynamicPosts || []).map(p => ({
      title: p.title,
      excerpt: p.excerpt || '',
      href: `/blog/${p.slug}`,
      date: new Date(p.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    })),
    ...posts,
  ];
  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />
      <div className="h-16" />

      <main className="container mx-auto px-6 py-16 max-w-5xl">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Blog
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Money-saving tips and switching guides for UK consumers
          </p>
        </div>

        <div className="grid gap-6">
          {allPosts.map((post) => (
            <Link key={post.href} href={post.href} className="block group">
              <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 hover:border-mint-400/30 transition-all">
                <p className="text-slate-500 text-sm mb-2">{post.date}</p>
                <h2 className="text-xl font-bold text-white mb-2 group-hover:text-mint-400 transition-colors">
                  {post.title}
                </h2>
                <p className="text-slate-400 text-sm mb-3">{post.excerpt}</p>
                <span className="text-mint-400 text-sm font-medium">
                  Read more &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 border-t border-navy-700/50 mt-16">
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
              className="text-mint-400 hover:text-mint-300"
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
