import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MarkNav, MarkFoot } from './_shared';
import './styles.css';

/**
 * /blog — marketing redesign.
 *
 * Design source: design-zip/redesign/batch6.jsx::BlogIndex
 * Scoped under `.m-blog-root`.
 *
 * Preserves the existing data model from master:
 *   - dynamic posts from Supabase `blog_posts` table (status='published')
 *   - merged with three hand-coded SEO posts (/blog/broadband-contract-ended,
 *     /blog/are-you-overpaying-on-energy, /blog/how-to-claim-flight-delay-compensation-uk)
 *
 * Design deviation: the design's 5 illustrative posts (broadband-anniversary,
 * CRA s.49 explainer, etc.) all pre-date the March 2026 launch, so we render
 * real data in the design layout rather than shipping the fake list.
 */

export const metadata: Metadata = {
  title: 'The Paybacker Journal — essays on UK consumer law, overcharges, and how to fight back',
  description:
    'Money-saving guides and UK consumer-rights explainers from the Paybacker team. Flight delay claims, broadband anniversary hikes, energy price cap — the statute, the story, the template.',
  alternates: { canonical: 'https://paybacker.co.uk/blog' },
  openGraph: {
    title: 'The Paybacker Journal',
    description:
      'Money-saving guides and UK consumer-rights explainers. One UK overcharge, dissected.',
    url: 'https://paybacker.co.uk/blog',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'The Paybacker Journal',
    description:
      'Money-saving guides and UK consumer-rights explainers from the Paybacker team.',
  },
};

export const revalidate = 3600;

