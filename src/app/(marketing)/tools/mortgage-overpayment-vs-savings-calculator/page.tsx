import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import OverpayVsSaveCalculator from '../_components/OverpayVsSaveCalculator';
import { OVERPAY_SOURCES } from '../_data/sources';
import { TAX_VERIFIED_ON_HUMAN, TAX_YEAR_LABEL } from '../_data/uk-tax';

const SLUG = 'mortgage-overpayment-vs-savings-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Overpay the Mortgage or Save It? Free Calculator | Paybacker',
  description:
    'Compare overpaying your mortgage against putting the same money in savings, allowing for tax on interest and the Personal Savings Allowance. See which leaves you better off, with the working shown. Free, no signup.',
  keywords: [
    'overpay mortgage or save',
    'mortgage overpayment vs savings calculator',
    'is it better to overpay mortgage or save',
    'personal savings allowance calculator',
    'mortgage overpayment calculator UK',
  ],
  openGraph: {
    title: 'Overpay the Mortgage or Save It? Free Calculator',
    description:
      'Your mortgage rate against a savings rate after tax, run forward over the horizon you choose.',
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
      h1="Overpay the mortgage or put it in savings?"
      intro={`Compare your mortgage rate against a savings rate after tax, allowing for the Personal Savings Allowance on ${TAX_YEAR_LABEL} figures. Both routes are run forward month by month and measured the same way, so the comparison is like for like. No account, nothing stored.`}
      calculator={<OverpayVsSaveCalculator />}
      honesty={{
        title: 'Three things this cannot see, any one of which can flip the answer',
        paragraphs: [
          'Early repayment charges. We cannot see your mortgage offer, so we cannot see your annual penalty-free overpayment allowance or what happens above it. Most fixed deals cap it at around 10% of the balance a year and charge a percentage of anything above. A charge of 2% or 3% on the amount repaid will comfortably exceed several years of the advantage shown here. Check the allowance before you act on any answer on this page.',
          'Your emergency fund. Money paid into a mortgage is very hard to get back. If overpaying would leave you without accessible savings, the arithmetic favouring overpayment is beside the point, because the cost of borrowing at credit card rates when the boiler goes is far higher than the interest you saved. Build the buffer first, then optimise.',
          'Everything else about your circumstances. Other debt at a higher rate, job security, whether a pension contribution would beat both, whether you have an offset facility, whether you are close to a loan-to-value band that would get you a better remortgage rate. Any of those can matter more than the number this tool produces.',
          'What the tool is genuinely good for is settling the arithmetic, which is the part people get wrong. Overpaying is worth your mortgage rate, guaranteed and tax free. Saving is worth your savings rate after tax. Once you can see both of those side by side in pounds, the judgement is yours to make.',
        ],
      }}
      explainers={[
        {
          heading: 'Why overpaying is worth more than the same headline rate in savings',
          paragraphs: [
            'Interest you never pay is not income, so it is not taxed. Interest you receive is income, and above your Personal Savings Allowance it is taxed at your marginal rate.',
            'For a higher rate taxpayer with the allowance used up, a 5% savings account is worth 3% after tax. Against a 4.5% mortgage, that is not close. For a basic rate taxpayer the same account is worth 4%, which is still behind. Inside an ISA the account keeps its full 5% and now beats the mortgage.',
            'That is the whole comparison in three sentences. Mortgage rate against savings rate after tax. Everything else in this tool is putting pounds against those percentages so you can see the scale.',
            'There is a second, quieter advantage to overpaying: it is certain. A savings rate can be cut at a month’s notice and an investment return can be negative. The return from an overpayment is exactly your mortgage rate, for as long as you have the mortgage, with no volatility at all. On a strict risk-adjusted basis a mortgage rate is worth more than a nominally higher but uncertain return.',
          ],
        },
        {
          heading: 'The Personal Savings Allowance, and how quickly it runs out',
          paragraphs: [
            `A basic rate taxpayer gets ${TAX_YEAR_LABEL === '2026/27' ? '£1,000' : 'a set amount'} of savings interest tax free each year. A higher rate taxpayer gets £500. An additional rate taxpayer gets nothing at all. Interest above the allowance is taxed at your Income Tax rate, collected through your tax code or Self Assessment.`,
            'The allowance sounds generous until you translate it into a balance. At 4.5%, a basic rate taxpayer hits £1,000 of interest at around £22,000 of savings. A higher rate taxpayer hits £500 at around £11,000. Those are not large sums for someone who has been saving for a house deposit or building an emergency fund.',
            'This is why the ISA question comes first. Interest inside a cash ISA is not taxed and does not count towards the allowance at all. If you are going to save rather than overpay, using the ISA allowance is close to free money, and it leaves your Personal Savings Allowance available for interest elsewhere.',
            'There is also a separate starting rate for savings of up to £5,000 for people with low other income. It is withdrawn pound for pound by other income above the personal allowance and disappears entirely once other income reaches £17,570, so it mostly helps pensioners and people working part time. The calculator treats a non-taxpayer as paying no tax on interest, which is right for almost everyone in that position.',
          ],
        },
        {
          heading: 'When saving is the better answer',
          paragraphs: [
            'If your mortgage rate is low and fixed for years, and a cash ISA pays more than it, saving wins outright and there is nothing to agonise over. A great many people fixed at under 2% before 2022 and are in exactly that position.',
            'If you do not have three to six months of essential spending in an accessible account, saving wins for a reason that has nothing to do with rates. Liquidity has a value that no calculator prices.',
            'If you would breach your penalty-free overpayment allowance, saving usually wins for the rest of the deal period. A common approach is to save the money during the fixed term and use it as a lump sum at remortgage, when there is no charge.',
            'And if you are saving for something specific and near term, such as a deposit, a wedding or a car, overpaying is simply the wrong tool. Equity in a house is not spendable.',
          ],
        },
        {
          heading: 'The option most people forget: the pension',
          paragraphs: [
            'For a higher rate taxpayer, a pension contribution attracts 40% relief. That is an immediate uplift no mortgage rate or savings account comes close to, and for anyone earning between £100,000 and £125,140 the effective relief is 60% because of the personal allowance taper.',
            'The trade-off is access. The money is locked until at least age 55, rising to 57 from 2028, and it is taxable when you draw it beyond the tax-free lump sum. That is a real cost, not a technicality.',
            'This calculator does not model the pension option because doing it properly needs your annual allowance, your employer’s matching policy and your retirement plans. But if you are a higher rate taxpayer weighing an overpayment against a savings account, it is worth at least asking whether either is the right question.',
            'The same goes for employer matching. If your employer will match additional contributions and you are not taking the match, that is the highest guaranteed return available to you and it beats everything on this page.',
          ],
        },
      ]}
      sources={OVERPAY_SOURCES}
      filing={[]}
      faqs={[
        {
          q: 'What is the simple rule?',
          a: 'Overpay when your mortgage rate is higher than your savings rate after tax. Save when it is lower. Everything else on this page is working out what "after tax" means for you, and putting pounds against the percentages so you can see whether the difference is worth acting on.',
        },
        {
          q: 'Does the tool account for early repayment charges?',
          a: 'No, and that is the biggest limitation. We cannot see your mortgage offer. Most fixed deals allow overpayments of around 10% of the balance a year without penalty, and charge a percentage of anything above that. Check your annual allowance in your offer or annual statement before you set anything up.',
        },
        {
          q: 'Should I clear my student loan instead?',
          a: 'Usually not. Student loan repayments are a fixed percentage of income above a threshold, the balance is written off after a set period regardless of how much is left, and voluntary repayments are not refundable. Unless you are clearly going to repay the whole thing in full before write-off, spare money does more good against a mortgage.',
        },
        {
          q: 'Does it matter that overpaying is not reversible?',
          a: 'Yes, and it is a genuine cost the arithmetic does not show. Lenders will not simply hand overpayments back, and a further advance or payment holiday is at their discretion. That is why an accessible emergency fund should come before any overpayment, however good the rate comparison looks.',
        },
        {
          q: 'Do Scottish taxpayers use different savings figures?',
          a: 'No. Scotland sets its own rates on earned income only. Savings interest and dividends are taxed at the rest-of-UK rates wherever in the UK you live, so the Personal Savings Allowance and the tax on interest are the same.',
        },
        {
          q: 'What about an offset mortgage?',
          a: 'An offset gives you the best of both. Savings held in a linked account reduce the balance interest is charged on, so you effectively earn your mortgage rate tax free, while the money stays accessible. The offset rate is usually slightly higher than a standard deal, so it is worth comparing, but if your lender offers one it is well worth asking about.',
        },
        {
          q: 'How current are the tax figures?',
          a: `They are ${TAX_YEAR_LABEL}, read from the GOV.UK pages linked above on ${TAX_VERIFIED_ON_HUMAN}. Every tax figure this site uses lives in one file with the tax year and the verification date recorded, so it can be checked rather than assumed.`,
        },
      ]}
      cta={{
        title: 'Finding the spare money is the harder half.',
        body: 'This tool tells you what to do with £250 a month once you have it. Paybacker is how most of our users find it in the first place: forgotten subscriptions, mid-contract price rises that carried a right to exit, and bills that were simply wrong. Free plan, no card needed.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
