import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
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

    // Blog
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog/how-to-claim-flight-delay-compensation-uk`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog/are-you-overpaying-on-energy`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/blog/broadband-contract-ended`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },

    // Legal
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${baseUrl}/privacy-policy`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
  ];
}
