import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import ChatWidget from "@/components/ChatWidget";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import TrackingScripts from "@/components/TrackingScripts";

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
  description: 'The only UK app that detects price increases, drafts the dispute letter citing the exact law, and tracks until you get your money back. Founder has personally recovered £2,000+ — see how.',
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
    description: 'The only UK app that detects price increases, drafts the dispute letter citing the exact law, and tracks until you get your money back. Founder has personally recovered £2,000+ — see how.',
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
    description: 'AI dispute letters citing the exact UK law. Founder has recovered £2,000+ on his own bills using it.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Paybacker',
              url: 'https://paybacker.co.uk',
              logo: 'https://paybacker.co.uk/logo.png',
              description: 'AI-powered bill-fighting platform for UK consumers. Detects price increases, drafts dispute letters citing UK consumer law, and tracks each case until your money is recovered.',
              foundingDate: '2026-03',
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'hello@paybacker.co.uk',
                contactType: 'customer service',
                availableLanguage: 'English',
              },
            }),
          }}
        />
        {/* Skip-to-main-content — keyboard / screen-reader users bypass nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[10000] focus:bg-mint-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <PostHogProvider>
          {/* Each route attaches `id="main-content" tabIndex={-1}` to its
              real <main> (dashboard shell, auth pages, marketing pages) so
              the skip link lands AFTER any in-page navigation. */}
          <div id="app-shell" className="flex-1 flex flex-col">
            {children}
          </div>
          <ChatWidget />
        </PostHogProvider>
        <TrackingScripts />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
