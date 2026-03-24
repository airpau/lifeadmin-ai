import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing - Free, Essential and Pro Plans | Paybacker',
  description:
    'Compare Paybacker plans. Free plan includes 3 AI letters and one-time bank scan. Essential at £4.99/month adds daily sync. Pro at £9.99/month adds AI assistant.',
  openGraph: {
    title: 'Pricing - Free, Essential and Pro Plans | Paybacker',
    description:
      'Compare Paybacker plans. Free plan includes 3 AI letters and one-time bank scan. Essential at £4.99/month adds daily sync. Pro at £9.99/month adds AI assistant.',
    url: 'https://paybacker.co.uk/pricing',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pricing - Free, Essential and Pro Plans | Paybacker',
    description:
      'Compare Paybacker plans. Free plan includes 3 AI letters and one-time bank scan. Essential at £4.99/month adds daily sync. Pro at £9.99/month adds AI assistant.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/pricing',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
