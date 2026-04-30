import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { ArrowRight, Shield, Zap, ScanSearch, CreditCard, Plane, BarChart3, Mail, Bell } from 'lucide-react';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface SolutionPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  keywords: string[];
  icon: LucideIcon;
  heroStat: string;
  heroStatLabel: string;
  ctaText: string;
  ctaLink: string;
  benefits: string[];
  howItWorks: Array<{ step: string; title: string; description: string }>;
  faqs: Array<{ q: string; a: string }>;
  socialProof: string;
  featureHighlight: string;
}

const PAGES: Record<string, SolutionPage> = {
  'energy-refunds': {
    slug: 'energy-refunds',
    title: 'Dispute Your Energy Bill UK - AI Complaint Letter Generator',
    description:
      'Generate a formal energy bill complaint letter citing Ofgem rules and UK consumer law in 30 seconds. Free to use. Get refunds from British Gas, EDF, E.ON, Octopus and more.',
    h1: 'Dispute your energy bill and get your money back',
    subtitle:
      'Paybacker generates a formal complaint letter citing exact UK energy regulations in 30 seconds. No legal knowledge needed. Works with every UK energy supplier.',
    keywords: ['dispute energy bill UK', 'energy bill complaint letter', 'Ofgem complaint', 'energy refund claim', 'overcharged energy bill'],
    icon: Zap,
    heroStat: '30 sec',
    heroStatLabel: 'to generate your complaint',
    ctaText: 'Generate your complaint letter free',
    ctaLink: '/auth/signup',
    benefits: [
      'Cites Ofgem regulations and Consumer Rights Act 2015',
      'Works with British Gas, EDF, E.ON, Octopus, OVO and all UK suppliers',
      'Formal tone that gets taken seriously by complaints departments',
      'Includes specific regulatory references for your situation',
      'Free — 3 letters per month on the free plan',
    ],
    howItWorks: [
      { step: '1', title: 'Describe your issue', description: 'Tell us what happened — overcharged, estimated bills, price increase, poor service. Plain English is fine.' },
      { step: '2', title: 'AI generates your letter', description: 'Our AI writes a formal complaint citing the exact UK laws and Ofgem rules that apply to your situation.' },
      { step: '3', title: 'Send and get your money back', description: 'Copy the letter and send it to your supplier. Most complaints are resolved within 8 weeks.' },
    ],
    faqs: [
      { q: 'Do I need to know UK energy law?', a: 'No. Just describe what happened in plain English. Our AI identifies which laws apply and cites them correctly in your letter.' },
      { q: 'Which energy suppliers does this work with?', a: 'Every UK energy supplier including British Gas, EDF, E.ON Next, Octopus Energy, OVO, Scottish Power, Shell Energy, and SSE.' },
      { q: 'What if my supplier ignores the letter?', a: 'If your supplier does not resolve your complaint within 8 weeks, you can escalate to the Energy Ombudsman. We include this in the letter.' },
      { q: 'Is this really free?', a: 'Yes. You get 3 free complaint letters per month. Unlimited letters are available on the Essential plan (£4.99/month).' },
    ],
    socialProof: 'Thousands of UK consumers have used AI complaint letters to get refunds from energy suppliers',
    featureHighlight: 'Connect your bank account and we will also identify if you are overpaying compared to available tariffs',
  },
  'broadband-compensation': {
    slug: 'broadband-compensation',
    title: 'Broadband Complaint Letter UK - Challenge Price Rises and Poor Service',
    description:
      'Generate a formal broadband complaint letter citing Ofcom rules in 30 seconds. Challenge mid-contract price rises, slow speeds, or poor service from any UK provider.',
    h1: 'Challenge your broadband provider and claim compensation',
    subtitle:
      'Mid-contract price rise? Slow speeds? Service outages? Paybacker generates a formal complaint citing Ofcom rules and the Consumer Rights Act that gets results.',
    keywords: ['broadband complaint letter UK', 'Ofcom broadband complaint', 'broadband price rise compensation', 'challenge broadband provider', 'slow broadband complaint'],
    icon: Shield,
    heroStat: '£180/yr',
    heroStatLabel: 'average saving by switching broadband',
    ctaText: 'Generate your broadband complaint free',
    ctaLink: '/auth/signup',
    benefits: [
      'Cites Ofcom automatic compensation scheme rules',
      'Challenge mid-contract price rises legally',
      'Works with BT, Sky, Virgin Media, TalkTalk, EE and all UK providers',
      'Includes speed guarantee complaint templates',
      'Free to start — 3 letters per month',
    ],
    howItWorks: [
      { step: '1', title: 'Tell us your problem', description: 'Price increase, slow speeds, service outage, billing error, or cancellation dispute.' },
      { step: '2', title: 'AI writes your complaint', description: 'Formal letter citing Ofcom rules, automatic compensation scheme, and Consumer Rights Act.' },
      { step: '3', title: 'Send and get compensated', description: 'Your provider must respond. If unresolved after 8 weeks, escalate to CISAS or the Communications Ombudsman.' },
    ],
    faqs: [
      { q: 'Can I leave my broadband contract if the price goes up?', a: 'Under Ofcom rules, if your provider increases the price beyond what was agreed in your contract, you may be able to leave without paying an exit fee. Our letter covers this.' },
      { q: 'What if my broadband speed is slower than promised?', a: 'Ofcom requires providers to give you a minimum guaranteed speed. If they consistently fail to deliver it, you have the right to exit your contract penalty-free.' },
      { q: 'How much compensation can I claim?', a: 'Under Ofcom automatic compensation: £9.33/day for loss of service, £6.21/day for delayed repairs, and £6.21 for missed appointments.' },
    ],
    socialProof: 'UK broadband customers are entitled to automatic compensation under Ofcom rules',
    featureHighlight: 'We also compare 10 broadband providers so you can switch to a cheaper deal after your complaint',
  },
  subscriptions: {
    slug: 'subscriptions',
    title: 'Find Hidden Subscriptions UK - Bank Account Subscription Finder',
    description:
      'Connect your bank account and find every subscription, direct debit, and recurring payment you are being charged for. Cancel what you do not need and save hundreds per year.',
    h1: 'Find and cancel subscriptions you forgot about',
    subtitle:
      'The average UK adult wastes £312/year on forgotten subscriptions. Connect your bank account and Paybacker finds every recurring payment in seconds. Cancel what you do not need.',
    keywords: ['find hidden subscriptions', 'cancel unwanted subscriptions UK', 'subscription finder', 'check all my subscriptions', 'stop unwanted direct debits'],
    icon: ScanSearch,
    heroStat: '£312/yr',
    heroStatLabel: 'wasted on forgotten subscriptions',
    ctaText: 'Scan your subscriptions free',
    ctaLink: '/auth/signup',
    benefits: [
      'Connects to your bank via Open Banking (read-only, bank-level security)',
      'Detects every subscription, direct debit, and recurring payment',
      'Shows monthly and annual cost for each subscription',
      'AI cancellation emails with legal context for anything you want to cancel',
      'One-time scan is free — no credit card needed',
    ],
    howItWorks: [
      { step: '1', title: 'Connect your bank', description: 'Secure Open Banking connection. Read-only access. We never see your login details.' },
      { step: '2', title: 'See every subscription', description: 'Paybacker lists every recurring payment with amounts, dates, and categories.' },
      { step: '3', title: 'Cancel what you do not need', description: 'Generate AI cancellation emails citing Consumer Contracts Regulations for any subscription.' },
    ],
    faqs: [
      { q: 'Is it safe to connect my bank?', a: 'Yes. We use Open Banking via Yapily, which is regulated by the FCA. We only have read-only access to your transactions. We never see your bank login details.' },
      { q: 'How many subscriptions will it find?', a: 'The average user discovers 3-5 subscriptions they had forgotten about. Some find over 10.' },
      { q: 'Can it cancel subscriptions for me?', a: 'We generate a formal cancellation email citing UK Consumer Contracts Regulations that you send to the provider. Automated cancellation is coming soon.' },
    ],
    socialProof: 'UK consumers waste over £25 billion per year on unused subscriptions',
    featureHighlight: 'We also scan your email inbox to find subscription receipts going back 2 years',
  },
  'cancel-services': {
    slug: 'cancel-services',
    title: 'Cancel Any Subscription UK - AI Cancellation Letter Generator',
    description:
      'Generate a formal cancellation email citing UK Consumer Contracts Regulations in seconds. Cancel gym memberships, mobile contracts, broadband, insurance, and more.',
    h1: 'Cancel any subscription or contract without the hassle',
    subtitle:
      'Providers make cancellation deliberately difficult. Paybacker generates a formal cancellation email citing the exact UK law that applies, so they cannot ignore you.',
    keywords: ['cancel subscription UK', 'cancel gym membership', 'cancellation letter template', 'how to cancel contract', 'cancel direct debit'],
    icon: CreditCard,
    heroStat: '90 sec',
    heroStatLabel: 'to generate your cancellation email',
    ctaText: 'Generate your cancellation email free',
    ctaLink: '/auth/signup',
    benefits: [
      'Cites Consumer Contracts Regulations 2013 and Consumer Rights Act 2015',
      'Works with gyms, mobile networks, broadband, insurance, streaming, and more',
      'Includes cooling-off period and minimum term calculations',
      'Professional tone that gets processed by customer service teams',
      'Free to start',
    ],
    howItWorks: [
      { step: '1', title: 'Select your provider', description: 'Tell us which service you want to cancel and why.' },
      { step: '2', title: 'AI writes your cancellation', description: 'Formal email citing the specific regulations that apply to your contract type.' },
      { step: '3', title: 'Send and confirm cancellation', description: 'Send the email and keep the confirmation as proof. We track the status for you.' },
    ],
    faqs: [
      { q: 'What if my gym says I cannot cancel?', a: 'Under the Consumer Rights Act, unfair contract terms are not enforceable. Our cancellation email cites this and gives the gym a legal basis for processing your cancellation.' },
      { q: 'Can I cancel a mobile contract early?', a: 'If your provider has breached the contract (e.g. poor coverage, price rise), you may be able to exit early. Our AI identifies if this applies to your situation.' },
      { q: 'Do I still have to pay after sending the cancellation?', a: 'It depends on your contract terms. Our letter clarifies your notice period and final payment obligations based on UK law.' },
    ],
    socialProof: 'UK consumers have the right to cancel most services with proper notice',
    featureHighlight: 'Connect your bank and we will show you every subscription you are paying for',
  },
  'flight-delay-compensation': {
    slug: 'flight-delay-compensation',
    title: 'Flight Delay Compensation UK - Claim Up to £520',
    description:
      'Claim up to £520 compensation for delayed or cancelled flights under UK261 and EU261 regulations. Free AI-generated claim letter. Works for flights in the last 6 years.',
    h1: 'Claim up to £520 for your delayed or cancelled flight',
    subtitle:
      'Under UK261 regulations, you are entitled to compensation of £220-£520 for flights delayed over 3 hours, cancelled, or overbooked. Most claims are never made. Ours take 30 seconds.',
    keywords: ['flight delay compensation UK', 'claim flight delay', 'UK261 compensation', 'flight cancelled compensation', 'delayed flight refund'],
    icon: Plane,
    heroStat: '£520',
    heroStatLabel: 'maximum compensation per passenger',
    ctaText: 'Start your flight claim free',
    ctaLink: '/auth/signup',
    benefits: [
      'Covers delays over 3 hours, cancellations, and denied boarding',
      'Cites UK261 (post-Brexit) and EU261 regulations',
      'Compensation: £220 (short haul), £350 (medium), £520 (long haul)',
      'Claim flights from the last 6 years',
      'Free to generate your claim letter',
    ],
    howItWorks: [
      { step: '1', title: 'Enter your flight details', description: 'Flight number, date, departure and arrival airports, and what happened (delay, cancellation, overbooking).' },
      { step: '2', title: 'AI generates your claim', description: 'Formal compensation claim citing UK261/EU261 with the exact amount you are owed.' },
      { step: '3', title: 'Send to the airline', description: 'Email the claim directly to the airline. Most pay within 4-8 weeks. If they refuse, escalate to CEDR.' },
    ],
    faqs: [
      { q: 'How much compensation can I claim?', a: 'Under 1,500km: £220. 1,500-3,500km: £350. Over 3,500km: £520. Per passenger, per flight.' },
      { q: 'Can I claim for flights from years ago?', a: 'Yes. In the UK you can claim for flights delayed in the last 6 years. In the EU it is typically 2-3 years depending on the country.' },
      { q: 'Does the airline have to pay?', a: 'Yes, unless the delay was caused by extraordinary circumstances (e.g. severe weather, air traffic control strikes). Technical issues and crew shortages are NOT extraordinary circumstances.' },
      { q: 'What if the airline ignores my claim?', a: 'If the airline does not respond within 8 weeks, you can escalate to CEDR (Centre for Effective Dispute Resolution) for free.' },
    ],
    socialProof: 'Over £600 million in flight compensation goes unclaimed by UK passengers every year',
    featureHighlight: 'Connect your email inbox and we will automatically detect delayed flights from your booking confirmations',
  },
  'money-hub': {
    slug: 'money-hub',
    title: 'Money Hub - See Where Every Penny Goes | Paybacker',
    description:
      'Connect your bank account and see your complete financial picture. Income, spending by category, budget tracking, net worth, and AI-powered insights. Your personal finance dashboard.',
    h1: 'See exactly where your money goes every month',
    subtitle:
      'Connect your bank account and Paybacker categorises every transaction, tracks your income vs spending, sets budgets, and gives you a financial health score. All automated, all in one dashboard.',
    keywords: ['money management app UK', 'spending tracker', 'budget planner app', 'personal finance dashboard', 'track spending categories'],
    icon: BarChart3,
    heroStat: '20+',
    heroStatLabel: 'spending categories, auto-categorised',
    ctaText: 'Connect your bank free',
    ctaLink: '/auth/signup',
    benefits: [
      'Income vs outgoings with monthly trends',
      '20+ spending categories with AI self-learning categorisation',
      'Set budgets per category with progress tracking',
      'Net worth tracker (assets minus liabilities)',
      'Financial health score updated with every sync',
    ],
    howItWorks: [
      { step: '1', title: 'Connect your bank', description: 'Secure Open Banking connection via Yapily. FCA regulated. Read-only access.' },
      { step: '2', title: 'See your full picture', description: 'Every transaction categorised. Income, spending, subscriptions, and trends in one view.' },
      { step: '3', title: 'Take control', description: 'Set budgets, track goals, and get alerts when spending spikes. AI assistant answers questions about your finances.' },
    ],
    faqs: [
      { q: 'Which banks are supported?', a: 'Most UK banks including Barclays, HSBC, Lloyds, NatWest, Santander, Monzo, Starling, Revolut, and more via Open Banking.' },
      { q: 'How is this different from my banking app?', a: 'Your banking app shows transactions. Paybacker categorises them, tracks trends over time, sets budgets, detects subscriptions, finds overpayments, and recommends cheaper deals.' },
      { q: 'Is the free plan useful?', a: 'Yes. Free includes a one-time bank scan with top 5 spending categories. Essential (£4.99/month) adds daily sync and full dashboard. Pro adds AI assistant.' },
    ],
    socialProof: 'The average UK household overpays £1,000+ per year on bills and subscriptions',
    featureHighlight: 'Pro users can chat with an AI assistant about their finances using their real data',
  },
  'email-scanner': {
    slug: 'email-scanner',
    title: 'Email Inbox Scanner - Find Money You Are Owed | Paybacker',
    description:
      'Connect Gmail or Outlook and scan 2 years of emails for overcharges, forgotten subscriptions, flight delay compensation, debt disputes, and price increase notifications.',
    h1: 'Scan your email inbox and find money you are owed',
    subtitle:
      'Your email inbox contains proof of overcharges, price increase notifications, flight booking confirmations, and subscription receipts. Paybacker scans 2 years of emails and shows you exactly what you can claim.',
    keywords: ['email scanner money', 'find overcharges email', 'scan inbox subscriptions', 'email receipt scanner', 'find money owed UK'],
    icon: Mail,
    heroStat: '2 years',
    heroStatLabel: 'of email history scanned',
    ctaText: 'Join the waitlist — coming soon',
    ctaLink: '/auth/signup',
    benefits: [
      'Coming soon — currently being verified by Google for highest security standards',
      'Detects price increase notifications you may have missed',
      'Finds flight booking confirmations for delay compensation claims',
      'Identifies subscription receipts and renewal notices',
      'Smart action buttons: write complaint, claim compensation, cancel subscription',
    ],
    howItWorks: [
      { step: '1', title: 'Connect your email', description: 'Google OAuth login. Read-only access. We only scan relevant financial emails.' },
      { step: '2', title: 'AI analyses your emails', description: 'We scan up to 2 years of emails for overcharges, subscriptions, compensation opportunities, and disputes.' },
      { step: '3', title: 'Take action on each finding', description: 'Each opportunity has an action button: write complaint, claim compensation, add to subscriptions, or dismiss.' },
    ],
    faqs: [
      { q: 'Which email providers are supported?', a: 'Gmail is fully supported now. Outlook support is coming soon.' },
      { q: 'What emails do you read?', a: 'We only scan emails from known financial senders (banks, utility companies, subscription services, airlines). We do not read personal emails.' },
      { q: 'Is this safe?', a: 'Yes. We use Google OAuth which means we never see your email password. You can revoke access at any time from your Google account settings.' },
    ],
    socialProof: 'The average inbox scan finds 3-5 actionable money-saving opportunities',
    featureHighlight: 'Combined with bank scanning, this gives you the most complete picture of your finances available anywhere',
  },
  'contract-alerts': {
    slug: 'contract-alerts',
    title: 'Contract Renewal Alerts UK - Never Overpay on Auto-Renewal',
    description:
      'Get email alerts at 30, 14, and 7 days before your contracts renew. Energy, broadband, mobile, insurance, mortgages, and more. Stop overpaying on auto-renewals.',
    h1: 'Stop overpaying when your contracts auto-renew',
    subtitle:
      'Every year, UK consumers lose billions to auto-renewal price hikes. Paybacker tracks your contract end dates and alerts you at 30, 14, and 7 days before renewal — so you can switch to a better deal.',
    keywords: ['contract renewal alerts', 'stop auto renewal', 'contract end date tracker', 'renewal reminder app', 'avoid price hikes UK'],
    icon: Bell,
    heroStat: '30/14/7',
    heroStatLabel: 'day alerts before every renewal',
    ctaText: 'Track your contracts free',
    ctaLink: '/auth/signup',
    benefits: [
      'Email alerts at 30, 14, and 7 days before contract end dates',
      'Tracks energy, broadband, mobile, insurance, mortgages, loans, and more',
      'Shows what you currently pay vs available deals',
      'One-click comparison to 56 deals from top UK providers',
      'Add contracts manually or detect them from bank transactions',
    ],
    howItWorks: [
      { step: '1', title: 'Add your contracts', description: 'Enter your contract end dates or connect your bank and we detect them automatically.' },
      { step: '2', title: 'Get timely alerts', description: 'Email reminders at 30, 14, and 7 days before each contract renews.' },
      { step: '3', title: 'Switch and save', description: 'Compare deals from 56 UK providers and switch before you get hit with a price increase.' },
    ],
    faqs: [
      { q: 'How does it know my contract end dates?', a: 'You can add them manually, or connect your bank and email. We detect contract start dates from transactions and calculate when they end based on typical term lengths.' },
      { q: 'What types of contracts can it track?', a: 'Energy tariffs, broadband, mobile phone, TV, insurance, mortgages, loans, gym memberships, and any other recurring contract.' },
      { q: 'What happens when I get an alert?', a: 'The alert email shows your current cost, contract end date, and links to compare cheaper alternatives from our deals page.' },
    ],
    socialProof: 'UK consumers lose an estimated £4 billion per year to auto-renewal price hikes',
    featureHighlight: 'Combined with our 56 affiliate deals, this becomes a complete switching engine',
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) return { title: 'Paybacker' };

  const url = `https://paybacker.co.uk/solutions/${slug}`;
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: 'Paybacker',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: page.title,
      description: page.description,
      images: ['/logo.png'],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();

  const Icon = page.icon;

  return (
    <div className="m-land-root">
      <MarkNav />
      <main>
        <div className="wrap">
          <section className="land-hero">
            <span className="badge">
              <Icon width={14} height={14} aria-hidden="true" />
              Free to use — no credit card required
            </span>
            <h1>{page.h1}</h1>
            <p className="subtitle">{page.subtitle}</p>
            <div className="hero-stat">
              <span className="stat-value">{page.heroStat}</span>
              <span className="stat-label">{page.heroStatLabel}</span>
            </div>
            <div>
              <Link href={page.ctaLink} className="btn btn-mint btn-lg">
                {page.ctaText} <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="social-proof">{page.socialProof}</p>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>What you get</h2>
              <ul className="rights-list">
                {page.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>How it works</h2>
            <div className="step-grid">
              {page.howItWorks.map((step) => (
                <div key={step.step} className="step">
                  <div className="step-badge">{step.step}</div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="soft-cta">
              <p>{page.featureHighlight}</p>
              <Link href={page.ctaLink}>
                Get started free <ArrowRight width={14} height={14} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>Frequently asked questions</h2>
            <div className="faq-grid">
              {page.faqs.map((faq) => (
                <article key={faq.q} className="faq-card">
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="final-cta">
              <h2>Ready to take control?</h2>
              <p>Join thousands of UK consumers who are using Paybacker to save money and fight unfair charges.</p>
              <Link href={page.ctaLink} className="btn btn-mint btn-lg">
                {page.ctaText} <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MarkFoot />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: page.faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.a,
              },
            })),
          }),
        }}
      />
    </div>
  );
}
