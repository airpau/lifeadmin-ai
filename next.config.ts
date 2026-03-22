import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy PostHog through our domain to avoid ad blockers
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
  // Required to prevent header stripping on proxied requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
