import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import ChatWidget from "@/components/ChatWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://paybacker.co.uk'),
  title: {
    default: 'Paybacker - AI-Powered Money Recovery for UK Consumers',
    template: '%s | Paybacker',
  },
  description: 'AI complaint letters citing UK consumer law, subscription tracking, bank scanning, and spending insights. Dispute bills, cancel subscriptions, and get your money back automatically.',
  keywords: ['complaint letter generator', 'UK consumer rights', 'subscription tracker', 'cancel subscriptions', 'energy bill dispute', 'debt dispute letter', 'flight delay compensation', 'parking charge appeal'],
  authors: [{ name: 'Paybacker LTD' }],
  creator: 'Paybacker LTD',
  publisher: 'Paybacker LTD',
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
    title: 'Paybacker - AI-Powered Money Recovery for UK Consumers',
    description: 'AI complaint letters citing UK consumer law, subscription tracking, bank scanning, and spending insights. Get your money back automatically.',
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
    title: 'Paybacker - AI-Powered Money Recovery',
    description: 'AI complaint letters, subscription tracking, and spending insights for UK consumers.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk',
  },
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Awin Advertiser Mastertag. Set NEXT_PUBLIC_AWIN_ADVERTISER_ID in Vercel to activate. */}
        {process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID && (
          <script async src={`https://www.dwin1.com/${process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID}.js`} type="text/javascript" />
        )}
        {/* PostHog + GA4 loaded via Script component in PostHogProvider */}
        {/* Google Analytics GA4 */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-GRL9XKYTN1" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-GRL9XKYTN1');
        `}} />
      </head>
      <body className="min-h-full flex flex-col">
        <PostHogProvider>
          {children}
          <ChatWidget />
        </PostHogProvider>
      </body>
    </html>
  );
}
