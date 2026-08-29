import type { Metadata } from 'next';
import SwitchPage, { type SwitchPageData } from '../_components/SwitchPage';
import { findSwitch, SWITCH_BASE } from '../_data/switches';

/**
 * /switch/moneyhub
 *
 * Written for people searching "Moneyhub alternative" and "Moneyhub
 * closed what now" after the consumer app was sunsetted.
 *
 * Date discipline: the closure date used throughout is 31 July 2026,
 * taken from Moneyhub's own help-centre notice dated 30 June 2026. A
 * number of third-party blogs quote 14 August 2026 instead, and
 * Moneyhub's earlier press release referred to users who had not opted
 * in "by the end of August". Where sources disagree we use the closing
 * company's own most recent and most specific statement, and we say so
 * on the page rather than quietly picking one. Do not change the date
 * here without re-reading the help-centre article linked in
 * ../_data/switches.ts.
 *
 * Tone discipline: Moneyhub is a competitor that shut a consumer
 * product and handed its users to a partner. Nothing on this page
 * disparages them, and the comparison column describes the app
 * accurately rather than in the way that flatters us most.
 */

const meta = findSwitch('moneyhub')!;

const data: SwitchPageData = {
  meta,
  h1: 'The Moneyhub app has closed. Here is an honest look at what Paybacker does instead.',
  intro: [
    'Moneyhub sunsetted its consumer app on 31 July 2026 and moved its focus to enterprise clients. Users could migrate to WPS Advisory’s LifeStage app or download their data and close their account, and accounts where no action was taken were deleted.',
    'If you are reading this you are probably weighing up where to put your accounts next. This page is not a pitch dressed as a comparison. Paybacker is not a like-for-like Moneyhub replacement, and there are things Moneyhub did that we simply do not do. Here is the whole picture so you can decide before you connect anything.',
  ],
  closure: {
    heading: 'What actually happened',
    body: [
      'Moneyhub published a notice on 30 June 2026 confirming that the Moneyhub app would be "officially sunsetted and no longer available from the 31st of July". After that date users could no longer log in or reach their data through the app.',
      'Two options were offered before the deadline. The first was to migrate to WPS LifeStage, run by WPS Advisory, keeping any remaining subscription term. The second was to log in, download a CSV of transaction data, and delete the account. Moneyhub stated that where no action was taken by 31 July, remaining accounts and associated data would be automatically deleted in accordance with GDPR.',
      'Moneyhub explained the decision as a shift of focus toward supporting enterprise businesses, where its technology already sits behind a number of financial institutions. The consumer app closing is not a judgement on the people who used it, and it was not a failure of the product they built. It is a company choosing a different market.',
    ],
    sourceIntro:
      'Source, and the date we use throughout this page, is Moneyhub’s own announcement rather than any third-party report:',
  },
  honest: {
    heading: 'What Paybacker replaces, and what it does not',
    lead: [
      'The blunt version first. Paybacker is not a pure aggregator. Moneyhub was built to show you everything you own and owe in one picture. Paybacker is built to find money you should not have paid and get it back, and the tracking exists to feed that.',
      'That difference is not a detail you will discover in month three. It is the first thing you will notice, so it is the first thing on this page.',
    ],
    replaces: [
      'UK current accounts and credit cards, connected read-only through Open Banking',
      'Automatic transaction categorisation across more than twenty categories, with the ability to recategorise anything the model gets wrong',
      'Monthly spending trends, category breakdowns and income tracking',
      'Budgets with per-category limits and alerts when you approach them',
      'Savings goals with progress tracking',
      'A net worth view built from the accounts you connect',
      'Automatic detection of subscriptions, direct debits and recurring card payments',
      'Contract end dates and renewal reminders at 30, 14 and 7 days',
      'Export to CSV, PDF or a live Google Sheet that updates daily',
    ],
    doesNotReplace: [
      'Pensions. Moneyhub aggregated pension pots. Paybacker does not connect to pension providers at all.',
      'Investments, ISAs and portfolio valuations. Not covered.',
      'Property values and automatically tracked mortgage balances. Not covered.',
      'Sharing a live view of your finances with a financial adviser. Not a feature we have.',
      'Open Banking payments. Paybacker holds read-only consent and never initiates a payment or moves money.',
      'Importing your Moneyhub CSV. There is no transaction import, so the history you exported cannot be loaded in.',
      'Retirement modelling, forecasting and regulated financial advice or planning of any kind.',
    ],
    footer: [
      'So the honest summary is this. If what you valued in Moneyhub was the complete wealth picture across pensions, investments and property, Paybacker is narrower than what you had, and WPS LifeStage or another aggregator will serve you better for that half. Nothing we can say changes that.',
      'If what you used it for was the current-account and card view, seeing where the money went, and being quietly annoyed at bills that crept up while you watched them, then Paybacker covers that half and adds the part Moneyhub was never built to do: acting on what the data shows.',
      'Plenty of people will end up using both. That is a perfectly sensible answer and we would rather say so than pretend otherwise.',
    ],
  },
  comparison: {
    heading: 'Feature by feature',
    lead:
      'The middle column describes the Moneyhub consumer app as it stood before it closed, based on Moneyhub’s own published description of it. It is written in the present tense for readability, but the app is no longer available.',
    theirLabel: 'Moneyhub app',
    rows: [
      {
        feature: 'Bank and credit card accounts via Open Banking',
        them: 'Yes',
        us: 'Yes, read-only via Yapily. 2 accounts on Free, 3 on Essential, unlimited on Pro',
      },
      {
        feature: 'Pensions, investments and property in one view',
        them: 'Yes',
        us: 'No. Not covered at all',
      },
      {
        feature: 'Automatic transaction categorisation',
        them: 'Yes',
        us: 'Yes, 20+ categories, and you can recategorise anything',
      },
      {
        feature: 'Budgets and savings goals',
        them: 'Yes',
        us: 'Yes, on Essential and Pro. Free gets a basic spending overview',
      },
      {
        feature: 'Net worth',
        them: 'Yes, across all connected wealth',
        us: 'Yes, but only from the bank and card accounts you connect',
      },
      {
        feature: 'Share your data with a financial adviser',
        them: 'Yes',
        us: 'No',
      },
      {
        feature: 'Initiating payments through Open Banking',
        them: 'Yes',
        us: 'No. Read-only consent only, we cannot move money',
      },
      {
        feature: 'Subscriptions and recurring payments',
        them: 'Visible within spending analysis',
        us: 'A dedicated tracker that flags price rises, duplicates and forgotten trials',
      },
      {
        feature: 'Email inbox scanning for overcharges',
        them: 'No',
        us: 'Yes, Gmail or Outlook, read-only, the last 90 days of billing history',
      },
      {
        feature: 'Complaint and dispute letters citing UK law',
        them: 'No',
        us: 'Yes, with the statute or regulator rule cited and linked to its official source',
      },
      {
        feature: 'Tracking a dispute to the ombudsman deadline',
        them: 'No',
        us: 'Yes, including the eight-week point and the escalation route',
      },
      {
        feature: 'Importing a CSV of past transactions',
        them: 'Export was offered before closure',
        us: 'No import. History starts from what your bank returns on connection',
      },
      {
        feature: 'Cost',
        them: 'Consumer pricing no longer published',
        us: 'Free tier, Essential £4.99/mo, Pro £9.99/mo. We never take a percentage of money you recover',
      },
    ],
    note: 'If any row here misstates what the Moneyhub app did, tell us and we will correct it. A comparison table that flatters us at the cost of being wrong is worth nothing to you and does us no favours either.',
  },
  adds: {
    heading: 'What Paybacker adds that Moneyhub did not do',
    lead:
      'Moneyhub was, deliberately, an insight product. It showed you the picture and left the acting to you. These three things are the part that sits after the insight, and they are the actual reason to consider Paybacker rather than another aggregator.',
    items: [
      {
        title: 'Dispute letters that cite the law',
        body: 'Describe the problem in a sentence and Paybacker drafts a formal letter naming the provision that applies, whether that is the Consumer Rights Act 2015, Ofcom or Ofgem rules, or UK261 for a delayed flight. Citations are drawn from a maintained library restricted to official sources such as legislation.gov.uk, GOV.UK, the statutory regulators and Find Case Law, and a daily check blocks a letter whose citation has gone stale. The model applies the law to your facts, it does not invent the law.',
      },
      {
        title: 'Inbox scanning that finds the problem',
        body: 'Connect Gmail or Outlook read-only and Paybacker reads billing emails, renewal notices and price-rise letters from the last 90 days. This is where the things a bank feed cannot see turn up: the tariff that went up in writing, the trial that converted, the delayed flight you never claimed for. Bank data tells you what left your account. Your inbox tells you what you were told about it.',
      },
      {
        title: 'Escalation tracked to the deadline',
        body: 'A dispute that gets ignored is the normal outcome, not the exception, and most people give up at that point. Paybacker records when the letter went out, watches your inbox for the reply, and tracks the eight-week point at which a complaint typically becomes eligible for the relevant ombudsman, then drafts the escalation. You decide whether to send it, and you file with the ombudsman yourself.',
      },
    ],
  },
  setup: {
    heading: 'Getting set up, and what to expect',
    lead:
      'Around ten minutes, and you do not need a card. The one thing worth knowing before you start is that you are rebuilding from scratch rather than migrating, for the reasons in the next section.',
    steps: [
      {
        title: 'Create a free account',
        body: 'No card, no trial that quietly becomes a subscription. The free tier gives you two bank connections, one inbox and three AI letters a month, and it stays free.',
      },
      {
        title: 'Connect your bank through Open Banking',
        body: 'Connections run through Yapily, which is authorised and regulated by the FCA. You approve the connection inside your own bank’s app or website, so Paybacker never sees your banking credentials. Access is read-only: we can read transactions and cannot move money.',
      },
      {
        title: 'Expect roughly twelve months of history, and a 90-day reconsent',
        body: 'How far back the feed goes is set by your bank, and for most it is up to twelve months. Open Banking consent also expires every 90 days by regulation, so you will be asked to reauthorise about four times a year. That is the rule for every Open Banking app, not a Paybacker quirk.',
      },
      {
        title: 'Connect an inbox, then deal with the first thing it finds',
        body: 'Gmail or Outlook, read-only. The scan usually surfaces something within the first pass. If you would rather test the useful half before connecting anything at all, the free case checker takes a description of one problem and returns the law that applies and a draft letter, with no account.',
      },
    ],
    note: 'You can revoke bank access at any time from your own banking app, and delete your Paybacker account and data from Settings. Paybacker LTD is ICO-registered and your data stays in the UK.',
  },
  needs: {
    heading: 'What a Moneyhub user specifically needs to know',
    lead:
      'Four things that matter to you because of where you are coming from, rather than to anyone signing up cold.',
    items: [
      {
        title: 'Your history did not come with you',
        body: 'If you downloaded the CSV, keep it somewhere safe, because Paybacker cannot import it and neither can most alternatives. Your Paybacker history starts on the day you connect, plus whatever your bank chooses to backfill. Years of categorised spending is a genuine loss and it is worth being clear-eyed about that rather than being told it will feel the same.',
      },
      {
        title: 'If you migrated to WPS LifeStage, you may not need to replace the tracking at all',
        body: 'The two products are not really competing for the same job. LifeStage continues the aggregation and planning side. If that is working for you, keep it, and treat Paybacker as the recovery half rather than a replacement. Nothing about using one stops you using the other.',
      },
      {
        title: 'The overcharges you were watching are still there',
        body: 'The reason people used Moneyhub was usually a suspicion that money was leaking somewhere. A closed app does not close the mid-contract price rise, the subscription nobody uses, or the energy bill that was estimated too high. That backlog is exactly what the first Paybacker scan is for, and it is the one part of the switch that can pay for itself.',
      },
      {
        title: 'There are deadlines on old problems, so do not sit on them',
        body: 'Time limits vary by sector. For complaints about financial firms the Financial Ombudsman Service normally expects a complaint within six years of the event, or three years from when you realised you had cause to complain, whichever is later. Other routes are shorter. If something has been bothering you since 2023, that is a reason to look at it now rather than a reason it is too late.',
      },
    ],
  },
  faqs: [
    {
      q: 'When exactly did the Moneyhub app close, 31 July or 14 August 2026?',
      a: [
        'Moneyhub’s own help-centre notice, published on 30 June 2026, states that the app would be sunsetted and no longer available from the 31st of July 2026. That is the date used throughout this page.',
        'Several third-party articles quote 14 August 2026 instead, and Moneyhub’s earlier press release about the WPS Advisory handover referred to users who had not opted in by the end of August. Where a company’s own most recent and most specific statement conflicts with secondary reporting, we follow the company. If you need certainty for a data-protection reason, Moneyhub’s support team is the right place to ask.',
      ],
    },
    {
      q: 'What happened to my Moneyhub data?',
      a: [
        'It depended on what you did before the deadline. If you opted in, your account moved to WPS Advisory’s LifeStage app and any remaining subscription term carried over. If you chose the other route, you could download a CSV of your transaction data and delete your account and stored data.',
        'Moneyhub stated that where no action was taken by 31 July, remaining accounts and associated data would be deleted automatically in accordance with GDPR rules. If you did nothing, the working assumption should be that the data is gone.',
      ],
    },
    {
      q: 'Is Paybacker a direct replacement for Moneyhub?',
      a: [
        'No, and we would rather say so here than have you find out after connecting your accounts. Moneyhub aggregated pensions, investments and property alongside your bank accounts. Paybacker does none of those three.',
        'What Paybacker covers is the bank and card side: categorised spending, budgets, savings goals, net worth from connected accounts, and subscription tracking. What it adds on top is the ability to dispute what it finds. If the wealth picture was the reason you used Moneyhub, you want a different tool, or you want both.',
      ],
    },
    {
      q: 'Can I import my Moneyhub CSV export into Paybacker?',
      a: [
        'No. Paybacker has no transaction import, so an exported CSV cannot be loaded in. Your history begins when you connect an account, plus whatever backfill your bank provides, which for most UK banks is up to twelve months.',
        'Keep the CSV anyway. It is your record of years of spending and it is useful for evidence if you end up disputing something historic.',
      ],
    },
    {
      q: 'Does Paybacker track pensions and investments the way Moneyhub did?',
      a: [
        'No. There is no pension aggregation, no investment or ISA aggregation, and no portfolio valuation. Paybacker connects to current accounts and credit cards through Open Banking and nothing else.',
        'If pensions were the reason you were in Moneyhub every month, WPS LifeStage or a dedicated aggregator is the honest recommendation for that part.',
      ],
    },
    {
      q: 'Is it safe to connect my bank to Paybacker?',
      a: [
        'Connections run through Yapily, which is authorised and regulated by the Financial Conduct Authority as an account information service provider. You approve the connection inside your own bank’s app, so Paybacker never sees your login details, and the consent granted is read-only. We cannot initiate a payment or move money.',
        'You can revoke access at any time from your banking app, and Open Banking consent expires every 90 days by regulation regardless. Paybacker LTD is ICO-registered and your data stays in the UK.',
      ],
    },
    {
      q: 'What does Paybacker cost, and do you take a cut of anything I recover?',
      a: [
        'There is a free tier with two bank connections, one inbox and three AI letters a month. Essential is £4.99 a month or £44.99 a year. Pro is £9.99 a month or £94.99 a year.',
        'We never take a percentage of money you get back. Services that charge a success fee commonly take somewhere between a quarter and a third of your recovery, and the FCA caps claims-management charges on smaller consumer-credit claims at 30 per cent plus VAT. Paybacker charges a flat subscription and nothing else, so whatever comes back is yours.',
      ],
    },
    {
      q: 'Do I have to leave WPS LifeStage to use Paybacker?',
      a: [
        'No. They do different jobs, and using one has no bearing on the other. Both hold their own separate Open Banking consent, which you can grant or revoke independently from your bank.',
        'If LifeStage is covering your aggregation and planning, the sensible way to think about Paybacker is as the recovery layer rather than as a replacement.',
      ],
    },
    {
      q: 'What does "tracked to the ombudsman" actually mean in practice?',
      a: [
        'Paybacker records when your letter went out, watches the connected inbox for the provider’s reply, and keeps the clock on the eight-week point at which a complaint typically becomes eligible for the relevant ombudsman scheme. When that point arrives it drafts the escalation and tells you.',
        'It does not file on your behalf. Ombudsman schemes do not offer that, so you submit the complaint yourself using the drafted material and the record of what was sent when. Nothing is sent automatically at any stage: the agent proposes and you approve.',
      ],
    },
  ],
  cta: {
    title: 'Start with one problem, not with your whole financial life.',
    body: 'Connect a single account, or skip the account entirely and put one dispute through the free checker. If nothing useful comes back, you have lost ten minutes and you keep the free tier anyway.',
  },
};

