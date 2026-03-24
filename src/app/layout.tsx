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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Awin Advertiser Mastertag. Set NEXT_PUBLIC_AWIN_ADVERTISER_ID in Vercel to activate. */}
        {process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID && (
          <script async src={`https://www.dwin1.com/${process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID}.js`} type="text/javascript" />
        )}
        {/* Meta Pixel */}
        <script dangerouslySetInnerHTML={{ __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '722806327584909');
          fbq('track', 'PageView');
        `}} />
        <noscript><img height="1" width="1" style={{display:'none'}} src="https://www.facebook.com/tr?id=722806327584909&ev=PageView&noscript=1" /></noscript>
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Paybacker',
              url: 'https://paybacker.co.uk',
              logo: 'https://paybacker.co.uk/logo.png',
              description: 'AI-powered savings platform for UK consumers. Dispute bills, track subscriptions, scan bank accounts and get your money back automatically.',
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
        <PostHogProvider>
          {children}
          <ChatWidget />
        </PostHogProvider>
      </body>
    </html>
  );
}
