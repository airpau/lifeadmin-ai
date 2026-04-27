import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { PostShell, SIGNUP_HREF } from '../_shared';
import '../styles.css';

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
    .select('title, meta_description, slug, image_url, image_alt')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) console.error('[blog] Metadata query error:', error.message, 'slug:', slug);
  if (!post) return { title: 'Blog - Paybacker' };

  // Use the per-post hero image as the social-share image when present —
  // makes blog links look post-specific in WhatsApp / Slack / X previews.
  const ogImages = post.image_url
    ? [{ url: post.image_url as string, alt: (post.image_alt as string) || (post.title as string) }]
    : undefined;

  return {
    title: post.title,
    description: post.meta_description,
    openGraph: {
      title: post.title,
      description: post.meta_description || '',
      url: `https://paybacker.co.uk/blog/${slug}`,
      type: 'article',
      siteName: 'Paybacker',
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: post.image_url ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.meta_description || '',
      ...(post.image_url ? { images: [post.image_url as string] } : {}),
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description || post.excerpt,
    url: `https://paybacker.co.uk/blog/${post.slug}`,
    datePublished: post.published_at,
    dateModified: post.published_at,
    publisher: {
      '@type': 'Organization',
      name: 'Paybacker',
      url: 'https://paybacker.co.uk',
    },
    author: {
      '@type': 'Organization',
      name: 'Paybacker',
      url: 'https://paybacker.co.uk',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://paybacker.co.uk/blog/${post.slug}`,
    },
  };

  return (
    <PostShell
      category={post.category || undefined}
      title={post.title}
      dek={post.excerpt || undefined}
      dateLabel={publishedDate}
      readTime={post.read_time ? `${post.read_time} min read` : undefined}
      aside={{
        eyebrow: 'Try Paybacker',
        title: 'Need a formal letter?',
        description: 'Our AI writes complaint letters citing exact UK law in 30 seconds. Free to try — 3 letters per month.',
        ctaLabel: 'Generate your letter free',
        ctaHref: SIGNUP_HREF,
      }}
      jsonLd={jsonLd}
    >
      {/* Hero image — generated per-post by the publish-blog cron via Imagen.
          Rendered above the content so it's the first thing the reader sees,
          and used as the og:image / twitter:image in the metadata above. */}
      {post.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image_url}
          alt={post.image_alt || post.title}
          style={{
            width: '100%',
            height: 'auto',
            aspectRatio: '16 / 9',
            objectFit: 'cover',
            borderRadius: 16,
            marginBottom: 32,
            background: '#0f172a',
          }}
        />
      ) : null}

      {/* Body — content is stored as HTML in Supabase. Post-body CSS in styles.css
          styles the p / h2 / h3 / ul / ol / blockquote / a / strong / table inside. */}
      <div dangerouslySetInnerHTML={{ __html: post.content }} />

      {/* Inline CTA ---------------------------------------------------- */}
      <div className="post-cta">
        <h3>Need help with this? Paybacker generates the letter in 30 seconds.</h3>
        <p>Our AI writes complaint letters citing exact UK consumer law. Free to try — 3 letters per month.</p>
        <Link className="btn btn-mint" href={SIGNUP_HREF}>Start free</Link>
      </div>

      {/* Deal section if relevant */}
      {post.deal_category ? (
        <div className="post-cta" style={{ background: 'var(--surface-soft-mint)', color: 'var(--text-primary)' }}>
          <h3 style={{ color: 'var(--text-primary)' }}>Looking for a better deal?</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Compare {post.deal_category} deals from top UK providers. Free to browse, no signup needed.
          </p>
          <Link className="btn btn-mint" href="/dashboard/deals">Browse {post.deal_category} deals</Link>
        </div>
      ) : null}
    </PostShell>
  );
}
