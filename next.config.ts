import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Redirect paybacker.ai → paybacker.co.uk
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'paybacker.ai' }],
        destination: 'https://paybacker.co.uk/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.paybacker.ai' }],
        destination: 'https://paybacker.co.uk/:path*',
        permanent: true,
      },
      // Legacy /login path — route to the real auth page
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true,
      },
      // Engineers guessing paybacker.co.uk/api should land on the B2B
      // landing page. Exact match only — /api/foo continues to resolve
      // against route handlers in src/app/api/*. Temporary (307) so we
      // can swap in a real developer portal later without a permanent
      // redirect cache hangover.
      {
        source: '/api',
        destination: '/for-business',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://eu.i.posthog.com/decide",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
    ],
  },
};

export default nextConfig;
