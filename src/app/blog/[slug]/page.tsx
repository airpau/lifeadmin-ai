import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import PublicNavbar from '@/components/PublicNavbar';

// Force dynamic rendering so new blog posts are available immediately
export const dynamic = 'force-dynamic';

function getClient() {
  // Use anon key for public reads - blog_posts has RLS allowing public SELECT on published posts
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy',
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = getClient();
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('title, meta_description, slug')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) console.error('[blog] Metadata query error:', error.message, 'slug:', slug);
  if (!post) return { title: 'Blog - Paybacker' };

  return {
    title: post.title,
    description: post.meta_description,
    openGraph: {
      title: post.title,
      description: post.meta_description || '',
      url: `https://paybacker.co.uk/blog/${slug}`,
      type: 'article',
      siteName: 'Paybacker',
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description: post.meta_description || '',
    },
    alternates: {
      canonical: `https://paybacker.co.uk/blog/${slug}`,
    },
  };
}

export default async function DynamicBlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getClient();
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) console.error('[blog] Post query error:', error.message, 'slug:', slug);
  if (!post) notFound();

  const publishedDate = new Date(post.published_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="relative">
        <PublicNavbar />
        <div className="h-16" />

        <main className="container mx-auto px-6 py-12">
          <article className="max-w-3xl mx-auto">
            <div className="mb-8">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
                <span>/</span>
                <span className="text-slate-400">{post.title.substring(0, 40)}...</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight font-[family-name:var(--font-heading)]">{post.title}</h1>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>{publishedDate}</span>
                {post.target_keyword && <span className="bg-mint-400/10 text-mint-400 px-2 py-0.5 rounded-full text-xs">{post.category}</span>}
              </div>
            </div>

            <div
              className="prose prose-invert prose-slate max-w-none [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:mb-4 [&_ul]:text-slate-300 [&_ul]:space-y-2 [&_ul]:mb-4 [&_li]:text-slate-300 [&_strong]:text-white"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* CTA */}
            <div className="bg-mint-400/10 border border-mint-400/20 rounded-2xl p-8 my-10 text-center">
              <h2 className="text-2xl font-bold text-white mb-3 font-[family-name:var(--font-heading)]">Need help with this? Paybacker can generate a formal letter in 30 seconds</h2>
              <p className="text-slate-400 mb-6">Our AI writes complaint letters citing exact UK law. Free to try - 3 letters per month.</p>
              <Link href="/auth/signup" className="inline-block bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all text-lg">
                Generate Your Letter Free
              </Link>
            </div>

            {/* Deal section if relevant */}
            {post.deal_category && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 mb-8 text-center">
                <p className="text-green-400 font-semibold mb-2">Looking for a better deal?</p>
                <p className="text-slate-400 text-sm mb-4">Compare {post.deal_category} deals from top UK providers. Free to browse, no signup needed.</p>
                <Link href="/dashboard/deals" className="inline-block bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm">
                  Browse {post.deal_category} Deals
                </Link>
              </div>
            )}
          </article>
        </main>

        <footer className="border-t border-navy-700/50 py-8 mt-16">
          <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-slate-500 text-sm">Paybacker LTD - paybacker.co.uk</div>
            <div className="flex gap-4 text-slate-500 text-sm">
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-all">About</Link>
              <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
