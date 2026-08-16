import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import MortgageRepaymentCalculator from '../_components/MortgageRepaymentCalculator';
import { MORTGAGE_SOURCES } from '../_data/sources';

const SLUG = 'mortgage-repayment-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Mortgage Repayment Calculator — Free, No Signup | Paybacker',
  description:
    'Work out your monthly mortgage payment, total interest and total repaid, plus what an overpayment saves you in interest and time, and what happens if rates rise. Free, no account needed.',
  keywords: [
    'mortgage repayment calculator UK',
    'mortgage overpayment calculator',
    'mortgage interest calculator',
    'mortgage stress test calculator',
    'how much interest will I pay on my mortgage',
  ],
  openGraph: {
    title: 'Mortgage Repayment Calculator — Free, No Signup',
    description:
      'Monthly payment, total interest, an overpayment scenario and a rate stress test, with the working shown.',
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
      h1="Mortgage repayment calculator"
      intro="Your monthly payment, the total interest over the term and the total repaid, plus what a regular overpayment saves you and what the payment would be if you remortgaged at a higher rate. The stress test is the part worth looking at hardest. No account, nothing stored."
      calculator={<MortgageRepaymentCalculator />}
      honesty={{
        title: 'The total interest figure is a comparison, not a prediction',
        paragraphs: [
          'This calculator assumes one rate for the whole term. Almost no UK borrower has that. You have a fixed deal for two, three or five years, then you remortgage onto whatever is available, and then you do it again. A 25-year total interest figure calculated at today’s rate is a useful way to compare two options. It is not a forecast of what you will pay.',
          'It also excludes arrangement fees, valuation fees, broker fees and any fee you add to the loan. A headline rate with a £1,499 product fee can easily cost more over a two-year fix than a higher rate with no fee, particularly on a smaller mortgage. Compare the total cost over the fixed period, not the rate.',
          'The overpayment scenario cannot see your early repayment charge, because we cannot see your mortgage offer. Most fixed deals allow you to overpay by around 10% of the balance a year without penalty and charge a percentage of the amount repaid above that. Going over the allowance can wipe out the entire saving the tool has just shown you. Check the allowance first, every time.',
          'And a detail that matters more than it should: when you overpay, tell the lender to keep the term the same and reduce the balance. If they reduce your monthly payment instead, which some do by default, you get a fraction of the interest saving shown here.',
        ],
      }}
      explainers={[
        {
          heading: 'Why the early years are almost all interest',
          paragraphs: [
            'A repayment mortgage charges interest on the outstanding balance each month, then applies whatever is left of your payment to the capital. Early on the balance is large, so the interest is large and very little of your payment touches the debt.',
            'On a £220,000 mortgage at 4.5%, the first monthly payment is around £1,223, of which roughly £825 is interest and only about £398 reduces the balance. Twenty years later the split has almost entirely reversed.',
            'This is why an overpayment made early is worth several times an identical overpayment made late. You are not just repaying capital, you are removing every future month of interest that capital would have generated. It is also why extending a term to reduce the payment is more expensive than the smaller monthly figure suggests.',
            'It is not a trick and it is not the lender being unfair. It is simply what compound interest on a reducing balance looks like. But it does mean that the question "should I overpay?" has a very different answer at year two than at year twenty-two.',
          ],
        },
        {
          heading: 'What the stress test is actually for',
          paragraphs: [
            'Lenders assess affordability under the FCA’s responsible lending rules, which require them to consider whether you could still afford the mortgage if interest rates rose. In practice they apply a margin over the rate you are being offered, or over their standard variable rate.',
            'The Bank of England’s Financial Policy Committee withdrew its mandatory affordability stress test in 2022, so the exact margin each lender uses is now its own choice within the FCA framework. Three percentage points is a common working assumption, which is why this tool uses it as a default. It is not a rule you have to pass.',
            'The reason to run it yourself is nothing to do with lenders. It is that your fixed rate will end, and the payment on the other side of it is the one that can genuinely hurt. Someone who fixed at 1.8% in 2021 and rolled off in 2024 saw their payment rise by hundreds of pounds a month. Working that out before you commit, rather than when the letter arrives, is the whole point.',
            'If the stressed payment is one you could not cover, the answer is not always a smaller mortgage. It might be a longer fix, a longer term, or a larger emergency buffer. But it needs to be a decision rather than a surprise.',
          ],
        },
        {
          heading: 'Interest-only, repayment and the difference that matters',
          paragraphs: [
            'This calculator models a capital and interest repayment mortgage, which is what almost all UK residential mortgages now are. You pay interest and you chip away at the debt, and at the end of the term you owe nothing.',
            'On an interest-only mortgage you pay only the interest, the balance never falls, and you must repay the whole amount at the end from something else. The monthly payment is far lower, which is the attraction, and the total interest is far higher, because the balance never reduces.',
            'A part-and-part mortgage splits the difference. If you have one, you can model it roughly by running the repayment portion through this calculator and adding the interest on the interest-only portion separately.',
            'If you are on interest-only and have no clear repayment plan, that is worth addressing now rather than at the end of the term. Lenders are required to contact you about it, and the options narrow considerably in the last few years.',
          ],
        },
        {
          heading: 'The most expensive thing that happens by accident',
          paragraphs: [
            'When a fixed rate ends, you move automatically onto the lender’s standard variable rate. That rate is typically several percentage points above what you could get on a new fix, and nobody has to warn you in a way you will notice.',
            'On a £200,000 balance with twenty years left, the difference between a 4.5% fix and a 7.5% standard variable rate is about £346 a month. People lose that for months at a time simply because the letter arrived at a busy moment.',
            'Diarise the end of your fixed rate six months ahead. Most lenders will let you reserve a new rate that far out, and you can usually switch to a better one if rates fall before it starts.',
            'If you are already on a standard variable rate, there is no early repayment charge on it, so you can move whenever you like. That is the one piece of good news about being on it.',
          ],
        },
      ]}
      sources={MORTGAGE_SOURCES}
      filing={[]}
      faqs={[
        {
          q: 'How is the monthly payment worked out?',
          a: 'With the standard repayment formula. The annual rate is divided by twelve to give a monthly rate, interest is charged on the outstanding balance each month, and the payment is set at the level that clears the balance exactly at the end of the term. That is the same method lenders use to build a repayment schedule.',
        },
        {
          q: 'Should I overpay my mortgage?',
          a: 'On the arithmetic alone, an overpayment gives you a guaranteed, risk-free, tax-free return equal to your mortgage rate. That is hard to beat with savings once tax is taken into account. Whether it is right for you depends on your early repayment charge, whether you have an emergency fund, and whether you have more expensive debt elsewhere. There is a separate tool on this site that compares overpaying against saving.',
        },
        {
          q: 'What is an early repayment charge?',
          a: 'A fee for repaying more than your deal allows during the fixed or discounted period. It is usually a percentage of the amount repaid, often stepping down each year of the deal. FCA rules require it to be a reasonable pre-estimate of the lender’s cost and to be disclosed to you. Most deals allow overpayments of around 10% of the balance a year before it applies. Check your offer document.',
        },
        {
          q: 'Should overpayments reduce my term or my monthly payment?',
          a: 'Reducing the term saves far more interest, because your payment stays the same and every future month of interest on the capital you repaid disappears. Reducing the payment gives you flexibility now but much less saving. Some lenders default to reducing the payment, so say which you want in writing.',
        },
        {
          q: 'How much can my payment realistically rise?',
          a: 'That is exactly what the stress test box is for. Put in the rate you are worried about and compare. The useful comparison is not against today’s rate but against what your payment would be if you had to remortgage in the current market when your deal ends.',
        },
        {
          q: 'What proportion of my income should the mortgage be?',
          a: 'There is no rule, only rules of thumb. Somewhere around a third of take-home pay is commonly treated as comfortable and around 45% as stretched, but that says nothing about childcare, other debt or how secure your income is. Lenders assess it against your full committed expenditure and will reach their own number.',
        },
      ]}
      cta={{
        title: 'The mortgage is the big number. The small ones add up too.',
        body: 'Overpaying by £150 a month is worth having. So is the £150 a month leaking out through subscriptions you forgot, a broadband contract that rose mid-term and an insurance renewal priced on the assumption you would not check. Paybacker finds those and writes the letters.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
