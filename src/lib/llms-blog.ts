import { createClient } from '@supabase/supabase-js';

/**
 * Published blog posts for /llms.txt and /llms-full.txt.
 *
 * Same defence as the sitemap: a hard 5s cap and a graceful empty
 * result, so a saturated Supabase degrades the file rather than 500ing
 * a route that crawlers hit.
 */
export interface LlmsBlogPost {
  slug: string;
  title: string | null;
  excerpt: string | null;
}

export async function fetchPublishedPosts(limit = 40): Promise<LlmsBlogPost[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal);
    return (data as LlmsBlogPost[] | null) ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