export const metadata: Metadata = {
  title: 'Moneyhub Alternative UK: The App Closed 31 July 2026, What Now? | Paybacker',
  description:
    'Moneyhub’s consumer app closed on 31 July 2026 and unmigrated accounts were deleted. An honest look at what Paybacker replaces, what it does not (no pensions, no investments, no CSV import), and how to set up Open Banking after the closure.',
  keywords: [
    'Moneyhub alternative',
    'Moneyhub closed',
    'Moneyhub app closing',
    'Moneyhub replacement UK',
    'Moneyhub shutting down what now',
    'UK budgeting app alternative',
    'Moneyhub data deleted',
  ],
  openGraph: {
    title: 'Moneyhub has closed. An honest look at what Paybacker does instead.',
    description:
      'The Moneyhub consumer app was sunsetted on 31 July 2026. What Paybacker covers, what it genuinely does not replace, and what a Moneyhub user should do next.',
    url: `${SWITCH_BASE}/moneyhub`,
    type: 'article',
    siteName: 'Paybacker',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Moneyhub has closed. What Paybacker does instead.',
    description:
      'An honest comparison after the 31 July 2026 closure: what carries over, what does not, and where the recovery half fits in.',
  },
  alternates: { canonical: `${SWITCH_BASE}/moneyhub` },
};

export default function Page() {
  return <SwitchPage data={data} />;
}
