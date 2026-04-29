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
