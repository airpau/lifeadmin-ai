/**
 * GET /api/blog-feed?limit=3
 *
 * Lightweight read endpoint for the homepage Journal section.
 * Returns the most recent published blog_posts with category-mapped
 * gradient + emoji so the homepage doesn't need access to the
 * service-role client (it's a 'use client' component).
 *
 * Falls back gracefully — if Supabase is unavailable the homepage
 * shows three hand-coded SEO posts instead of empty-stating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { blogIconFor } from '@/lib/blog-icons';

export const runtime = 'nodejs';
export const revalidate = 600; // 10 min — blog posts don't change often

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') || '3')));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ posts: [] });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, published_at, category')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    const posts = (data ?? []).map((p) => {
      const icon = blogIconFor(p.category as string | null);
      const cat = (p.category as string | null) ?? 'Essay';
      return {
        title: p.title,
        excerpt: (p.excerpt as string | null) ?? '',
        href: `/blog/${p.slug}`,
        date: new Date(p.published_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
        cat: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
        emoji: icon.emoji,
        bg: icon.bg,
      };
    });

    return NextResponse.json({ posts });
  } catch (e: any) {
    console.error('blog-feed error:', e?.message ?? e);
    return NextResponse.json({ posts: [] });
  }
}
