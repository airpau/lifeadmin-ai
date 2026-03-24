import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CheckCircle, ArrowRight, Clock, Shield, Zap, FileText, ScanSearch, CreditCard, TrendingDown, Plane, BarChart3, Mail, Bell } from 'lucide-react';

interface SolutionPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  keywords: string[];
  icon: any;
  iconColor: string;
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
    description: 'Generate a formal energy bill complaint letter citing Ofgem rules and UK consumer law in 30 seconds. Free to use. Get refunds from British Gas, EDF, E.ON, Octopus and more.',
    h1: 'Dispute your energy bill and get your money back',
    subtitle: 'Paybacker generates a formal complaint letter citing exact UK energy regulations in 30 seconds. No legal knowledge needed. Works with every UK energy supplier.',
    keywords: ['dispute energy bill UK', 'energy bill complaint letter', 'Ofgem complaint', 'energy refund claim', 'overcharged energy bill'],
    icon: Zap,
    iconColor: 'text-amber-400',
    heroStat: '30 sec',
    heroStatLabel: 'to generate your complaint',
    ctaText: 'Generate Your Complaint Letter Free',
    ctaLink: '/auth/signup',
    benefits: [
      'Cites Ofgem regulations and Consumer Rights Act 2015',
      'Works with British Gas, EDF, E.ON, Octopus, OVO and all UK suppliers',
      'Formal tone that gets taken seriously by complaints departments',
      'Includes specific regulatory references for your situation',
      'Free - 3 letters per month on the free plan',
    ],
    howItWorks: [
      { step: '1', title: 'Describe your issue', description: 'Tell us what happened - overcharged, estimated bills, price increase, poor service. Plain English is fine.' },
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
    description: 'Generate a formal broadband complaint letter citing Ofcom rules in 30 seconds. Challenge mid-contract price rises, slow speeds, or poor service from any UK provider.',
    h1: 'Challenge your broadband provider and claim compensation',
    subtitle: 'Mid-contract price rise? Slow speeds? Service outages? Paybacker generates a formal complaint citing Ofcom rules and the Consumer Rights Act that gets results.',
    keywords: ['broadband complaint letter UK', 'Ofcom broadband complaint', 'broadband price rise compensation', 'challenge broadband provider', 'slow broadband complaint'],
    icon: Shield,
    iconColor: 'text-blue-400',
    heroStat: '£180/yr',
    heroStatLabel: 'average saving by switching broadband',
    ctaText: 'Generate Your Broadband Complaint Free',
    ctaLink: '/auth/signup',
    benefits: [
      'Cites Ofcom automatic compensation scheme rules',
      'Challenge mid-contract price rises legally',
      'Works with BT, Sky, Virgin Media, TalkTalk, EE and all UK providers',
      'Includes speed guarantee complaint templates',
      'Free to start - 3 letters per month',
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
  'subscriptions': {
    slug: 'subscriptions',
    title: 'Find Hidden Subscriptions UK - Bank Account Subscription Finder',
    description: 'Connect your bank account and find every subscription, direct debit, and recurring payment you are being charged for. Cancel what you do not need and save hundreds per year.',
    h1: 'Find and cancel subscriptions you forgot about',
    subtitle: 'The average UK adult wastes £312/year on forgotten subscriptions. Connect your bank account and Paybacker finds every recurring payment in seconds. Cancel what you do not need.',
    keywords: ['find hidden subscriptions', 'cancel unwanted subscriptions UK', 'subscription finder', 'check all my subscriptions', 'stop unwanted direct debits'],
    icon: ScanSearch,
    iconColor: 'text-purple-400',
    heroStat: '£312/yr',
    heroStatLabel: 'wasted on forgotten subscriptions',
    ctaText: 'Scan Your Subscriptions Free',
    ctaLink: '/auth/signup',
    benefits: [
      'Connects to your bank via Open Banking (read-only, bank-level security)',
      'Detects every subscription, direct debit, and recurring payment',
      'Shows monthly and annual cost for each subscription',
      'AI cancellation emails with legal context for anything you want to cancel',
      'One-time scan is free - no credit card needed',
    ],
    howItWorks: [
      { step: '1', title: 'Connect your bank', description: 'Secure Open Banking connection. Read-only access. We never see your login details.' },
      { step: '2', title: 'See every subscription', description: 'Paybacker lists every recurring payment with amounts, dates, and categories.' },
      { step: '3', title: 'Cancel what you do not need', description: 'Generate AI cancellation emails citing Consumer Contracts Regulations for any subscription.' },
    ],
    faqs: [
      { q: 'Is it safe to connect my bank?', a: 'Yes. We use Open Banking via TrueLayer, which is regulated by the FCA. We only have read-only access to your transactions. We never see your bank login details.' },
      { q: 'How many subscriptions will it find?', a: 'The average user discovers 3-5 subscriptions they had forgotten about. Some find over 10.' },
      { q: 'Can it cancel subscriptions for me?', a: 'We generate a formal cancellation email citing UK Consumer Contracts Regulations that you send to the provider. Automated cancellation is coming soon.' },
    ],
    socialProof: 'UK consumers waste over £25 billion per year on unused subscriptions',
    featureHighlight: 'We also scan your email inbox to find subscription receipts going back 2 years',
  },
  'cancel-services': {
    slug: 'cancel-services',
    title: 'Cancel Any Subscription UK - AI Cancellation Letter Generator',
    description: 'Generate a formal cancellation email citing UK Consumer Contracts Regulations in seconds. Cancel gym memberships, mobile contracts, broadband, insurance, and more.',
    h1: 'Cancel any subscription or contract without the hassle',
    subtitle: 'Providers make cancellation deliberately difficult. Paybacker generates a formal cancellation email citing the exact UK law that applies, so they cannot ignore you.',
    keywords: ['cancel subscription UK', 'cancel gym membership', 'cancellation letter template', 'how to cancel contract', 'cancel direct debit'],
    icon: CreditCard,
    iconColor: 'text-green-400',
    heroStat: '90 sec',
    heroStatLabel: 'to generate your cancellation email',
    ctaText: 'Generate Your Cancellation Email Free',
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
    description: 'Claim up to £520 compensation for delayed or cancelled flights under UK261 and EU261 regulations. Free AI-generated claim letter. Works for flights in the last 6 years.',
    h1: 'Claim up to £520 for your delayed or cancelled flight',
    subtitle: 'Under UK261 regulations, you are entitled to compensation of £220-£520 for flights delayed over 3 hours, cancelled, or overbooked. Most claims are never made. Ours take 30 seconds.',
    keywords: ['flight delay compensation UK', 'claim flight delay', 'UK261 compensation', 'flight cancelled compensation', 'delayed flight refund'],
    icon: Plane,
    iconColor: 'text-sky-400',
    heroStat: '£520',
    heroStatLabel: 'maximum compensation per passenger',
    ctaText: 'Start Your Flight Claim Free',
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
    description: 'Connect your bank account and see your complete financial picture. Income, spending by category, budget tracking, net worth, and AI-powered insights. Your personal finance dashboard.',
    h1: 'See exactly where your money goes every month',
    subtitle: 'Connect your bank account and Paybacker categorises every transaction, tracks your income vs spending, sets budgets, and gives you a financial health score. All automated, all in one dashboard.',
    keywords: ['money management app UK', 'spending tracker', 'budget planner app', 'personal finance dashboard', 'track spending categories'],
    icon: BarChart3,
    iconColor: 'text-emerald-400',
    heroStat: '20+',
    heroStatLabel: 'spending categories, auto-categorised',
    ctaText: 'Connect Your Bank Free',
    ctaLink: '/auth/signup',
    benefits: [
      'Income vs outgoings with monthly trends',
      '20+ spending categories with AI self-learning categorisation',
      'Set budgets per category with progress tracking',
      'Net worth tracker (assets minus liabilities)',
      'Financial health score updated with every sync',
    ],
    howItWorks: [
      { step: '1', title: 'Connect your bank', description: 'Secure Open Banking connection via TrueLayer. FCA regulated. Read-only access.' },
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
    description: 'Connect Gmail or Outlook and scan 2 years of emails for overcharges, forgotten subscriptions, flight delay compensation, debt disputes, and price increase notifications.',
    h1: 'Scan your email inbox and find money you are owed',
    subtitle: 'Your email inbox contains proof of overcharges, price increase notifications, flight booking confirmations, and subscription receipts. Paybacker scans 2 years of emails and shows you exactly what you can claim.',
    keywords: ['email scanner money', 'find overcharges email', 'scan inbox subscriptions', 'email receipt scanner', 'find money owed UK'],
    icon: Mail,
    iconColor: 'text-rose-400',
    heroStat: '2 years',
    heroStatLabel: 'of email history scanned',
    ctaText: 'Join the Waitlist - Coming Soon',
    ctaLink: '/auth/signup',
    benefits: [
      'Coming soon - currently being verified by Google for highest security standards',
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
    description: 'Get email alerts at 30, 14, and 7 days before your contracts renew. Energy, broadband, mobile, insurance, mortgages, and more. Stop overpaying on auto-renewals.',
    h1: 'Stop overpaying when your contracts auto-renew',
    subtitle: 'Every year, UK consumers lose billions to auto-renewal price hikes. Paybacker tracks your contract end dates and alerts you at 30, 14, and 7 days before renewal - so you can switch to a better deal.',
    keywords: ['contract renewal alerts', 'stop auto renewal', 'contract end date tracker', 'renewal reminder app', 'avoid price hikes UK'],
    icon: Bell,
    iconColor: 'text-orange-400',
    heroStat: '30/14/7',
    heroStatLabel: 'day alerts before every renewal',
    ctaText: 'Track Your Contracts Free',
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

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = PAGES[params.slug];
  if (!page) return { title: 'Paybacker' };

  const url = `https://paybacker.co.uk/solutions/${params.slug}`;
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

export default function SolutionPage({ params }: { params: { slug: string } }) {
  const page = PAGES[params.slug];
  if (!page) notFound();

  const Icon = page.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />

      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
              <span className="text-xl font-bold text-white">Pay<span className="text-amber-500">backer</span></span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/pricing" className="hidden md:block text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">Pricing</Link>
              <Link href="/auth/login" className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">Sign In</Link>
              <Link href="/auth/signup" className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all">Get Started Free</Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          {/* Hero */}
          <div className="max-w-4xl mx-auto mb-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400 border border-amber-500/20 mb-8">
              <Icon className={`h-4 w-4 ${page.iconColor}`} />
              <span>Free to use - no credit card required</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">{page.h1}</h1>
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">{page.subtitle}</p>

            <div className="flex justify-center mb-8">
              <div className="bg-slate-900/50 border border-amber-500/20 rounded-xl px-8 py-4 text-center">
                <p className={`text-4xl font-bold ${page.iconColor}`}>{page.heroStat}</p>
                <p className="text-slate-500 text-sm">{page.heroStatLabel}</p>
              </div>
            </div>

            <Link href={page.ctaLink} className="inline-block bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-lg">
              {page.ctaText}
            </Link>

            <p className="text-slate-500 text-sm mt-4">{page.socialProof}</p>
          </div>

          {/* Benefits */}
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">What you get</h2>
            <div className="space-y-3">
              {page.benefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3 bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">How it works</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {page.howItWorks.map((step) => (
                <div key={step.step} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                  <div className="bg-amber-500 text-slate-950 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">{step.step}</div>
                  <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-sm">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Highlight */}
          <div className="max-w-3xl mx-auto mb-16">
            <div className="bg-gradient-to-r from-amber-500/10 to-purple-500/5 border border-amber-500/20 rounded-2xl p-8 text-center">
              <Icon className={`h-8 w-8 ${page.iconColor} mx-auto mb-4`} />
              <p className="text-slate-300 text-lg">{page.featureHighlight}</p>
              <Link href={page.ctaLink} className="inline-flex items-center gap-2 text-amber-400 font-semibold mt-4 hover:text-amber-300 transition-all">
                Get started free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* FAQs */}
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Frequently asked questions</h2>
            <div className="space-y-4">
              {page.faqs.map((faq, i) => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                  <h3 className="text-white font-semibold mb-2">{faq.q}</h3>
                  <p className="text-slate-400 text-sm">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="max-w-3xl mx-auto mb-16 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to take control?</h2>
            <p className="text-slate-400 mb-8">Join thousands of UK consumers who are using Paybacker to save money and fight unfair charges.</p>
            <Link href={page.ctaLink} className="inline-block bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-lg">
              {page.ctaText}
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-800 py-8">
          <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-slate-500 text-sm">Paybacker LTD - paybacker.co.uk</div>
            <div className="flex gap-4 text-slate-500 text-sm">
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-all">About</Link>
              <Link href="/legal/privacy" className="hover:text-white transition-all">Privacy</Link>
              <Link href="/legal/terms" className="hover:text-white transition-all">Terms</Link>
            </div>
          </div>
        </footer>

        {/* FAQ JSON-LD */}
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
    </div>
  );
}
