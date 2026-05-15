import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/auth',
          '/api',
          '/preview',
          '/docs/paybacker-assistant',
          '/docs/claude-desktop',
          '/ico-notice',
          '/unsubscribe',
          '/account-deletion',
          '/status',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/dashboard',
          '/auth',
          '/api',
          '/preview',
        ],
      },
    ],
    sitemap: 'https://paybacker.co.uk/sitemap.xml',
    host: 'https://paybacker.co.uk',
  }
}
