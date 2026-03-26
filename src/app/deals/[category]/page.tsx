import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CheckCircle, ArrowRight, Shield, Clock, Zap, TrendingDown, BarChart3 } from 'lucide-react';

interface Deal {
  id: string;
  provider: string;
  headline: string;
  saving: string;
  awinMid: string;
  providerUrl: string;
  promoCode?: string;
  awinUrl?: string;
}

const AWIN_AFF_ID = process.env.NEXT_PUBLIC_AWIN_AFF_ID || '';

const CATEGORIES: Record<string, {
  title: string;
  h1: string;
  description: string;
  longDescription: string;
  keywords: string[];
  avgSaving: string;
  switchTime: string;
  tipTitle: string;
  tipBody: string;
  warningText?: string;
  deals: Deal[];
}> = {
  energy: {
    title: 'Best Energy Deals UK 2026 - Compare and Switch',
    h1: 'Compare the best energy deals in the UK',
    description: 'Compare energy tariffs from top UK suppliers. Switch gas and electricity providers in minutes and save up to £200/year. Paybacker analyses your real bills to find you the cheapest deal.',
    longDescription: 'Energy bills are one of the biggest household expenses in the UK. Most people stay on their provider\'s standard variable tariff, paying hundreds more than they need to. Paybacker connects to your bank account to see exactly what you\'re paying, then shows you cheaper alternatives from trusted suppliers.',
    keywords: ['energy deals UK', 'switch energy provider', 'cheap gas and electricity', 'compare energy tariffs', 'best energy deals 2026'],
    avgSaving: '£200',
    switchTime: '17 days',
    tipTitle: 'When to switch energy',
    tipBody: 'The best time to switch is 30 days before your fixed tariff ends. If you are on a standard variable tariff, you can switch any time with no exit fees. Paybacker alerts you automatically.',
    deals: [
      { id: 'eon-next', provider: 'E.ON Next', headline: 'Next Drive tariff for EV owners', saving: 'Save up to £120/yr', awinMid: '54765', providerUrl: 'https://www.eonenergy.com' },
      { id: 'edf-energy', provider: 'EDF', headline: 'Fixed price tariffs - price certainty', saving: 'Save up to £140/yr', awinMid: '1887', providerUrl: 'https://www.edfenergy.com' },
      { id: 'ovo-energy', provider: 'OVO Energy', headline: 'Fixed rate - lock in your price', saving: 'Save up to £150/yr', awinMid: '5318', providerUrl: 'https://www.ovoenergy.com' },
      { id: 'msm-energy', provider: 'MoneySuperMarket', headline: 'Compare all energy suppliers in one search', saving: 'Save up to £200/yr', awinMid: '22713', providerUrl: 'https://www.moneysupermarket.com/gas-and-electricity/' },
    ],
  },
  broadband: {
    title: 'Best Broadband Deals UK 2026 - Compare and Switch',
    h1: 'Compare the best broadband deals in the UK',
    description: 'Compare broadband packages from BT, Sky, Virgin Media, EE and more. Find the fastest, cheapest broadband for your area. Paybacker shows you deals based on what you actually pay.',
    longDescription: 'The average UK household overpays by £120/year on broadband by staying with the same provider after their contract ends. Your provider puts you on an out-of-contract rate that is often 30-50% more expensive. Paybacker detects when your broadband contract is ending and shows you the best deals available.',
    keywords: ['broadband deals UK', 'compare broadband', 'cheap broadband', 'best broadband deals 2026', 'switch broadband provider'],
    avgSaving: '£180',
    switchTime: '14 days',
    tipTitle: 'When to switch broadband',
    tipBody: 'Start looking 30 days before your contract ends. You can switch penalty-free once your minimum term is up. Most new customer deals save 30-50% compared to out-of-contract rates.',
    deals: [
      { id: 'bt-broadband', provider: 'BT', headline: 'Full Fibre 500 - superfast speeds', saving: 'Save up to £240/yr', awinMid: '3041', providerUrl: 'https://www.bt.com/broadband' },
      { id: 'sky-broadband', provider: 'Sky', headline: 'Ultrafast broadband + streaming', saving: 'Save up to £180/yr', awinMid: '11005', providerUrl: 'https://www.sky.com/shop/broadband' },
      { id: 'virgin-media', provider: 'Virgin Media', headline: 'Gig1 - fastest widely available', saving: 'Save up to £200/yr', awinMid: '6399', providerUrl: 'https://www.virginmedia.com' },
      { id: 'ee-broadband', provider: 'EE', headline: 'Full Fibre with smart hub', saving: 'Save up to £180/yr', awinMid: '3516', providerUrl: 'https://shop.ee.co.uk/broadband' },
      { id: 'plusnet', provider: 'Plusnet', headline: 'Award-winning broadband', saving: 'Save up to £160/yr', awinMid: '2973', providerUrl: 'https://www.plus.net' },
      { id: 'talktalk', provider: 'TalkTalk', headline: 'Affordable fibre broadband', saving: 'Save up to £140/yr', awinMid: '3674', providerUrl: 'https://www.talktalk.co.uk' },
      { id: 'hyperoptic', provider: 'Hyperoptic', headline: '1Gbps full fibre', saving: 'Save up to £200/yr', awinMid: '5737', providerUrl: 'https://www.hyperoptic.com' },
      { id: 'community-fibre', provider: 'Community Fibre', headline: 'London full fibre', saving: 'Save up to £180/yr', awinMid: '19595', providerUrl: 'https://communityfibre.co.uk' },
      { id: 'broadband-genie', provider: 'Broadband Genie', headline: 'Independent comparison', saving: 'Find cheapest deals', awinMid: '12213', providerUrl: 'https://www.broadbandgenie.co.uk' },
      { id: 'msm-broadband', provider: 'MoneySuperMarket', headline: 'Compare all providers', saving: 'Compare deals', awinMid: '25756', providerUrl: 'https://www.moneysupermarket.com/broadband/' },
    ],
  },
  mobile: {
    title: 'Best Mobile Phone Deals UK 2026 - SIM Only and Contracts',
    h1: 'Compare the best mobile deals in the UK',
    description: 'Compare SIM-only and contract deals from every UK network. EE, O2, Vodafone, Three, giffgaff, SMARTY and more. Paybacker finds you cheaper plans based on your actual usage.',
    longDescription: 'Most people overpay on their mobile phone contract because they stay with the same network after their minimum term ends. You keep paying the same amount even though the handset is paid off. A SIM-only deal on the same network can save you £15-30/month. Paybacker spots this in your bank transactions and recommends the switch.',
    keywords: ['mobile phone deals UK', 'SIM only deals', 'cheap mobile contracts', 'compare mobile phones', 'best SIM deals 2026'],
    avgSaving: '£200',
    switchTime: '1 day',
    tipTitle: 'SIM-only saves the most',
    tipBody: 'If your contract has ended and you own your handset, switching to SIM-only can save £180-360/year. Text PAC to 65075 to keep your number when you switch.',
    deals: [
      { id: 'id-mobile', provider: 'iD Mobile', headline: 'SIM-only from £6/mo', saving: 'Save up to £240/yr', awinMid: '6366', providerUrl: 'https://www.idmobile.co.uk' },
      { id: 'smarty', provider: 'SMARTY', headline: 'Unused data rolled over', saving: 'Save up to £200/yr', awinMid: '10933', providerUrl: 'https://smarty.co.uk' },
      { id: 'giffgaff', provider: 'giffgaff', headline: 'Flexible - no contract', saving: 'Save up to £200/yr', awinMid: '3599', providerUrl: 'https://www.giffgaff.com' },
      { id: 'voxi', provider: 'VOXI', headline: 'Endless social media data', saving: 'Save up to £160/yr', awinMid: '10951', providerUrl: 'https://www.voxi.co.uk' },
      { id: 'ee-mobile', provider: 'EE', headline: 'UK largest 5G network', saving: 'Save up to £200/yr', awinMid: '31423', providerUrl: 'https://shop.ee.co.uk/sim-only' },
      { id: 'vodafone', provider: 'Vodafone', headline: '5G at no extra cost', saving: 'Save up to £220/yr', awinMid: '1257', providerUrl: 'https://www.vodafone.co.uk' },
      { id: 'three-mobile', provider: 'Three', headline: '5G on all plans', saving: 'Save up to £200/yr', awinMid: '10210', providerUrl: 'https://www.three.co.uk' },
      { id: 'o2-mobile', provider: 'O2', headline: 'Priority rewards', saving: 'Save up to £200/yr', awinMid: '3235', providerUrl: 'https://www.o2.co.uk' },
      { id: 'tesco-mobile', provider: 'Tesco Mobile', headline: 'Clubcard prices', saving: 'Save up to £180/yr', awinMid: '101917', providerUrl: 'https://www.tescomobile.com' },
      { id: 'lebara5', provider: 'Lebara', headline: 'Use code LEBARA5 for £5 off', saving: 'Save £5 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', promoCode: 'LEBARA5', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html' },
      { id: 'lebara10', provider: 'Lebara', headline: 'Use code LEBARA10 for £10 off', saving: 'Save £10 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', promoCode: 'LEBARA10', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html' },
      { id: 'lebara-save50', provider: 'Lebara', headline: 'Use code SAVE50 for 50% off', saving: 'Save 50% off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', promoCode: 'SAVE50', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html' },
    ],
  },
  insurance: {
    title: 'Best Insurance Deals UK 2026 - Compare Car, Home and Breakdown',
    h1: 'Compare insurance deals and save hundreds',
    description: 'Compare car insurance, home insurance, and breakdown cover from top UK comparison sites. GoCompare, MoneySuperMarket, RAC and AA. Save up to £300/year by switching.',
    longDescription: 'Insurance auto-renewals are one of the biggest rip-offs in the UK. Your provider increases your premium every year, counting on you not shopping around. Paybacker detects your insurance payments in your bank transactions and alerts you before renewal so you can compare and switch.',
    keywords: ['compare insurance UK', 'cheap car insurance', 'home insurance deals', 'breakdown cover comparison', 'insurance comparison 2026'],
    avgSaving: '£300',
    switchTime: 'Instant quote',
    tipTitle: 'Never auto-renew insurance',
    tipBody: 'Auto-renewal typically costs 10-30% more than switching. Start comparing 3-4 weeks before your renewal date. Paybacker tracks this for you automatically.',
    deals: [
      { id: 'compare-the-market', provider: 'Compare the Market', headline: 'Compare 100+ insurers', saving: 'Save up to £300/yr', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com' },
      { id: 'moneysupermarket', provider: 'MoneySuperMarket', headline: 'Car, home and life insurance', saving: 'Save up to £250/yr', awinMid: '12049', providerUrl: 'https://www.moneysupermarket.com/car-insurance/' },
      { id: 'gocompare-car', provider: 'GoCompare Car', headline: 'Compare car insurance quotes', saving: 'Save up to £280/yr', awinMid: '117439', providerUrl: 'https://www.gocompare.com/car-insurance/' },
      { id: 'gocompare-home', provider: 'GoCompare Home', headline: 'Compare home insurance', saving: 'Save up to £200/yr', awinMid: '117441', providerUrl: 'https://www.gocompare.com/home-insurance/' },
      { id: 'rac-breakdown', provider: 'RAC', headline: 'Breakdown cover from £6.50/mo', saving: 'Peace of mind', awinMid: '3790', providerUrl: 'https://www.rac.co.uk/breakdown-cover' },
      { id: 'aa-breakdown', provider: 'The AA', headline: 'UK breakdown cover', saving: 'Cover from £4/mo', awinMid: '3932', providerUrl: 'https://www.theaa.com/breakdown-cover' },
    ],
  },
  mortgages: {
    title: 'Best Mortgage Deals UK 2026 - Compare Rates and Save',
    h1: 'Compare mortgage deals and save thousands',
    description: 'Compare mortgage rates from 90+ lenders with free online brokers. Habito, MoneySuperMarket, London & Country and more. Find the best remortgage and first-time buyer deals.',
    longDescription: 'Your mortgage is your biggest monthly expense. When your fixed rate ends, your lender moves you to the standard variable rate (SVR) which is typically 2-3% higher. That can mean hundreds more per month. Paybacker detects mortgage payments in your bank transactions and alerts you before your fixed rate expires.',
    keywords: ['mortgage deals UK', 'compare mortgage rates', 'best remortgage deals', 'first time buyer mortgage', 'mortgage comparison 2026'],
    avgSaving: '£3,000',
    switchTime: '4-8 weeks',
    tipTitle: 'Start 6 months early',
    tipBody: 'You can lock in a new mortgage rate up to 6 months before your current deal ends. This protects you if rates rise. Most brokers on this page are fee-free.',
    warningText: 'Your home may be repossessed if you do not keep up repayments on your mortgage.',
    deals: [
      { id: 'habito', provider: 'Habito', headline: 'Free online broker - 90+ lenders', saving: 'Save up to £3,000/yr', awinMid: '15441', providerUrl: 'https://www.habito.com' },
      { id: 'moneysupermarket-mortgages', provider: 'MoneySuperMarket', headline: 'Compare 50+ lenders', saving: 'Compare rates', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/mortgages/' },
      { id: 'l-and-c', provider: 'London & Country', headline: 'UK largest fee-free broker', saving: 'Fee-free advice', awinMid: '7498', providerUrl: 'https://www.landc.co.uk' },
      { id: 'maze-mortgages', provider: 'Maze Mortgages', headline: 'Cashback on your mortgage', saving: 'Up to £3,700 cashback', awinMid: '80859', providerUrl: 'https://www.mazemortgages.co.uk' },
    ],
  },
  loans: {
    title: 'Best Loan Deals UK 2026 - Compare Personal and Secured Loans',
    h1: 'Compare loan deals and reduce your interest rate',
    description: 'Compare personal loans, secured loans, and debt consolidation from trusted UK lenders. AA Loans, MoneySuperMarket, Freedom Finance and more. Lower your monthly payments.',
    longDescription: 'If you have existing loans or credit card debt, you may be paying more interest than you need to. Consolidating multiple debts into a single lower-rate loan can save hundreds per year. Paybacker analyses your bank transactions to identify expensive borrowing and suggests better alternatives.',
    keywords: ['loan deals UK', 'compare personal loans', 'debt consolidation', 'best loan rates 2026', 'cheap loans UK'],
    avgSaving: '£500',
    switchTime: '1-7 days',
    tipTitle: 'Check your eligibility first',
    tipBody: 'Use eligibility checkers (soft search) before applying. This shows which loans you are likely to be accepted for without affecting your credit score.',
    warningText: 'Think carefully before securing other debts against your home. If you are thinking of consolidating existing borrowing, you may be extending the terms of the debt and increasing the total amount you repay.',
    deals: [
      { id: 'freedom-finance', provider: 'Freedom Finance', headline: 'Compare 30+ lenders from 3.3% APR', saving: 'Lower your rate', awinMid: '14780', providerUrl: 'https://www.freedomfinance.co.uk/loans' },
      { id: 'aa-loans', provider: 'AA Loans', headline: 'Personal loans from 7.9% APR', saving: '£50 on completion', awinMid: '3953', providerUrl: 'https://www.theaa.com/loans' },
      { id: 'moneysupermarket-loans', provider: 'MoneySuperMarket', headline: 'Compare and consolidate', saving: 'Compare APRs', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/loans/' },
      { id: 'comparethemarket-loans', provider: 'Compare the Market', headline: 'Multiple lenders', saving: 'Reduce payments', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/loans/' },
      { id: 'loan-co-uk', provider: 'Loan.co.uk', headline: 'Secured loans - consolidate', saving: 'Up to £300 cashback', awinMid: '18915', providerUrl: 'https://www.loan.co.uk' },
    ],
  },
  'credit-cards': {
    title: 'Best Credit Card Deals UK 2026 - Compare 0% and Cashback Cards',
    h1: 'Compare credit cards and save on interest',
    description: 'Compare 0% balance transfer, cashback, and rewards credit cards. MoneySavingExpert, TotallyMoney, Compare the Market. Find the best card for your credit score.',
    longDescription: 'If you are carrying credit card debt, switching to a 0% balance transfer card can save you hundreds in interest. Even if your credit score is not perfect, eligibility checkers can show which cards you are likely to be accepted for without affecting your score.',
    keywords: ['credit card deals UK', '0% balance transfer', 'best credit cards 2026', 'cashback credit cards', 'compare credit cards'],
    avgSaving: '£300',
    switchTime: '5-10 days',
    tipTitle: 'Use eligibility checkers',
    tipBody: 'Eligibility checkers use a soft search to show which cards you qualify for without marking your credit file. Apply for the one with the highest acceptance chance.',
    deals: [
      { id: 'mse-credit-cards', provider: 'MoneySavingExpert', headline: 'Eligibility checker', saving: '0% balance transfer', awinMid: '12498', providerUrl: 'https://www.moneysavingexpert.com/credit-cards/' },
      { id: 'comparethemarket-cc', provider: 'Compare the Market', headline: 'Balance transfer, cashback, rewards', saving: 'Save on interest', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/credit-cards/' },
      { id: 'totallymoney', provider: 'TotallyMoney', headline: 'Free credit score + card match', saving: 'Best match cards', awinMid: '10983', providerUrl: 'https://www.totallymoney.com/credit-cards/' },
      { id: 'msm-money', provider: 'MoneySuperMarket', headline: 'Compare credit cards', saving: 'Find best rates', awinMid: '61791', providerUrl: 'https://www.moneysupermarket.com/credit-cards/' },
    ],
  },
  'car-finance': {
    title: 'Best Car Finance Deals UK 2026 - Compare PCP, HP and Loans',
    h1: 'Compare car finance deals and save',
    description: 'Compare car finance deals from Carwow, Zuto and more. PCP, HP, and personal loan options. Find the best rate for your car purchase.',
    longDescription: 'Car finance can be expensive if you do not shop around. Dealer finance is rarely the cheapest option. Comparing car finance independently before visiting the dealership can save you thousands over the term of your agreement.',
    keywords: ['car finance deals UK', 'compare car finance', 'cheap car finance', 'PCP deals 2026', 'car loan comparison'],
    avgSaving: '£1,000',
    switchTime: 'Pre-approval in minutes',
    tipTitle: 'Get pre-approved first',
    tipBody: 'Getting pre-approved for car finance before visiting a dealership gives you negotiating power. You know exactly what rate you qualify for and can compare it to the dealer offer.',
    deals: [
      { id: 'carwow-finance', provider: 'Carwow', headline: 'Compare PCP, HP and loans', saving: 'Save on finance', awinMid: '18621', providerUrl: 'https://www.carwow.co.uk/car-finance' },
      { id: 'zuto', provider: 'Zuto', headline: 'All credit scores welcome', saving: 'Rates from 6.9% APR', awinMid: '16944', providerUrl: 'https://www.zuto.com' },
    ],
  },
  travel: {
    title: 'Best Travel Deals UK 2026 - Cheap Flights, Hotels and Holidays',
    h1: 'Compare travel deals and save on your next trip',
    description: 'Compare flights, hotels, package holidays and travel insurance. Trip.com, TravelSupermarket, Jet2 and more. Find the best deals for your budget.',
    longDescription: 'Whether you are booking flights, hotels, or a package holiday, comparing prices across multiple providers can save you hundreds. Paybacker analyses your travel spending from bank transactions to help you budget for trips and find the best deals.',
    keywords: ['cheap flights UK', 'travel deals 2026', 'compare holidays', 'cheap hotels', 'travel insurance comparison'],
    avgSaving: '£400',
    switchTime: 'Book instantly',
    tipTitle: 'Book at the right time',
    tipBody: 'For flights, booking 6-8 weeks in advance typically gets the best prices. For hotels, check multiple comparison sites as prices vary significantly. Travel insurance is cheapest when bought independently, not from the airline.',
    deals: [
      { id: 'trip-com', provider: 'Trip.com', headline: 'Flights, hotels and holidays', saving: 'Save on travel', awinMid: '22405', providerUrl: 'https://uk.trip.com' },
      { id: 'travelsupermarket', provider: 'TravelSupermarket', headline: 'Insurance, car hire, holidays', saving: '17% on insurance', awinMid: '8734', providerUrl: 'https://www.travelsupermarket.com' },
      { id: 'jet2', provider: 'Jet2.com', headline: 'Flights from UK airports', saving: 'Save on flights', awinMid: '18729', providerUrl: 'https://www.jet2.com' },
      { id: 'jet2holidays', provider: 'Jet2holidays', headline: 'ATOL-protected packages', saving: 'Save on holidays', awinMid: '18730', providerUrl: 'https://www.jet2holidays.com' },
      { id: 'gotogate', provider: 'Gotogate', headline: '700+ airlines worldwide', saving: 'Find cheapest flights', awinMid: '112834', providerUrl: 'https://www.gotogate.co.uk' },
      { id: 'mytrip', provider: 'Mytrip', headline: 'Cheap flights worldwide', saving: 'Compare airlines', awinMid: '112832', providerUrl: 'https://www.mytrip.com' },
    ],
  },
};

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  if (!AWIN_AFF_ID) return providerUrl;
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

export function generateStaticParams() {
  return Object.keys(CATEGORIES).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) return { title: 'Deals - Paybacker' };

  const url = `https://paybacker.co.uk/deals/${category}`;
  return {
    title: cat.title,
    description: cat.description,
    keywords: cat.keywords,
    openGraph: {
      title: cat.title,
      description: cat.description,
      url,
      siteName: 'Paybacker',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: cat.title,
      description: cat.description,
      images: ['/logo.png'],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function CategoryDealsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) notFound();

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-mint-900/20 via-transparent to-transparent" />

      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
              <span className="text-xl font-bold text-white">Pay<span className="text-mint-400">backer</span></span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/auth/login" className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-navy-900 transition-all">Sign In</Link>
              <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-sm font-semibold px-4 py-2 rounded-xl transition-all">Get Started Free</Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/" className="hover:text-white transition-all">Home</Link>
              <span>/</span>
              <Link href="/dashboard/deals" className="hover:text-white transition-all">Deals</Link>
              <span>/</span>
              <span className="text-slate-300 capitalize">{category.replace('-', ' ')}</span>
            </div>
          </div>

          {/* Hero */}
          <div className="max-w-4xl mx-auto mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">{cat.h1}</h1>
            <p className="text-xl text-slate-300 mb-8 leading-relaxed">{cat.longDescription}</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-navy-900 border border-green-500/20 rounded-2xl p-4 text-center">
                <TrendingDown className="h-6 w-6 text-green-400 mx-auto mb-2" />
                <p className="text-green-400 font-bold text-xl">{cat.avgSaving}</p>
                <p className="text-slate-500 text-xs">Average yearly saving</p>
              </div>
              <div className="bg-navy-900 border border-mint-400/20 rounded-2xl p-4 text-center">
                <Clock className="h-6 w-6 text-mint-400 mx-auto mb-2" />
                <p className="text-mint-400 font-bold text-xl">{cat.switchTime}</p>
                <p className="text-slate-500 text-xs">Typical switch time</p>
              </div>
              <div className="bg-navy-900 border border-blue-500/20 rounded-2xl p-4 text-center">
                <Zap className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                <p className="text-blue-400 font-bold text-xl">{cat.deals.length}</p>
                <p className="text-slate-500 text-xs">Deals to compare</p>
              </div>
            </div>
          </div>

          {/* Deals */}
          <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">Top {category.replace('-', ' ')} deals</h2>
            <div className="space-y-4">
              {cat.deals.map((deal) => (
                <div key={deal.id} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 hover:border-mint-400/30 transition-all flex items-center justify-between gap-6">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-lg">{deal.provider}</h3>
                    <p className="text-slate-400 text-sm mt-1">{deal.headline}</p>
                    {deal.promoCode && (
                      <p className="text-xs text-green-400 mt-2">Promo code: <span className="font-mono font-bold bg-green-500/10 px-2 py-0.5 rounded">{deal.promoCode}</span> - apply at checkout</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-mint-400 font-bold text-sm mb-2">{deal.saving}</p>
                    <a
                      href={deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-xl text-sm transition-all"
                    >
                      View Deal <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning (for mortgages/loans) */}
          {cat.warningText && (
            <div className="max-w-4xl mx-auto mb-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-sm">
                <strong>Important:</strong> {cat.warningText}
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-mint-400/5 border border-mint-400/20 rounded-2xl p-6">
              <h3 className="text-mint-400 font-semibold mb-2">{cat.tipTitle}</h3>
              <p className="text-slate-300 text-sm">{cat.tipBody}</p>
            </div>
          </div>

          {/* Paybacker CTA */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-mint-400/10 border border-mint-400/20 rounded-2xl p-8 text-center">
              <BarChart3 className="h-10 w-10 text-mint-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-3 font-[family-name:var(--font-heading)]">Get personalised {category.replace('-', ' ')} recommendations</h2>
              <p className="text-slate-300 mb-6 max-w-xl mx-auto">Connect your bank account and Paybacker will analyse your actual bills, alert you before contracts renew, and show you the best deals based on what you really pay.</p>
              <div className="flex flex-wrap justify-center gap-4 mb-6">
                <span className="flex items-center gap-1.5 text-sm text-slate-400"><CheckCircle className="h-4 w-4 text-green-400" /> Free to start</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-400"><CheckCircle className="h-4 w-4 text-green-400" /> Bank-level security</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-400"><CheckCircle className="h-4 w-4 text-green-400" /> Renewal alerts at 30, 14, 7 days</span>
              </div>
              <Link href="/auth/signup" className="inline-block bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all text-lg">
                Create Free Account
              </Link>
            </div>
          </div>

          {/* Affiliate Disclosure */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <p className="text-slate-500 text-xs"><strong className="text-slate-400">Affiliate disclosure:</strong> Some links on this page are affiliate links. If you switch through one of these links, we may receive a commission from the provider at no extra cost to you. This helps us keep Paybacker free for basic use. We only recommend providers we believe offer genuine value.</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-navy-700/50 py-8">
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
      </div>
    </div>
  );
}
