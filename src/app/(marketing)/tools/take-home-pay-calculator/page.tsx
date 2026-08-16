import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import TakeHomePayCalculator from '../_components/TakeHomePayCalculator';
import { TAKE_HOME_SOURCES } from '../_data/sources';
import { TAX_VERIFIED_ON_HUMAN, TAX_YEAR_LABEL, TAX_YEAR_RANGE } from '../_data/uk-tax';

const SLUG = 'take-home-pay-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: `Take-Home Pay Calculator ${TAX_YEAR_LABEL} — Free, No Signup | Paybacker`,
  description: `Work out your net salary after Income Tax, National Insurance, pension and student loan on ${TAX_YEAR_LABEL} rates. Handles the £100k allowance taper, salary sacrifice, all five student loan plans and Scottish rates. Free, no account needed.`,
  keywords: [
    'take home pay calculator UK',
    'salary calculator after tax',
    `net salary calculator ${TAX_YEAR_LABEL}`,
    'Scottish income tax calculator',
    'student loan repayment calculator',
    'salary sacrifice calculator',
    '100k personal allowance taper',
  ],
  openGraph: {
    title: `Take-Home Pay Calculator ${TAX_YEAR_LABEL} — Free, No Signup`,
    description:
      'Gross to net, with the full working shown. Income Tax, National Insurance, every student loan plan, pension contributions and Scottish rates.',
    url: URL,
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: URL },
};

