import { notFound } from 'next/navigation';
import Link from 'next/link';
import { COMPANIES, getCompanyBySlug } from '@/data/companies';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ company: string }>;
}

export async function generateStaticParams() {
  return COMPANIES.map((c) => ({ company: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company: slug } = await params;
  const company = getCompanyBySlug(slug);

  if (!company) {
    return { title: 'Company not found' };
  }

  return {
    title: `How to complain to ${company.name} — and get results | Paybacker`,
    description: `Know your rights when complaining to ${company.name}. Step-by-step guide including escalation to ${company.regulator}. Let Paybacker write your complaint letter for free.`,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  energy: 'energy supplier',
  water: 'water company',
  broadband: 'broadband provider',
  'broadband-tv': 'broadband and TV provider',
  mobile: 'mobile network',
  insurance: 'insurance provider',
  banking: 'bank',
  retail: 'retailer',
  streaming: 'streaming service',
  delivery: 'delivery company',
  gym: 'gym',
  airline: 'airline',
  transport: 'transport provider',
  bnpl: 'buy now pay later provider',
  payments: 'payment provider',
};

const REGULATOR_ESCALATION: Record<string, { name: string; url: string; description: string }> = {
  Ofgem: {
    name: 'the Energy Ombudsman',
    url: 'https://www.ombudsman-services.org/sectors/energy',
    description:
      'If your energy supplier has not resolved your complaint within 8 weeks, you can escalate to the Energy Ombudsman (appointed by Ofgem). Their decisions are binding on the supplier.',
  },
  Ofcom: {
    name: 'Ombudsman Services or CISAS',
    url: 'https://www.ombudsman-services.org/sectors/communications',
    description:
      'If your provider has not resolved your complaint within 8 weeks, you can escalate to an approved Alternative Dispute Resolution (ADR) scheme — either Ombudsman Services: Communications or CISAS.',
  },
  'Trading Standards': {
    name: 'Citizens Advice',
    url: 'https://www.citizensadvice.org.uk',
    description:
      'For retail and delivery complaints, contact Citizens Advice for guidance. You may also have rights under the Consumer Rights Act 2015 to seek a refund, repair, or replacement through the courts (small claims).',
  },
  FCA: {
    name: 'the Financial Ombudsman Service',
    url: 'https://www.financial-ombudsman.org.uk',
    description:
      'If your financial services provider has not resolved your complaint within 8 weeks, you can escalate to the Financial Ombudsman Service (FOS). Their decisions are binding on the firm. The service is free.',
  },
  Ofwat: {
    name: 'the Consumer Council for Water',
    url: 'https://www.ccwater.org.uk',
    description:
      'For water company complaints, contact the Consumer Council for Water (CCW). They can investigate and help resolve disputes with your water supplier.',
  },
  CAA: {
    name: 'the Civil Aviation Authority',
    url: 'https://www.caa.co.uk/passengers/resolving-travel-problems/',
    description:
      'For flight delays over 3 hours, you may be entitled to up to £520 compensation under UK261. If the airline refuses, you can escalate to an ADR scheme approved by the CAA, or to the small claims court.',
  },
  'Transport Focus': {
    name: 'Transport Focus',
    url: 'https://www.transportfocus.org.uk',
    description:
      'For rail and public transport complaints, contact Transport Focus. They advocate for passengers and can help escalate unresolved complaints.',
  },
  TfL: {
    name: 'Transport for London',
    url: 'https://tfl.gov.uk/forms/12381',
    description:
      'For complaints about TfL-regulated services including Uber, contact TfL directly through their complaints form.',
  },
};

export default async function CompanyPage({ params }: Props) {
  const { company: slug } = await params;
  const company = getCompanyBySlug(slug);

  if (!company) {
    notFound();
  }

  const categoryLabel = CATEGORY_LABELS[company.category] ?? 'service provider';
  const escalation = REGULATOR_ESCALATION[company.regulator] ?? REGULATOR_ESCALATION['Trading Standards'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Background effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-amber-400 text-sm hover:text-amber-300 transition-colors">
            ← Paybacker
          </Link>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          How to complain to {company.name} — and get results
        </h1>

        <p className="text-slate-400 text-lg mb-10">
          If you have a dispute with {company.name}, you have strong rights under UK consumer law.
          Here is exactly how to escalate your complaint and get the outcome you deserve.
        </p>

        {/* Section 1: Your rights */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-amber-400 mb-3">
            Your rights when complaining to {company.name}
          </h2>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-3 text-slate-300">
            <p>
              As a UK consumer, you are protected by the{' '}
              <strong className="text-white">Consumer Rights Act 2015</strong>, which requires that
              services are carried out with reasonable care and skill and that goods are of
              satisfactory quality. If {company.name} has charged you incorrectly, provided a poor
              service, or failed to deliver what was promised, you have the right to complain and
              seek a remedy.
            </p>
            <p>
              {company.name} is a regulated {categoryLabel}. Their regulator is{' '}
              <strong className="text-white">{company.regulator}</strong>, which means they must
              follow a formal complaints handling process. If they fail to resolve your complaint
              satisfactorily, you can escalate to an independent ombudsman at no cost to you.
            </p>
            {company.phone && (
              <p>
                <strong className="text-white">{company.name} complaints line:</strong>{' '}
                <span className="text-amber-400">{company.phone}</span>
              </p>
            )}
          </div>
        </section>

        {/* Section 2: Step-by-step */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-amber-400 mb-3">
            Step-by-step: how to make a formal complaint to {company.name}
          </h2>
          <div className="space-y-4">
            {[
              {
                step: '1',
                title: 'Gather your evidence',
                body: 'Collect all relevant bills, invoices, emails, and account statements. Note the dates of any incorrect charges or service failures. The more specific you are, the harder it is for the company to dismiss your complaint.',
              },
              {
                step: '2',
                title: 'Submit a formal written complaint',
                body: `Contact ${company.name} in writing — by email or letter — stating clearly: what went wrong, what you want them to do (refund, fix, compensation), and a deadline for their response (typically 14 days). Written complaints create a paper trail and trigger their formal complaints process.`,
              },
              {
                step: '3',
                title: 'Cite the law',
                body: 'Reference the Consumer Rights Act 2015 in your letter. Mention that you are entitled to a service carried out with reasonable care and skill, and that you expect a resolution within 14 days. This signals you know your rights and are prepared to escalate.',
              },
              {
                step: '4',
                title: 'Keep a record',
                body: 'Save all correspondence, including reference numbers. If you speak to anyone by phone, note the date, time, and name of the person you spoke to. This becomes essential if you need to escalate.',
              },
            ].map(({ step, title, body }) => (
              <div
                key={step}
                className="flex gap-4 bg-slate-800/40 border border-slate-700/50 rounded-xl p-5"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-sm">
                  {step}
                </div>
                <div>
                  <h3 className="text-white font-medium mb-1">{title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Escalation */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-amber-400 mb-3">
            What to do if {company.name} ignores your complaint
          </h2>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-3 text-slate-300">
            <p>{escalation.description}</p>
            <p>
              To escalate, you will need your original complaint reference number and evidence that
              you have tried to resolve the issue directly with {company.name} first. The process is
              free and the ombudsman&apos;s decision is binding on {company.name}.
            </p>
            <p>
              You can start the escalation process at{' '}
              <strong className="text-white">{escalation.name}</strong>.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-amber-900/30 to-slate-800/50 border border-amber-500/30 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Let Paybacker write your complaint letter for free
          </h2>
          <p className="text-slate-300 mb-6 max-w-lg mx-auto">
            Our AI drafts a formal complaint letter citing UK consumer law — tailored to{' '}
            {company.name} — in under 30 seconds. Used by thousands of UK consumers to recover
            money from incorrect bills.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Write my complaint letter free →
          </Link>
          <p className="text-slate-500 text-sm mt-4">No credit card required. Free plan available.</p>
        </section>

        {/* Footer breadcrumb */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-slate-600 text-sm">
          <Link href="/" className="hover:text-slate-400 transition-colors">
            Paybacker
          </Link>{' '}
          ›{' '}
          <Link href="/#disputes" className="hover:text-slate-400 transition-colors">
            Complaints
          </Link>{' '}
          › {company.name}
        </div>
      </div>
    </div>
  );
}
