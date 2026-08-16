import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import SavingsGoalCalculator from '../_components/SavingsGoalCalculator';
import { SAVINGS_GOAL_SOURCES } from '../_data/sources';
import { TAX_VERIFIED_ON_HUMAN, TAX_YEAR_LABEL } from '../_data/uk-tax';

const SLUG = 'savings-goal-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Savings Goal and Compound Interest Calculator — Free, No Signup | Paybacker',
  description:
    'Solve for whichever bit you do not know: the final pot, the monthly amount, how long it takes, or the return needed. Includes an inflation-adjusted real-terms view and the UK savings tax position. Free, no account.',
  keywords: [
    'compound interest calculator UK',
    'savings goal calculator',
    'how long to save calculator',
    'how much to save each month',
    'inflation adjusted savings calculator',
    'ISA allowance',
  ],
  openGraph: {
    title: 'Savings Goal and Compound Interest Calculator — Free, No Signup',
    description:
      'Work out the pot, the monthly amount, the time or the return, with a real-terms view of what it is actually worth.',
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
      h1="Savings goal and compound interest calculator"
      intro="Tell it what you know and it solves for what you do not: the final pot, the monthly amount needed, how long it takes, or the return you would have to get. Every answer also comes in today's money, because a target set in current prices is not the same target in ten years. No account, nothing stored."
      calculator={<SavingsGoalCalculator />}
      honesty={{
        title: 'A constant rate is a modelling convenience, not a description of reality',
        paragraphs: [
          'This calculator applies one rate every month for the whole period. Nothing behaves like that. Savings rates change whenever the market moves, and an investment return is an average across good years and bad ones rather than the same number repeated.',
          'For cash savings over a few years, that simplification is close enough to be useful. For an investment over decades, it is not a forecast and should not be read as one. You can get back less than you put in, and the order in which the good and bad years arrive changes the outcome even when the average is identical.',
          'It also ignores charges. A platform or fund charge of 1% a year sounds trivial and takes a very large bite out of a long-run figure, because it compounds against you in exactly the same way the return compounds for you.',
          'The real-terms figure is the one to plan against. £20,000 in ten years buys roughly what £16,400 buys today at 2% inflation. If your target came from a price you saw this year, the nominal number is already out of date.',
        ],
      }}
      explainers={[
        {
          heading: 'Why the last years do most of the work',
          paragraphs: [
            'Compound interest is often explained as interest on interest, which is accurate and unhelpful. The useful version is that the growth in any year is proportional to what is already there, so almost all of the growth happens at the end when the balance is largest.',
            'Save £250 a month at 5% for ten years and you finish with roughly £38,600, of which about £8,600 is growth. Run the same thing for twenty years and you finish with about £101,500, of which about £41,500 is growth. Doubling the time did not double the growth, it nearly quintupled it.',
            'The practical consequence is that time is worth far more than amount, early on. £100 a month started now generally beats £200 a month started in ten years, and no amount of later discipline recovers the difference.',
            'It also means that stopping and restarting is expensive in a way that does not feel expensive. A two-year gap early in a twenty-year plan costs more than the contributions you missed, because those contributions would have been compounding the longest.',
          ],
        },
        {
          heading: 'What inflation does to a target set in today’s money',
          paragraphs: [
            'People set savings goals in current prices. A £30,000 deposit, a £15,000 car, £20,000 to cover a year of something. Those are all this-year numbers, and the thing being bought will not stay at this year’s price.',
            'At 2% inflation, prices rise by about 22% over ten years. At 3%, about 34%. So a £30,000 target hit in ten years buys what roughly £24,600 buys now at 2%, or £22,300 at 3%. You reached the number and missed the goal.',
            'The default in this calculator is 2%, which is the Bank of England’s inflation target rather than a forecast. It is a reasonable planning assumption over a long period and it was badly wrong in 2022 and 2023. Change it and see how sensitive your plan is.',
            'The fix is either to raise the nominal target by expected inflation, or to plan for a return that beats inflation rather than one that merely looks positive. A 4% return with 3% inflation is a 1% real return, which is not nothing but is a great deal less than 4%.',
          ],
        },
        {
          heading: 'Where the money should sit, and when tax starts to bite',
          paragraphs: [
            `Interest inside an ISA is not taxed at all and does not count towards your Personal Savings Allowance. The total you can put into ISAs across all types is £20,000 for ${TAX_YEAR_LABEL}. For almost anyone saving a few hundred pounds a month, that allowance is more than enough, so the ISA question has an easy answer: use it first.`,
            'Outside an ISA, a basic rate taxpayer gets £1,000 of interest tax free each year, a higher rate taxpayer £500, and an additional rate taxpayer nothing. At a 4.5% rate, £1,000 of interest arrives at around £22,000 of savings and £500 at around £11,000. Those thresholds are reached faster than people expect.',
            'There is also a starting rate for savings of up to £5,000, which helps people with low other income. It is reduced pound for pound by other income above the personal allowance and is nil once other income reaches £17,570, so in practice it mostly helps pensioners and part-time workers.',
            'A Lifetime ISA adds a 25% government bonus on up to £4,000 a year, but only for a first home under a price cap or for withdrawal from age 60. Take the money out for anything else and there is a withdrawal charge that can leave you with less than you put in. It is excellent for the two purposes it exists for and a poor choice for a general savings pot.',
          ],
        },
        {
          heading: 'Cash or investments, and the five-year line',
          paragraphs: [
            'The conventional dividing line is five years. Money you need sooner than that generally belongs in cash, because a market fall at the wrong moment leaves you with less than you need and no time to recover. Money you will not touch for much longer than that generally belongs in investments, because inflation is the bigger risk over a long period.',
            'That is a rule of thumb, not a rule, and it says nothing about how you would feel watching a balance fall by a third. Someone who sells at the bottom does worse than someone who never invested, so tolerance matters as much as timescale.',
            'If you use this calculator with an investment return in mind, treat the answer as one scenario rather than the answer. Run it again at two percentage points lower and see whether the plan still works. If it only works at the optimistic rate, it is not a plan.',
            'For a required return above about 7% a year, the honest reading is usually that the goal, the timescale or the monthly amount needs to change, rather than that you need to find a better account.',
          ],
        },
      ]}
      sources={SAVINGS_GOAL_SOURCES}
      filing={[]}
      faqs={[
        {
          q: 'How is the compounding worked out?',
          a: 'Monthly. The annual rate you enter is treated as an AER and converted to its exact monthly equivalent, so the annual growth matches the rate you typed. Contributions are added at the end of each month. Using the annual rate divided by twelve would slightly overstate the return, which matters when you are comparing options.',
        },
        {
          q: 'What rate should I assume?',
          a: 'For cash, use the AER on an account you can actually open today, and expect it to change. For investments, any assumption is a judgement rather than a fact, and it is worth running the calculation twice at different rates to see how much your plan depends on being right.',
        },
        {
          q: 'Why does the answer show a smaller amount in today’s money?',
          a: 'Because prices rise. The real-terms figure discounts the final pot by the inflation rate you set, so it shows what that future amount would buy at today’s prices. If your goal came from a price you saw this year, this is the number that tells you whether you actually get there.',
        },
        {
          q: 'Should I use a cash ISA or an ordinary savings account?',
          a: `A cash ISA, in almost every case, provided the rate is comparable. Interest inside an ISA is not taxed and does not use up your Personal Savings Allowance, which stays available for interest elsewhere. The ISA allowance is £20,000 across all types for ${TAX_YEAR_LABEL}.`,
        },
        {
          q: 'Does the projection deduct tax?',
          a: 'No. It shows the gross position and tells you separately at roughly what balance interest would start to be taxable outside an ISA, based on the tax band you select. For most people saving inside an ISA, no tax is due at all.',
        },
        {
          q: 'How current are the ISA and savings allowance figures?',
          a: `They are ${TAX_YEAR_LABEL}, read from the GOV.UK pages linked above on ${TAX_VERIFIED_ON_HUMAN}. Every tax figure on this site lives in one file with the tax year and verification date recorded against it.`,
        },
      ]}
      cta={{
        title: 'The plan is the easy part. Finding the monthly amount is the hard part.',
        body: 'Most households have more spare money than they think, sitting in forgotten subscriptions, contracts that quietly rose, and bills that were simply wrong. Paybacker reads your bank feed, finds it, and writes the letters that get it back. Free plan, no card needed.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