export default function Page() {
  return (
    <ToolShell
      slug={SLUG}
      h1="Take-home pay calculator"
      intro={`Turn a gross salary into what actually reaches your account, on ${TAX_YEAR_LABEL} rates. It handles the personal allowance taper above £100,000, salary sacrifice against a net pay arrangement, all five student loan plans and the Scottish bands, and it shows every line of the arithmetic so you can check it. No account, nothing stored.`}
      calculator={<TakeHomePayCalculator />}
      honesty={{
        title: 'What this covers, and who it does not work for',
        paragraphs: [
          `Every figure comes from the ${TAX_YEAR_LABEL} tax year (${TAX_YEAR_RANGE}), read off the GOV.UK pages linked further down this page on ${TAX_VERIFIED_ON_HUMAN}. If you are reading this after a Budget, check the date on those pages before you rely on the answer.`,
          'This models an employee taxed under PAYE on National Insurance category A, with a standard tax code and no taxable benefits in kind. That is most employed people. It is not everyone.',
          'It does not model the self-employed, company directors, anyone over State Pension age, the marriage allowance, the blind person’s allowance, dividend or savings income, benefits in kind, or the High Income Child Benefit Charge. If any of those apply to you, the number here will be wrong and we would rather say so than quietly produce it.',
          'Real payroll runs weekly or monthly and applies the thresholds per pay period, so your payslip can differ from an annual calculation by a few pounds. That is normal and it is not a mistake in either place.',
        ],
      }}
      explainers={[
        {
          heading: 'The 62% band nobody tells you about',
          paragraphs: [
            'Once your income passes £100,000, your personal allowance is withdrawn by £1 for every £2 you earn above it. By £125,140 it has gone entirely. The allowance is worth £12,570, so losing it costs you £5,028 in tax spread across a £25,140 stretch of salary.',
            'The effect is that in that band you pay 40% on the extra salary, plus another 20% in effect from the allowance disappearing, plus 2% National Insurance. That is a marginal rate of 62%. A £1,000 pay rise leaves you £380 better off. Above £125,140 the marginal rate drops back to 47%, which is why people describe it as a spike rather than a slope.',
            'This is the one place in the UK tax system where a pension contribution has an outsized effect. The taper is measured on adjusted net income, which is your income after pension contributions that get relief. Put enough into a pension to bring your adjusted net income back to £100,000 and the whole allowance comes back, at an effective cost of 38p in the pound.',
            'The calculator shows your marginal rate for exactly this reason. It is the number that tells you what a pay rise, a bonus or an extra shift is actually worth, and it is almost never the headline rate on your tax band.',
          ],
        },
        {
          heading: 'Salary sacrifice and a net pay arrangement are not the same thing',
          paragraphs: [
            'Both take your pension contribution out before Income Tax, so both look identical on a tax calculation. They are not identical on your payslip.',
            'Under salary sacrifice, you agree a lower contractual salary and your employer pays the difference into your pension. Because your salary is genuinely lower, you pay less National Insurance too, and so does your employer. Many employers pass some or all of their saving on.',
            'Under a net pay arrangement, your salary stays the same and the contribution is deducted from gross pay before tax is calculated. You get the Income Tax relief but not the National Insurance relief. On a £2,000 contribution, that difference is £160 a year for a basic rate employee and £40 for a higher rate one.',
            'There is a third arrangement, relief at source, where the contribution comes out of your pay after tax and the pension provider claims 20% back from HMRC. A higher or additional rate taxpayer has to claim the rest through Self Assessment, and a great many people never do. This calculator does not model relief at source, and says so in the results.',
            'Salary sacrifice also reduces the pay your student loan repayment is calculated on. A net pay arrangement does not. That is a small but real difference this calculator gets right and many do not.',
          ],
        },
        {
          heading: 'Student loans are not a tax, but they come off the same payslip',
          paragraphs: [
            'There are five plans and they have different thresholds. Plan 1 covers pre-2012 English and Welsh courses and all Northern Irish ones. Plan 2 covers English and Welsh courses started between 2012 and 2023. Plan 4 is Scottish. Plan 5 covers English courses started from August 2023. The Postgraduate Loan is separate again.',
            'The undergraduate plans take 9% of everything above the threshold. The Postgraduate Loan takes 6%. If you have both, you pay both, on top of each other rather than instead of each other. The amount you owe makes no difference at all to what comes off each month.',
            'One thing worth knowing: the deduction is calculated on each pay period, not on your annual income. A bonus month can push you over the monthly threshold and trigger a deduction even if your annual pay is below the yearly threshold. You can reclaim that after the end of the tax year, and most people never realise they can.',
            'Voluntary extra repayments are exactly that, voluntary and non-refundable. Because the debt is written off after a set period regardless of the balance, paying it down early only helps people who would otherwise clear it in full. For most graduates it is closer to a graduate tax than a loan, and spare money usually does more good against a mortgage.',
          ],
        },
        {
          heading: 'Scotland is genuinely different, and the gap is widest in the middle',
          paragraphs: [
            'Scotland sets its own Income Tax rates and bands on earned income. There are six bands rather than three, and the higher rate starts at £43,663 rather than £50,270.',
            'That creates an unusual stretch between £43,663 and £50,270 where a Scottish taxpayer pays 42% Income Tax while still paying 8% National Insurance, because the National Insurance upper earnings limit is set UK-wide at £50,270. The combined marginal rate in that band is 50%. Above it, National Insurance drops to 2% and the marginal rate falls to 44%.',
            'Below around £29,000 a Scottish taxpayer pays slightly less than someone on the same salary elsewhere in the UK, because of the starter rate. Above it they pay more, and the gap widens with income.',
            'Savings interest and dividends are taxed at the rest-of-UK rates wherever you live, so a Scottish taxpayer uses the same Personal Savings Allowance and the same savings rates as everyone else. Only earned income follows the Scottish bands.',
          ],
        },
      ]}
      sources={TAKE_HOME_SOURCES}
      filing={[]}
      faqs={[
        {
          q: 'Why does my payslip not match this exactly?',
          a: 'Payroll applies the thresholds per pay period, not annually, and it works cumulatively through the year. A pay change, a bonus, a wrong tax code or a mid-year start will all produce a different figure from an annual calculation. A gap of a few pounds a month is normal. A gap of tens of pounds usually means your tax code is wrong, which HMRC will correct if you tell them.',
        },
        {
          q: 'Why is my marginal rate 62% when I am a 40% taxpayer?',
          a: 'Between £100,000 and £125,140 your personal allowance is withdrawn by £1 for every £2 of income. Losing allowance means more of your income is taxed, so the effective rate on that stretch is 40% tax plus roughly another 20% from the withdrawal, plus 2% National Insurance. A pension contribution that brings your adjusted net income back to £100,000 restores the whole allowance.',
        },
        {
          q: 'Is salary sacrifice better than a net pay pension?',
          a: 'On the same contribution, yes, because salary sacrifice also saves National Insurance for you and for your employer. The trade-off is that your contractual salary is lower, which can affect mortgage affordability assessments, statutory maternity pay and some benefits. It also cannot take you below the National Minimum Wage.',
        },
        {
          q: 'Does a pension contribution reduce my student loan repayment?',
          a: 'Only under salary sacrifice, because that genuinely lowers your pay. A net pay arrangement or relief at source does not reduce the pay your student loan is calculated on. This calculator applies that distinction.',
        },
        {
          q: 'Which student loan plan am I on?',
          a: 'It depends on where and when you started your course. Plan 1 for pre-September 2012 English and Welsh courses and all Northern Irish courses, Plan 2 for English and Welsh courses started between September 2012 and July 2023, Plan 4 if you borrowed from the Student Awards Agency Scotland, Plan 5 for English courses started from August 2023. A Postgraduate Loan sits on top of whichever undergraduate plan you have.',
        },
        {
          q: 'Do I pay Scottish Income Tax if I work in Scotland but live in England?',
          a: 'No. Scottish Income Tax follows where your main home is, not where you work. If you live in England and commute to Scotland you pay the rest-of-UK rates, and the other way round. If you have more than one home, the test is which one you spend most time in.',
        },
        {
          q: 'Is any of this stored or sent anywhere?',
          a: 'No. The whole calculation runs in your browser. Nothing you type is transmitted to us, logged or saved, and there is no email gate before you see the result.',
        },
      ]}
      cta={{
        title: 'Knowing your net pay is step one. Keeping it is step two.',
        body: 'Most households lose more to subscriptions they forgot, contracts that silently rose and bills that were wrong than they would gain from a pay rise. Paybacker reads your bank feed, finds those, and writes the letters that get the money back.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
