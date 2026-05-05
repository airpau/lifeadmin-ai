import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to claim an HMRC tax rebate UK',
  subtitle:
    'Overpaid tax through PAYE or self-assessment? HMRC owes you a refund if you have paid too much. Paybacker helps you write a formal tax rebate claim citing the Taxes Management Act 1970 and HMRC guidance — in seconds.',
  badge: 'Free to use — no credit card required',
  heroStat: '4 years',
  heroStatLabel: 'maximum lookback to claim overpaid tax from HMRC',
  ctaPrimary: 'Generate Your Free Tax Rebate Letter Now',
  socialProof:
    'Millions of UK taxpayers overpay tax every year. Common rebates include uniform expenses, marriage allowance, and pension contributions.',
  legislationTitle: 'Your legal rights when claiming a tax rebate from HMRC',
  legislationParagraphs: [
    'Under the Taxes Management Act 1970, Section 59, you have the right to claim a repayment of tax if you have overpaid. HMRC has a legal duty to repay overpaid tax promptly once a valid claim is made. You can claim back overpaid tax for up to 4 years from the end of the tax year in which you overpaid. For the current tax year, you can also ask HMRC to adjust your tax code so you pay less tax going forward.',
    'For uniform, work clothing, and tool expenses, HMRC permits flat-rate deductions under the Employment Income Manual. If your employer does not reimburse you for maintaining or replacing specialist clothing or tools, you can claim tax relief on the approved flat-rate amount for your occupation — or the actual amount if higher and evidenced.',
    'The Marriage Allowance permits a spouse or civil partner who earns below the Personal Allowance to transfer 10% of it to their higher-earning partner, reducing their tax by up to £252 per year (2025/26 rate). If you were eligible in previous years but did not claim, you can backdate the claim for up to 4 years. Paybacker generates the correct wording for HMRC.',
  ],
  rightsTitle: 'Your rights under UK tax law',
  rights: [
    'Right to claim a refund of overpaid tax for up to 4 previous tax years',
    'Right to have your tax code adjusted mid-year if you are overpaying currently',
    'Right to claim flat-rate expenses for uniform, tools, and work clothing',
    'Right to Marriage Allowance transfer if one partner earns below the Personal Allowance',
    'Right to tax relief on pension contributions above the basic rate',
    'Right to a response from HMRC within 15 working days for straightforward claims',
    'Right to appeal to the First-tier Tribunal (Tax) if HMRC refuses your claim',
    'Right to claim R40 repayment if you are non-UK resident or had savings income tax deducted',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe your tax situation',
      description:
        'Tell us what you think you overpaid — uniform costs, marriage allowance, pension contributions, or an incorrect PAYE code.',
    },
    {
      step: '2',
      title: 'AI generates your claim',
      description:
        'Paybacker writes a formal tax rebate claim letter citing the Taxes Management Act 1970 and HMRC expense guidance.',
    },
    {
      step: '3',
      title: 'Send to HMRC and get your rebate',
      description:
        'Post or submit online via your personal tax account. HMRC must respond within 15 working days for simple claims.',
    },
  ],
  faqs: [
    {
      q: 'How far back can I claim a tax rebate?',
      a: 'You can claim a tax rebate for up to 4 years from the end of the tax year in which you overpaid. For example, in the 2025/26 tax year you can claim back to 2021/22. Claims older than 4 years are time-barred unless there was HMRC error or fraud.',
    },
    {
      q: 'Can I claim tax relief for washing my work uniform?',
      a: 'Yes. If you wash, repair, or replace a uniform or specialist work clothing that your employer does not reimburse, you can claim a flat-rate deduction. HMRC has approved rates by occupation — for example, £60 per year for many healthcare and retail workers. You can claim even if you do not keep receipts.',
    },
    {
      q: 'What is the Marriage Allowance?',
      a: 'Marriage Allowance lets a lower-earning spouse or civil partner transfer 10% of their unused Personal Allowance to their higher-earning partner. In 2025/26 this reduces the partner\'s tax by up to £252. You can backdate claims for up to 4 years if you were eligible.',
    },
    {
      q: 'How long does HMRC take to process a rebate?',
      a: 'HMRC aims to respond to straightforward claims within 15 working days. Complex claims or those requiring additional evidence can take 4 to 8 weeks. If you do not receive a response within 8 weeks, you can escalate to the HMRC complaints team or the Adjudicator\'s Office.',
    },
  ],
  finalCtaTitle: 'Ready to claim your tax rebate?',
  finalCtaSubtitle:
    'Generate a formal HMRC tax rebate claim letter citing UK tax law in seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Claim an HMRC Tax Rebate UK | Free Letter Generator | Paybacker',
  description:
    'Claim an HMRC tax rebate for PAYE overpayment, uniform expenses, or Marriage Allowance. Generate your free claim letter citing the Taxes Management Act 1970 in seconds.',
  openGraph: {
    title: 'How to Claim an HMRC Tax Rebate UK | Free Letter Generator',
    description:
      'Generate a formal HMRC tax rebate claim letter citing UK tax law in seconds. Free to use.',
    url: 'https://paybacker.co.uk/hmrc-tax-rebate',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/hmrc-tax-rebate' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
