import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  BASE_URL,
  allStaticRoutes,
  assertSitemapNotBlocked,
  BLOG_STATIC_SLUGS,
} from '@/lib/site-routes';

/**
 * The sitemap is generated, not hand-maintained.
 *
 * Every static route comes from src/lib/site-routes.ts, which in turn
 * derives the four dynamic families (company complaint guides, free
 * tools, solution pages, deal categories) from the same data modules the
 * routes render from. Adding a company to src/data/companies.ts or a
 * tool to the tools registry puts the URL in here automatically.
 *
 * Blog posts are fetched from Supabase at build time with a hard 5s cap,
 * so a saturated database degrades the sitemap rather than failing the
 * production build.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  const staticRoutes = allStaticRoutes();

  // Guard: a sitemapped URL that robots.txt blocks is a Search Console
  // error and burns crawl budget. This should never fire.
  const blocked = assertSitemapNotBlocked(staticRoutes.map((r) => r.path));
  if (blocked.length > 0) {
    console.error('[sitemap] routes are both sitemapped and robots-disallowed:', blocked);
  }

  // Blog posts from the database.
  let blogPosts: { slug: string; published_at: string }[] | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      );
      const { data } = await supabase
        .from('blog_posts')
        .select('slug, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .abortSignal(controller.signal);
      blogPosts = data;
    } catch {
      // Static blog entries still make it in.
    } finally {
      clearTimeout(timeout);
    }
  }

  const blogEntries: MetadataRoute.Sitemap = [
    ...BLOG_STATIC_SLUGS.map((slug) => ({
      url: `${BASE_URL}/blog/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.65,
    })),
    ...(blogPosts || [])
      .filter((p) => !BLOG_STATIC_SLUGS.includes(p.slug))
      .map((p) => ({
        url: `${BASE_URL}/blog/${p.slug}`,
        lastModified: p.published_at || now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
  ];

  return [
    ...staticRoutes.map((r) => ({
      url: `${BASE_URL}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...blogEntries,
  ];
}
