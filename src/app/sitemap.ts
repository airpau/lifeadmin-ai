import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://paybacker.co.uk';
  const now = new Date().toISOString();

  // Solution landing pages (feature funnels)
  const solutions = [
    'energy-refunds', 'broadband-compensation', 'subscriptions',
    'cancel-services', 'flight-delay-compensation', 'money-hub',
    'email-scanner', 'contract-alerts',
  ];

  // Deal category landing pages
  const dealCategories = [
    'energy', 'broadband', 'mobile', 'insurance', 'mortgages',
    'loans', 'credit-cards', 'car-finance', 'travel',
  ];

  // Fetch all published blog posts from database (skip gracefully if env vars absent at build time)
  let blogPosts: { slug: string; published_at: string }[] | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      const { data } = await supabase
        .from('blog_posts')
        .select('slug, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      blogPosts = data;
    } catch {
      // fall through — only static blog entries will appear in sitemap
    }
  }

  // Static blog posts (hardcoded routes)
  const staticBlogSlugs = [
    'how-to-claim-flight-delay-compensation-uk',
    'are-you-overpaying-on-energy',
    'broadband-contract-ended',
  ];

  // Dynamic blog posts from database
  const dynamicBlogEntries = (blogPosts || [])
    .filter(p => !staticBlogSlugs.includes(p.slug))
    .map(p => ({
      url: `${baseUrl}/blog/${p.slug}`,
      lastModified: p.published_at || now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

  return [
    // Core pages
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/auth/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/auth/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },

    // Solution landing pages (highest SEO value)
    ...solutions.map(slug => ({
      url: `${baseUrl}/solutions/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),

    // Deal category pages
    ...dealCategories.map(cat => ({
      url: `${baseUrl}/deals/${cat}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),

    // SEO landing pages (high-intent keywords)
    { url: `${baseUrl}/dispute-energy-bill`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/flight-delay-compensation`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/cancel-gym-membership`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/council-tax-challenge`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/debt-collection-letter`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/debt-collection-response`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/broadband-overcharging`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/hidden-subscriptions`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/insurance-complaint`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/mobile-contract-dispute`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/parking-appeal`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },

    // Deals hub
    { url: `${baseUrl}/deals`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },

    // Blog
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog/how-to-claim-flight-delay-compensation-uk`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog/are-you-overpaying-on-energy`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/blog/broadband-contract-ended`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...dynamicBlogEntries,

    // Legal
    { url: `${baseUrl}/privacy-policy`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${baseUrl}/terms-of-service`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${baseUrl}/cookie-policy`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
  ];
}
