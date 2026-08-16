import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import ChatWidget from "@/components/ChatWidget";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import TrackingScripts from "@/components/TrackingScripts";
import ChunkErrorReload from "@/components/ChunkErrorReload";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://paybacker.co.uk'),
  title: {
    default: 'Paybacker — Fight Unfair Bills. Cancel Sneaky Subs. Recover Your Money.',
    template: '%s | Paybacker',
  },
  description: 'The UK app that spots price increases, drafts the dispute letter citing the exact law, and tracks your dispute through to the end.',
  keywords: ['complaint letter generator', 'UK consumer rights', 'subscription tracker', 'cancel subscriptions', 'energy bill dispute', 'debt dispute letter', 'flight delay compensation', 'parking charge appeal'],
  authors: [{ name: 'Paybacker LTD' }],
  creator: 'Paybacker LTD',
  publisher: 'Paybacker LTD',
  verification: {
    google: 'uB2k37Gimef4Mgg5Owl5DbQgrilihlCLBLHafttoAv4',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://paybacker.co.uk',
    siteName: 'Paybacker',
    title: 'Paybacker — Fight Unfair Bills. Cancel Sneaky Subs. Recover Your Money.',
    description: 'The UK app that spots price increases, drafts the dispute letter citing the exact law, and tracks your dispute through to the end.',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'Paybacker',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Paybacker — Fight Unfair Bills. Recover Your Money.',
    description: 'AI dispute letters citing the exact UK law, drafted in 30 seconds and tracked to the end.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${inter.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Preconnect to critical external domains for faster loading */}
        <link rel="preconnect" href="https://kcxxlesishltdmfctlmo.supabase.co" />
        <link rel="dns-prefetch" href="https://kcxxlesishltdmfctlmo.supabase.co" />
      </head>
      <body className="min-h-full flex flex-col">
        {/*
          Sitewide Organization + WebSite graph.

          Deliberately absent: AggregateRating and Review. We hold no
          legitimate review data, and fabricating it is both a structured
          data policy violation and a manual-action risk. Do not add them
          without a real, verifiable review source.

          Also absent: WebSite.potentialAction / SearchAction. There is no
          site-wide search surface to point it at. /check is a case
          assessment form, not a search endpoint, so declaring one would
          be a false claim about the site.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://paybacker.co.uk/#organization',
                  name: 'Paybacker',
                  legalName: 'Paybacker LTD',
                  alternateName: 'Paybacker LTD',
                  url: 'https://paybacker.co.uk',
                  logo: {
                    '@type': 'ImageObject',
                    url: 'https://paybacker.co.uk/logo.png',
                    width: 512,
                    height: 512,
                  },
                  image: 'https://paybacker.co.uk/logo.png',
                  description:
                    'UK consumer-rights platform. Finds unfair and forgotten charges, drafts dispute letters citing the exact UK legislation and regulator rules, and tracks each case to its outcome.',
                  foundingDate: '2026-03',
                  email: 'hello@paybacker.co.uk',
                  // Companies House registration. identifier + the
                  // England & Wales jurisdiction are the two facts a
                  // knowledge panel needs to disambiguate a UK company.
                  identifier: {
                    '@type': 'PropertyValue',
                    propertyID: 'Companies House company number',
                    value: '15289174',
                  },
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'GB',
                    addressRegion: 'England',
                  },
                  areaServed: {
                    '@type': 'Country',
                    name: 'United Kingdom',
                  },
                  knowsLanguage: 'en-GB',
                  sameAs: [
                    'https://x.com/PaybackerUK',
                    'https://www.linkedin.com/company/112575954/',
                    'https://www.instagram.com/paybacker.co.uk/',
                  ],
                  contactPoint: [
                    {
                      '@type': 'ContactPoint',
                      email: 'hello@paybacker.co.uk',
                      contactType: 'customer service',
                      areaServed: 'GB',
                      availableLanguage: 'English',
                    },
                    {
                      '@type': 'ContactPoint',
                      email: 'business@paybacker.co.uk',
                      contactType: 'sales',
                      areaServed: 'GB',
                      availableLanguage: 'English',
                    },
                  ],
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://paybacker.co.uk/#website',
                  url: 'https://paybacker.co.uk',
                  name: 'Paybacker',
                  description:
                    'UK consumer rights, made usable: which law applies, what the deadline is, who to escalate to, and the letter to send.',
                  inLanguage: 'en-GB',
                  publisher: { '@id': 'https://paybacker.co.uk/#organization' },
                },
              ],
            }),
          }}
        />
        {/*
          ChunkErrorReload listens for `error` and `unhandledrejection`
          window events that match a chunk-load failure pattern, and
          one-shot reloads the page (sessionStorage cooldown). Without
          this, a stale browser cache after a deploy surfaces as a
          dead Vercel "this page couldn't load" with no recovery.
          Mounted at the very start of <body> so it's active before
          anything else can trigger a chunk fetch.
        */}
        <ChunkErrorReload />
        <PostHogProvider>
          {children}
          <ChatWidget />
        </PostHogProvider>
        <TrackingScripts />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
