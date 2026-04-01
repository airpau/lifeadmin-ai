'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Wallet, ScanSearch, FileText, Shield, CreditCard,
  Tag, ChevronDown, ChevronUp, ArrowRight, Sparkles, BookOpen,
} from 'lucide-react';

interface Tutorial {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  colour: string;
  link: string;
  steps: string[];
}

const TUTORIALS: Tutorial[] = [
  {
    id: 'overview',
    title: 'Dashboard Overview',
    subtitle: 'Your financial command centre. See savings opportunities, track complaints, and monitor spending at a glance.',
    icon: LayoutDashboard,
    colour: 'text-blue-400',
    link: '/dashboard',
    steps: [
      'Your dashboard shows key stats: total subscriptions, monthly spend, complaints generated, and connected bank accounts.',
      'Action items highlight things that need your attention: overcharges, expiring contracts, or savings opportunities found by our scanner.',
      'The Money Recovery Score shows how much you could save based on our analysis of your bills.',
      'Better Deals shows cheaper alternatives for your current services.',
    ],
  },
  {
    id: 'money-hub',
    title: 'Money Hub',
    subtitle: 'Your complete financial picture. Income, spending, bank accounts, and your Financial Health Score.',
    icon: Wallet,
    colour: 'text-purple-400',
    link: '/dashboard/money-hub',
    steps: [
      'Connect your bank account to see all your transactions automatically.',
      'Your spending is broken down into 20+ categories so you can see where every pound goes.',
      'Set budgets for each category and get alerts when you are approaching the limit.',
      'The Regular Payments section shows every subscription, direct debit, and standing order in one place.',
      'Use the AI chatbot to ask questions like "How much did I spend on eating out?" and get instant charts.',
    ],
  },
  {
    id: 'payments',
    title: 'Regular Payments',
    subtitle: 'Every subscription, direct debit, and standing order in one place. Spot unused services and save money.',
    icon: CreditCard,
    colour: 'text-green-400',
    link: '/dashboard/money-hub/payments',
    steps: [
      'Your payments are split into 3 tabs: Subscriptions (streaming, software, gym), Direct Debits (energy, broadband, insurance), and Other.',
      'Each card shows the provider, amount, billing cycle, and annual cost.',
      'If a subscription has not been used in 30+ days, you will see an amber warning suggesting you cancel.',
      'Use the "Switch & Save" button on direct debits to find cheaper alternatives.',
      'The pie chart at the top shows your total monthly outgoings broken down by type.',
    ],
  },
  {
    id: 'ai-letters',
    title: 'Disputes',
    subtitle: 'Tell us your problem in plain English. Our AI writes a complaint letter citing exact UK law.',
    icon: FileText,
    colour: 'text-mint-400',
    link: '/dashboard/complaints',
    steps: [
      'Click "New dispute" and tell us what happened in your own words. No legal knowledge needed.',
      'Our AI writes a formal complaint letter citing the exact UK consumer law that protects you.',
      'Each dispute tracks the whole conversation: your letters, their responses, phone calls, notes.',
      'Upload their reply and we write an even stronger follow-up that references what they said.',
      'Upload your contract and we extract the key terms to use against them in your letter.',
      'Every letter comes with a confidence score and links to the laws we cited.',
    ],
  },
  {
    id: 'contracts',
    title: 'My Contracts',
    subtitle: 'Upload any contract and our AI reads the key terms, flags unfair clauses, and strengthens your complaints.',
    icon: Shield,
    colour: 'text-purple-400',
    link: '/dashboard/contracts',
    steps: [
      'Upload a PDF or photo of any contract you have signed.',
      'Our AI reads the entire document and extracts key terms: notice period, cancellation fee, minimum term, price increase clause.',
      'We flag any clauses that may be unfair under the Consumer Rights Act 2015.',
      'When you write a complaint letter, we automatically reference your contract terms to build a stronger argument.',
      'You will get alerts when contracts are expiring soon so you can negotiate or switch.',
    ],
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    subtitle: 'Track every subscription, see annual costs, and cancel with one click.',
    icon: CreditCard,
    colour: 'text-sky-400',
    link: '/dashboard/subscriptions',
    steps: [
      'Add subscriptions manually or connect your bank to auto-detect them.',
      'See the total monthly and annual cost of all your subscriptions.',
      'Click any subscription to see details, set renewal reminders, or generate a cancellation email.',
      'The cancellation email cites UK consumer law for maximum impact.',
      'Contract end dates are tracked with 30/14/7-day reminders so you never get locked in.',
    ],
  },
  {
    id: 'scanner',
    title: 'Scanner',
    subtitle: 'Connect your bank and email. We automatically detect subscriptions, overcharges, and savings opportunities.',
    icon: ScanSearch,
    colour: 'text-amber-400',
    link: '/dashboard/scanner',
    steps: [
      'Connect your bank account via Open Banking (read-only, secure, FCA regulated).',
      'We scan up to 6 months of transactions to detect recurring payments you might have forgotten about.',
      'Connect your Gmail or Outlook to scan your inbox for bills, contracts, and savings opportunities.',
      'The Opportunity Scanner finds overcharges, flight delay claims, and debt dispute opportunities.',
      'Smart action buttons let you: add to subscriptions, write a complaint letter, or dismiss the finding.',
    ],
  },
  {
    id: 'deals',
    title: 'Deals',
    subtitle: 'Find cheaper alternatives for your current services. We compare energy, broadband, mobile, and insurance.',
    icon: Tag,
    colour: 'text-red-400',
    link: '/dashboard/deals',
    steps: [
      'Browse deals by category: energy, broadband, mobile, streaming, insurance, and more.',
      'Each deal shows the monthly price, savings compared to average, and key features.',
      'Click through to the provider to switch directly.',
      'We regularly update deals so you always see the latest offers.',
    ],
  },
];

function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = tutorial.icon;

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl overflow-hidden hover:border-mint-400/20 transition-all">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5"
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0 ${tutorial.colour}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{tutorial.title}</h3>
              {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </div>
            <p className="text-slate-400 text-sm mt-1">{tutorial.subtitle}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-navy-700/50 pt-4">
          <ol className="space-y-3">
            {tutorial.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="bg-mint-400 text-navy-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-300">{step}</p>
              </li>
            ))}
          </ol>
          <Link
            href={tutorial.link}
            className="inline-flex items-center gap-2 mt-4 text-sm text-mint-400 hover:text-mint-300 font-medium transition-all"
          >
            Try it now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default function TutorialsPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white font-[family-name:var(--font-heading)]">How to Use Paybacker</h1>
        <p className="text-slate-400 mt-1">Step-by-step guides for every feature</p>
      </div>

      <div className="bg-mint-400/5 border border-mint-400/20 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-mint-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white font-medium text-sm">New here?</p>
            <p className="text-slate-400 text-sm mt-1">
              Start with <strong className="text-white">Disputes</strong> to write your first complaint letter in 30 seconds, or connect your bank in the <strong className="text-white">Scanner</strong> to find hidden savings.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {TUTORIALS.map(t => <TutorialCard key={t.id} tutorial={t} />)}
      </div>
    </div>
  );
}