type Post = {
  title: string;
  excerpt: string;
  href: string;
  date: string;
  cat: string;
  gradient: string;
  emoji: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

const GRADIENTS = [
  { bg: 'linear-gradient(135deg, #34D399, #059669)', emoji: '✉' },
  { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', emoji: '📡' },
  { bg: 'linear-gradient(135deg, #3B82F6, #2563EB)', emoji: '✈' },
  { bg: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', emoji: '⚖' },
  { bg: 'linear-gradient(135deg, #F43F5E, #DC2626)', emoji: '💷' },
];

// Hand-coded SEO posts that already exist as live pages under /blog/*.
const STATIC_POSTS: ReadonlyArray<Omit<Post, 'gradient' | 'emoji'>> = [
  {
    title: 'How to Claim Flight Delay Compensation UK — Up to £520',
    excerpt:
      'Complete guide to claiming flight delay compensation under UK261 regulations. Claim up to £520 per person for delayed or cancelled flights. You can claim for flights in the last 6 years.',
    href: '/blog/how-to-claim-flight-delay-compensation-uk',
    date: '25 March 2026',
    cat: 'Guides',
  },
  {
    title: 'Are You Overpaying on Energy in 2026? Here\'s How to Find Out',
    excerpt:
      'The energy price cap hits £1,641 from April 2026. Find out if you\'re on an expensive standard variable tariff and how switching could save you hundreds.',
    href: '/blog/are-you-overpaying-on-energy',
    date: '23 March 2026',
    cat: 'Guides',
  },
  {
    title: 'Your Broadband Contract Has Ended — You\'re Probably Being Overcharged',
    excerpt:
      'Millions of UK households are out of contract on broadband and overpaying. Find out if your contract has ended and how to save up to £300 a year.',
    href: '/blog/broadband-contract-ended',
    date: '23 March 2026',
    cat: 'Guides',
  },
];

async function fetchDynamicPosts(): Promise<Post[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, published_at, category, image_url, image_alt')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);
    if (!data) return [];
    return data.map((p, i): Post => {
      const g = GRADIENTS[i % GRADIENTS.length];
      return {
        title: p.title,
        excerpt: p.excerpt ?? '',
        href: `/blog/${p.slug}`,
        date: new Date(p.published_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        cat: (p.category as string | null) ?? 'Essay',
        gradient: g.bg,
        emoji: g.emoji,
        imageUrl: (p.image_url as string | null) ?? null,
        imageAlt: (p.image_alt as string | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

export default async function BlogIndexPage() {
  const dynamicPosts = await fetchDynamicPosts();
  const staticWithArt: Post[] = STATIC_POSTS.map((p, i) => {
    const g = GRADIENTS[(dynamicPosts.length + i) % GRADIENTS.length];
    return { ...p, gradient: g.bg, emoji: g.emoji };
  });
  const allPosts: Post[] = [...dynamicPosts, ...staticWithArt];
  const [featured, ...rest] = allPosts;

  return (
    <div className="m-blog-root">
      <MarkNav active="Blog" />

      {/* Hero + featured ------------------------------------------- */}
      <section className="section-light" style={{ paddingTop: 140, paddingBottom: 40 } as CSSProperties}>
        <div className="wrap">
          <span className="eyebrow">The Paybacker Journal</span>
          <h1
            style={{
              fontSize: 'var(--fs-h1)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              lineHeight: 1.05,
              margin: '18px 0 40px',
              maxWidth: 900,
            } as CSSProperties}
          >
            What we&rsquo;re learning as we read every overcharge in Britain.
          </h1>

          {featured && (
            <div
              className="m-blog-featured-card"
              style={{
                background: '#fff',
                border: '1px solid var(--divider)',
                borderRadius: 'var(--r-card)',
                padding: 32,
              } as CSSProperties}
            >
              <div
                className="m-blog-featured-art"
                style={{
                  borderRadius: 'var(--r-input)',
                  background: featured.imageUrl ? '#0f172a' : featured.gradient,
                  position: 'relative',
                  overflow: 'hidden',
                  aspectRatio: '16 / 9',
                } as CSSProperties}
              >
                {featured.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={featured.imageUrl}
                    alt={featured.imageAlt || featured.title}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    } as CSSProperties}
                  />
                ) : null}
                <div
                  style={{
                    position: 'absolute',
                    top: 18,
                    left: 18,
                    padding: '6px 12px',
                    background: 'rgba(255,255,255,0.96)',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  } as CSSProperties}
                >
                  Featured
                </div>
                {!featured.imageUrl && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 160,
                      opacity: 0.22,
                    } as CSSProperties}
                    aria-hidden="true"
                  >
                    {featured.emoji}
                  </div>
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 'var(--track-eyebrow)',
                    textTransform: 'uppercase',
                    color: 'var(--accent-mint-deep)',
                    marginBottom: 14,
                  } as CSSProperties}
                >
                  {featured.cat} · {featured.date}
                </div>
                <h2
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: '-.02em',
                    margin: '0 0 16px',
                    lineHeight: 1.15,
                  } as CSSProperties}
                >
                  {featured.title}
                </h2>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    margin: '0 0 24px',
                  } as CSSProperties}
                >
                  {featured.excerpt}
                </p>
                <Link
                  href={featured.href}
                  className="btn btn-mint"
                  style={{ padding: '12px 20px', fontSize: 14 } as CSSProperties}
                >
                  Read the breakdown →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Grid of remaining posts ----------------------------------- */}
      {rest.length > 0 && (
        <section style={{ padding: '40px 0 80px' } as CSSProperties}>
          <div className="wrap">
            <div className="m-blog-post-grid">
              {rest.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' } as CSSProperties}
                >
                  <article>
                    <div
                      className="m-blog-card-art"
                      style={{
                        borderRadius: 'var(--r-card)',
                        background: p.imageUrl ? '#0f172a' : p.gradient,
                        marginBottom: 20,
                        position: 'relative',
                        overflow: 'hidden',
                        aspectRatio: '16 / 9',
                      } as CSSProperties}
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.imageAlt || p.title}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          } as CSSProperties}
                        />
                      ) : null}
                      <div
                        style={{
                          position: 'absolute',
                          top: 14,
                          left: 14,
                          padding: '5px 11px',
                          background: 'rgba(255,255,255,0.96)',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                        } as CSSProperties}
                      >
                        {p.cat}
                      </div>
                      {!p.imageUrl && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 110,
                            opacity: 0.2,
                          } as CSSProperties}
                          aria-hidden="true"
                        >
                          {p.emoji}
                        </div>
                      )}
                    </div>
                    <h3
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        letterSpacing: '-.015em',
                        margin: '0 0 10px',
                        lineHeight: 1.2,
                      } as CSSProperties}
                    >
                      {p.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 15.5,
                        lineHeight: 1.55,
                        color: 'var(--text-secondary)',
                        margin: '0 0 16px',
                      } as CSSProperties}
                    >
                      {p.excerpt}
                    </p>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--text-tertiary)',
                      } as CSSProperties}
                    >
                      {p.date}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter ------------------------------------------------ */}
      <section id="newsletter" style={{ padding: '40px 0 120px' } as CSSProperties}>
        <div className="wrap">
          <div className="newsletter">
            <div style={{ maxWidth: 520 } as CSSProperties}>
              <span className="eyebrow on-ink">The Payback · Weekly</span>
              <h2>One UK overcharge, dissected. Every Friday.</h2>
              <p>
                No spam. No &ldquo;7 secrets the banks don&rsquo;t want you to know.&rdquo; Just the story, the statute, the template you can copy.
              </p>
            </div>
            <form className="newsletter-form" action="/api/newsletter" method="post">
              <label
                htmlFor="newsletter-email"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                } as CSSProperties}
              >
                Email address
              </label>
              <input
                id="newsletter-email"
                name="email"
                type="email"
                required
                placeholder="you@email.com"
                autoComplete="email"
              />
              <button className="btn btn-mint" type="submit" style={{ padding: '14px 22px' } as CSSProperties}>
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}
