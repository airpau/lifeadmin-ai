import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'Flight Delay Compensation UK — Claim Up to £520 Per Passenger',
  subtitle: 'If your flight was delayed over 3 hours, cancelled, or overbooked, you may be entitled to £220 to £520 per passenger under UK261 regulations. Most eligible passengers never claim. Generate your free claim letter in 30 seconds.',
  badge: 'Free to use — claim flights up to 6 years ago',
  heroStat: '£520',
  heroStatLabel: 'maximum compensation per passenger under UK261',
  heroStatColor: 'text-sky-400',
  ctaPrimary: 'Generate Your Free Flight Claim Letter Now',
  socialProof: 'Over £600 million in flight delay compensation goes unclaimed by UK passengers every year.',
  legislationTitle: 'UK261 regulations — your right to flight compensation',
  legislationParagraphs: [
    "Following Brexit, UK Regulation 261/2004 (known as UK261) came into force, giving passengers on flights departing UK airports the same compensation rights previously provided by EU261/2004. UK261 applies to all flights departing from UK airports regardless of airline nationality, and to flights arriving in the UK operated by UK or EU-based carriers. You are entitled to compensation of £220, £350, or £520 per passenger depending on flight distance when your flight arrives more than 3 hours late.",
    'Crucially, the extraordinary circumstances exemption is narrower than airlines claim. Technical faults, crew shortages, and scheduling delays are not extraordinary circumstances — they are within the airline\'s control and responsibility. UK and European courts have consistently ruled on this. Only genuine events outside the airline\'s control, such as severe weather, air traffic control strikes, or airport security emergencies, can exempt an airline from paying compensation.',
    'You also have a right to care during long delays regardless of the cause: free food and refreshments after 2 hours (short haul) or 3 hours (long haul), hotel accommodation if an overnight stay becomes necessary, and two free communications (calls, emails). In England and Wales, the Limitation Act 1980 gives you 6 years to claim for delayed flights, meaning eligible disruptions from as far back as 2019 may still be claimable.',
  ],
  rightsTitle: 'Your rights under UK261 regulations',
  rights: [
    '£220 compensation for flights under 1,500km delayed by 3 or more hours on arrival',
    '£350 for flights between 1,500km and 3,500km delayed by 3 or more hours',
    '£520 for flights over 3,500km delayed by 4 or more hours',
    'Right to free meals and refreshments during long delays',
    'Right to hotel accommodation and transport if an overnight delay is required',
    'Full refund or alternative routing if your flight is cancelled',
    '£350 to £520 compensation for denied boarding due to overbooking',
    'Right to claim for eligible flights delayed in the last 6 years (England and Wales)',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Enter your flight details',
      description: 'Flight number, date, route, and what happened. We check whether UK261 applies and calculate how much you are owed.',
    },
    {
      step: '2',
      title: 'AI generates your claim',
      description: 'Formal compensation claim letter citing UK261 with the exact amount you are entitled to, addressed directly to the airline.',
    },
    {
      step: '3',
      title: 'Receive your compensation',
      description: 'Most airlines pay within 4 to 8 weeks. If they refuse or ignore your claim, escalate for free to CEDR.',
    },
  ],
  faqs: [
    {
      q: 'Does UK261 apply to all airlines flying from UK airports?',
      a: "Yes. UK261 applies to all flights departing from any UK airport regardless of the airline's nationality. It also covers flights arriving in the UK if the operating carrier is a UK or EU airline.",
    },
    {
      q: 'What if the airline claims extraordinary circumstances?',
      a: "Technical faults, crew shortages, and operational issues are not extraordinary circumstances under UK261. Only events genuinely outside the airline's control qualify, such as severe weather or air traffic control strikes. Our claim letter challenges this defence directly and references the relevant case law.",
    },
    {
      q: 'Can I claim for a flight from several years ago?',
      a: 'In England and Wales you can claim for flights delayed in the last 6 years under the Limitation Act 1980. In Scotland the limit is 5 years. Our letter includes the relevant limitation period for your jurisdiction.',
    },
    {
      q: 'What is CEDR and how does it help?',
      a: 'CEDR (Centre for Effective Dispute Resolution) is an approved Alternative Dispute Resolution body for aviation claims in the UK. If an airline refuses your claim or does not respond within 8 weeks, you can refer it to CEDR at no cost to you. CEDR decisions are binding on airlines that are members.',
    },
  ],
  finalCtaTitle: 'Ready to claim what you are owed?',
  finalCtaSubtitle: 'Generate a formal UK261 compensation claim in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'Flight Delay Compensation UK — Claim Up to £520 | Paybacker',
  description:
    'Claim up to £520 per passenger for delayed or cancelled flights under UK261 regulations. Generate a free AI claim letter in 30 seconds. Works for flights up to 6 years ago.',
  openGraph: {
    title: 'Flight Delay Compensation UK — Claim Up to £520',
    description:
      'Claim up to £520 per passenger for delayed or cancelled flights under UK261. Free claim letter generator. Works for flights up to 6 years ago.',
    url: 'https://paybacker.co.uk/flight-delay-compensation',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/flight-delay-compensation' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
