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
  title: "Paybacker — Get Your Money Back",
  description: "AI agents that dispute bills, write complaints, and cancel forgotten subscriptions — on your behalf. UK consumer rights, automated.",
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
