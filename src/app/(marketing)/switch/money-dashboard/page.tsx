import type { Metadata } from 'next';
import SwitchPage, { type SwitchPageData } from '../_components/SwitchPage';
import { findSwitch, SWITCH_BASE } from '../_data/switches';

/**
 * /switch/money-dashboard
 *
 * Written for people searching "Money Dashboard alternative" and
 * "Money Dashboard closed what now". The closure is older than the
 * Moneyhub one, so the audience here is split between people who never
 * settled anywhere after 2023 and people arriving late.
 *
 * Sourcing note: Money Dashboard announced the closure by email to
 * users on 3 October 2023 and does not publish a closure notice on its
 * own site, so the linked source is a contemporaneous trade report that
 * quotes the company's statement directly. The page says so in as many
 * words. Do not upgrade that link's description to "their own
 * announcement" without finding a first-party page that actually
 * exists.
 */

const meta = findSwitch('money-dashboard')!;

const data: SwitchPageData = {
  meta,
  h1: 'Money Dashboard closed in 2023. Here is an honest look at what Paybacker does instead.',
  intro: [
    'Money Dashboard shut Neon and Classic at the end of October 2023, closing and deleting accounts and disconnecting bank connections. The company said it could not find a sustainable business model for the apps and moved its focus to B2B open banking.',
    'A lot of people never properly replaced it. If that is you, this page is an honest account of what Paybacker covers, what it does not, and the one thing it does that Money Dashboard never tried to.',
  ],
  closure: {
    heading: 'What actually happened',
    body: [
      'On 3 October 2023, Money Dashboard emailed the users of Neon and Classic to say that, in the company’s own words, "unfortunately we could not find a sustainable business model for the apps and are therefore unable to continue supporting the services". Around half a million people were affected.',
      'Users had until the end of that month to export their data from the web version. The company confirmed that "existing Money Dashboard accounts will be closed and deleted, and any bank connections will be disconnected", and offered users a free trial of a rival app. Money Dashboard, owned by ClearScore, said it would focus on its B2B open banking services.',
      'It is worth saying plainly that Money Dashboard was a good product built by people who cared about it, and it was free. That is precisely why it could not carry on. Nothing here is a criticism of the app or the team.',
    ],
    sourceIntro:
      'Money Dashboard announced this by email and no longer publishes a closure notice on its own site, so the source below is a contemporaneous trade report quoting the company directly rather than a first-party announcement:',
  },
  honest: {
    heading: 'What Paybacker replaces, and what it does not',
    lead: [
      'Money Dashboard was a free aggregator and budget planner. It pulled your current accounts and cards into one view, split spending into categories, and let you set budgets and goals. It did that well and it did not charge for it.',
      'Paybacker overlaps with a good part of that, but the shape is different, and the difference is not subtle. Paybacker exists to find money you should not have paid and help you get it back. The tracking is there to feed that, not the other way round.',
    ],
    replaces: [
      'UK current accounts and credit cards, connected read-only through Open Banking',
      'Automatic categorisation of every transaction across more than twenty categories',
      'Monthly spending trends, category breakdowns and income tracking',
      'Budgets with per-category limits and alerts as you approach them',
      'Savings goals with progress tracking',
      'Automatic detection of subscriptions, direct debits and recurring card payments',
      'Predictable outgoings surfaced ahead of the date they leave your account',
      'Export to CSV, PDF or a live Google Sheet that updates daily',
    ],
    doesNotReplace: [
      'Being free at every level. Paybacker has a genuine free tier, but it caps you at 2 bank connections, 1 inbox and 3 AI letters a month.',
      'Importing your Money Dashboard export. There is no transaction import, so a CSV from 2023 cannot be loaded in.',
      'Years of back history. Your view starts from what your bank returns on connection, typically up to twelve months.',
      'Pensions, investments and property valuations. None of these are covered.',
      'Regulated financial advice, forecasting or planning of any kind.',
      'Open Banking payments. Paybacker holds read-only consent and never moves money.',
    ],
    footer: [
      'If what you want is a free budgeting app and nothing more, be honest with yourself about that, because there are several and Paybacker is not really trying to be one of them. Our free tier is real, but the product is built around a paid subscription and it would be daft to pretend otherwise.',
      'The case for Paybacker is different. Money Dashboard could show you that your broadband bill went up £8 a month in March. It could not write the letter citing the Ofcom rule that governs mid-contract price rises, and it could not chase the reply. That gap between noticing and doing is the whole product here.',
    ],
  },
  comparison: {
    heading: 'Feature by feature',
    lead:
      'The middle column describes Money Dashboard Neon and Classic as they stood before closure. It is written in the present tense for readability, but neither app is available now.',
    theirLabel: 'Money Dashboard',
    rows: [
      {
        feature: 'Bank and credit card accounts via Open Banking',
        them: 'Yes, read-only',
        us: 'Yes, read-only via Yapily. 2 accounts on Free, 3 on Essential, unlimited on Pro',
      },
      {
        feature: 'Automatic transaction categorisation',
        them: 'Yes, into spending categories',
        us: 'Yes, 20+ categories, and you can recategorise anything',
      },
      {
        feature: 'Budget planner and overspending alerts',
        them: 'Yes',
        us: 'Yes, on Essential and Pro. Free gets a basic spending overview',
      },
      {
        feature: 'Savings goals',
        them: 'Yes',
        us: 'Yes, with progress tracking',
      },
      {
        feature: 'Forecasting future outgoings from past patterns',
        them: 'Yes',
        us: 'Partly. Upcoming known payments and renewals, not a general forecast',
      },
      {
        feature: 'Pensions, investments and property',
        them: 'No',
        us: 'No',
      },
      {
        feature: 'Subscriptions and recurring payments',
        them: 'Visible within spending analysis',
        us: 'A dedicated tracker that flags price rises, duplicates and forgotten trials',
      },
      {
        feature: 'Email inbox scanning for overcharges',
        them: 'No',
        us: 'Yes, Gmail or Outlook, read-only, up to two years of billing history',
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
        them: 'Free',
        us: 'Free tier, Essential £4.99/mo, Pro £9.99/mo. We never take a percentage of money you recover',
      },
    ],
    note: 'Money Dashboard was free and Paybacker is not, at the level most people will end up using. That row is in the table on purpose. If any other row misstates what the apps did, tell us and we will correct it.',
  },
  adds: {
    heading: 'What Paybacker adds that Money Dashboard did not do',
    lead:
      'Money Dashboard told you where the money went. These three things are what happens after you know, and they are the actual reason to consider Paybacker rather than simply picking another free tracker.',
    items: [
      {
        title: 'Dispute letters that cite the law',
        body: 'Describe the problem in a sentence and Paybacker drafts a formal letter naming the provision that applies, whether that is the Consumer Rights Act 2015, Ofcom or Ofgem rules, or UK261 for a delayed flight. Citations come from a maintained library restricted to official sources such as legislation.gov.uk, GOV.UK, the statutory regulators and Find Case Law, and a daily check blocks a letter whose citation has gone stale. The model applies the law to your facts, it does not invent the law.',
      },
      {
        title: 'Inbox scanning that finds the problem',
        body: 'Connect Gmail or Outlook read-only and Paybacker reads billing emails, renewal notices and price-rise letters going back up to two years. That matters because a bank feed only shows you the amount that left. Your inbox shows what you were told, when, and whether the notice they were required to give you ever arrived.',
      },
      {
        title: 'Escalation tracked to the deadline',
        body: 'Being ignored is the normal outcome of a first complaint, and it is where most people stop. Paybacker records when the letter went out, watches your inbox for the reply, and tracks the eight-week point at which a complaint typically becomes eligible for the relevant ombudsman, then drafts the escalation. You decide whether to send it, and you file with the ombudsman yourself.',
      },
    ],
  },
  setup: {
    heading: 'Getting set up, and what to expect',
    lead:
      'Around ten minutes, and you do not need a card. If you have been without a money app since 2023, the first scan tends to be the interesting one.',
    steps: [
      {
        title: 'Create a free account',
        body: 'No card, and no trial that quietly becomes a subscription. The free tier gives you two bank connections, one inbox and three AI letters a month, and it stays free.',
      },
      {
        title: 'Connect your bank through Open Banking',
        body: 'Connections run through Yapily, which is authorised and regulated by the FCA. You approve the connection inside your own bank’s app or website, so Paybacker never sees your banking credentials. Access is read-only: we can read transactions and cannot move money.',
      },
      {
        title: 'Expect roughly twelve months of history, and a 90-day reconsent',
        body: 'How far back the feed goes is set by your bank, and for most it is up to twelve months. Open Banking consent also expires every 90 days by regulation, so you will be asked to reauthorise about four times a year. That applied to Money Dashboard too, and it applies to every Open Banking app.',
      },
      {
        title: 'Connect an inbox, then deal with the first thing it finds',
        body: 'Gmail or Outlook, read-only. Two years of billing history is usually enough to turn up at least one price rise you never agreed to. If you would rather test the useful half before connecting anything, the free case checker takes a description of one problem and returns the law that applies and a draft letter, with no account.',
      },
    ],
    note: 'You can revoke bank access at any time from your own banking app, and delete your Paybacker account and data from Settings. Paybacker LTD is ICO-registered and your data stays in the UK.',
  },
  needs: {
    heading: 'What a Money Dashboard user specifically needs to know',
    lead:
      'Four things that matter because of where you are coming from, rather than to anyone signing up cold.',
    items: [
      {
        title: 'Two or three years of drift has probably happened since',
        body: 'The period since October 2023 covers a long run of energy price cap changes, a wave of mid-contract broadband and mobile price rises, and a lot of streaming increases. If nothing has been watching your outgoings in that time, the gap between what you think you pay and what you actually pay is usually wider than people expect. That is the first scan.',
      },
      {
        title: 'Your export cannot come back in, so treat it as evidence',
        body: 'Paybacker has no transaction import, so the CSV you pulled in October 2023 will not load. Keep it anyway. If you end up disputing something historic, a dated record of what was charged and when is exactly the kind of evidence that makes a complaint stick.',
      },
      {
        title: 'Free was the point, so be clear about the trade',
        body: 'Money Dashboard was free and could not sustain itself, which is a large part of why it closed. Paybacker charges a flat subscription for the paid tiers and takes no cut of anything you recover. Whether that is worth £4.99 a month depends entirely on whether you have something worth disputing, which is why the free tier and the no-account case checker exist. Test it before you pay for it.',
      },
      {
        title: 'Old problems still have deadlines, but they are longer than people assume',
        body: 'Time limits vary by sector. For complaints about financial firms the Financial Ombudsman Service normally expects a complaint within six years of the event, or three years from when you realised you had cause to complain, whichever is later. Something that went wrong shortly after Money Dashboard closed may well still be in time. It is worth checking rather than assuming.',
      },
    ],
  },
  faqs: [
    {
      q: 'When did Money Dashboard close, and what happened to my data?',
      a: [
        'Money Dashboard emailed users on 3 October 2023 and closed Neon and Classic at the end of that month. Users had until the end of October to export their data from the web version.',
        'The company confirmed that existing accounts would be closed and deleted and that bank connections would be disconnected. If you did not export before the deadline, the data is gone.',
      ],
    },
    {
      q: 'Why did Money Dashboard shut down?',
      a: [
        'The company told users it could not find a sustainable business model for the apps and was therefore unable to continue supporting the services. It said it would focus on its B2B open banking business instead.',
        'This is a recurring pattern in free UK money apps rather than a one-off. Aggregation costs money to run every month and a free consumer product has to fund it from somewhere.',
      ],
    },
    {
      q: 'Is Paybacker a direct replacement for Money Dashboard?',
      a: [
        'For the bank and card side, largely yes: connected accounts, automatic categorisation, spending trends, budgets, savings goals and upcoming payments are all there.',
        'Two differences matter. Money Dashboard was free at every level and Paybacker is not beyond the free tier. And Paybacker is built around acting on what it finds, with dispute letters and escalation tracking, which Money Dashboard never offered. Whether that is a better fit depends on whether you actually want the second half.',
      ],
    },
    {
      q: 'Can I import my Money Dashboard CSV export?',
      a: [
        'No. There is no transaction import, so an export from 2023 cannot be loaded in. Your Paybacker history starts when you connect an account, plus whatever backfill your bank provides, which is up to twelve months for most UK banks.',
        'Keep the file regardless. It is a dated record of what you were charged, and that is genuinely useful evidence if you dispute something from that period.',
      ],
    },
    {
      q: 'Is there a free tier, and what is in it?',
      a: [
        'Yes, and it does not expire or ask for a card. The free tier includes two bank connections with daily sync, one connected inbox, unlimited manual subscription tracking, a basic spending overview, the Telegram Pocket Agent and three AI dispute letters a month.',
        'Essential is £4.99 a month or £44.99 a year and lifts the letter limit and adds full budgets. Pro is £9.99 a month or £94.99 a year for unlimited connections and WhatsApp. No tier takes a percentage of money you recover.',
      ],
    },
    {
      q: 'Is it safe to connect my bank to Paybacker?',
      a: [
        'Connections run through Yapily, which is authorised and regulated by the Financial Conduct Authority as an account information service provider. You approve the connection inside your own bank’s app, so Paybacker never sees your login details, and the consent granted is read-only. We cannot initiate a payment or move money.',
        'This is the same Open Banking framework Money Dashboard used. You can revoke access at any time from your banking app, and consent expires every 90 days by regulation regardless. Paybacker LTD is ICO-registered and your data stays in the UK.',
      ],
    },
    {
      q: 'What if Paybacker closes too? I have been through this once.',
      a: [
        'That is a fair question to ask of any small UK fintech, and the honest answer is that no company can promise you it will still be here in five years. What we can tell you is how the incentives are set up.',
        'Paybacker is funded by flat subscriptions rather than by being free and hoping to work out the model later, which is the thing that caught Money Dashboard. Your data is exportable to CSV, PDF or a live Google Sheet at any time, and you can delete your account and everything in it from Settings without asking us.',
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
  title: 'Money Dashboard Alternative UK: The App Closed in 2023, What Now? | Paybacker',
  description:
    'Money Dashboard Neon and Classic closed on 31 October 2023 and accounts were deleted. An honest look at what Paybacker replaces, what it does not (no import, no pensions, not free beyond the free tier), and how to reconnect via Open Banking.',
  keywords: [
    'Money Dashboard alternative',
    'Money Dashboard closed',
    'Money Dashboard Neon replacement',
    'Money Dashboard shut down',
    'UK budgeting app alternative',
    'free budgeting app UK alternative',
  ],
  openGraph: {
    title: 'Money Dashboard closed in 2023. An honest look at what Paybacker does instead.',
    description:
      'Neon and Classic shut at the end of October 2023. What Paybacker covers, what it genuinely does not replace, and where the recovery half fits in.',
    url: `${SWITCH_BASE}/money-dashboard`,
    type: 'article',
    siteName: 'Paybacker',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Money Dashboard closed. What Paybacker does instead.',
    description:
      'An honest comparison after the October 2023 closure: what carries over, what does not, and what has drifted since.',
  },
  alternates: { canonical: `${SWITCH_BASE}/money-dashboard` },
};

export default function Page() {
  return <SwitchPage data={data} />;
}
