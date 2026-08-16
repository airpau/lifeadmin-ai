import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import CouncilTaxBandChecker from '../_components/CouncilTaxBandChecker';
import { COUNCIL_TAX_FILING, COUNCIL_TAX_SOURCES } from '../_data/sources';

const SLUG = 'council-tax-band-challenge-checker';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Council Tax Band Challenge Checker — Free, No Signup | Paybacker',
  description:
    'Check whether you have a legal right to challenge your council tax band or only an informal band review with no appeal, what evidence you need, and the real risk that your band goes up. Free, no account.',
  keywords: [
    'council tax band challenge',
    'challenge council tax band',
    'council tax band too high',
    'VOA band review',
    'council tax band appeal',
  ],
  openGraph: {
    title: 'Council Tax Band Challenge Checker — Free, No Signup',
    description:
      'Formal proposal or informal band review? One carries a right of appeal and one does not. Find out which applies to you, and what the risks are.',
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
      h1="Council tax band challenge checker"
      intro="There are two ways to challenge a band and they are not equivalent. One has a statutory timetable and a right of appeal. The other is a favour that can take a year and cannot be appealed at all. Find out which one is open to you before you send anything. No account, nothing stored."
      calculator={<CouncilTaxBandChecker />}
      honesty={{
        title: 'Your band can go up, and we are not going to bury that',
        paragraphs: [
          'A challenge asks the Valuation Office whether your band is CORRECT. Not whether it is too high. If it concludes the band should be higher, it will raise it, and a higher band is backdated. There is no version of this where the only possible outcome is a refund.',
          'There is a second-order risk that gets even less attention. If your case is that comparable neighbouring properties are in a lower band, you are inviting the Valuation Office to look at the whole street. It may agree that your street is inconsistent and conclude that your neighbours are the ones banded wrongly. Their bands go up, yours stays put, and you have to live there.',
          'The third thing worth knowing before you start: if you do not have a legal right to make a formal proposal, and most people who have lived somewhere for years do not, then what you can ask for is an informal band review. The Valuation Office can take up to twelve months over it and there is NO right of appeal if it says no. You get one attempt and then it is finished. That is why this tool will sometimes tell you to go and gather evidence rather than send something today.',
          'We will not quote you a success rate. It depends entirely on the comparables and the valuation evidence in your specific case.',
        ],
      }}
      explainers={[
        {
          heading: 'Proposal or band review: the distinction nobody explains',
          paragraphs: [
            'GOV.UK draws a clear line between two things that are usually described interchangeably, and the difference is worth understanding before you do anything.',
            'A PROPOSAL is a formal challenge you have a legal right to make. You qualify if you have been paying council tax on the property for less than six months, if the Valuation Office changed your band in the last six months, or if there has been a relevant change: the property split or merged, a change of use, or a physical change to the local area. A proposal has to be decided within about four months, and if it is refused you can appeal free of charge to the Valuation Tribunal, normally within three months in England or four in Wales.',
            'A BAND REVIEW is what you get when you do not qualify. The Valuation Office will look at it, but it can take up to twelve months, and there is no right of appeal to the Valuation Tribunal from the outcome. If it says no, that is the end of it.',
            'This is why timing matters so much. If you have just moved in, you are inside a six-month window that gives you appeal rights you will never get back. If you have been there eight years, you are in the one-shot category and should build the case properly before you submit it.',
          ],
        },
        {
          heading: 'The evidence that actually decides a banding case',
          paragraphs: [
            'Two strands, and a serious case needs both. Neither of them is "my bill feels expensive".',
            'The first is comparables. Council tax banding is a relative exercise, so the most persuasive material is a list of genuinely comparable properties on your street in a lower band. Same property type, similar size and layout, same road or a genuinely equivalent one. You can look up the band of any address on the official register for free, and it takes twenty minutes. A three-bedroom semi is not a comparable for a four-bedroom detached, and putting one forward invites the Valuation Office to dismiss the lot.',
            'The second is the valuation. Bands are set on values at a fixed historic date: 1 April 1991 in England and Scotland, 1 April 2003 in Wales. The test is what the property was worth THEN, not what it is worth now. The usual approach is to take a sale price for a comparable property that you can evidence, index it back to the valuation date, and show which band that figure falls into. A challenge built on today’s market value misunderstands the test.',
            'A submission with both strands, in writing, with addresses and figures, is a different document from a letter saying you think your band is too high. It is also the only kind that has a realistic prospect where you only get one attempt.',
          ],
        },
        {
          heading: 'Scotland and Northern Ireland work differently',
          paragraphs: [
            'In Scotland, banding is handled by the Assessor for your Valuation Joint Board or council rather than by the Valuation Office. Scottish bands are also based on 1 April 1991 values. Formal proposals generally have to be made within six months of becoming the council tax payer, and appeals go to the Local Taxation Chamber rather than to the Valuation Tribunal for England.',
            'Northern Ireland does not use bands at all. Domestic rates there are based on the capital value of the property, assessed by Land and Property Services, with its own review and appeal route. None of the banding machinery described on this page applies.',
            'The band-can-go-up warning applies in all four nations. A capital valuation review in Northern Ireland can move the figure upwards just as a band review can move a band.',
          ],
        },
      ]}
      sources={COUNCIL_TAX_SOURCES}
      filing={COUNCIL_TAX_FILING}
      faqs={[
        {
          q: 'Can challenging my council tax band make it go up?',
          a: 'Yes. A review considers whether the band is correct, in either direction, and the Valuation Office can conclude it should be higher. A higher band is backdated. There is also a chance that drawing attention to inconsistency on your street results in neighbouring bands being raised instead of yours being lowered. Do not start unless you accept those outcomes.',
        },
        {
          q: 'What is the difference between a proposal and a band review?',
          a: 'A proposal is a formal challenge you have a legal right to make, decided within about four months, with a free right of appeal to the Valuation Tribunal if it is refused. A band review is what you can ask for when you do not qualify. It can take up to twelve months and carries no right of appeal. If the Valuation Office says no to a band review, that is the end of the matter.',
        },
        {
          q: 'When do I have a legal right to challenge?',
          a: 'When you have been paying council tax on the property for less than six months, when the Valuation Office has changed your band in the last six months, or when there has been a relevant change: the property split or merged, a change of use, or a physical change to the local area. Outside those grounds you can only ask for an informal band review.',
        },
        {
          q: 'What year are council tax bands based on?',
          a: '1 April 1991 in England and Scotland, and 1 April 2003 in Wales. Those dates have never been revalued. The question is what the property was worth then, not what it is worth today, which is why a challenge based on the current market value gets nowhere.',
        },
        {
          q: 'How far back is a refund paid if my band is reduced?',
          a: 'Normally to the date you became liable for council tax on the property, and potentially back to 1993 if the band has been wrong since the list was created. Your council recalculates the bill and issues the refund once the Valuation Office notifies it of the change.',
        },
        {
          q: 'Do I need to pay while the challenge is being considered?',
          a: 'Yes. Council tax remains due while a proposal or band review is outstanding. Stopping payment does not pause anything and can lead to recovery action. Keep paying and let the refund follow if the band is reduced.',
        },
      ]}
      cta={{
        title: 'Have the evidence? Put it in writing properly.',
        body: 'Where you only get one attempt, the submission has to carry the comparables and the valuation reasoning in a form the Valuation Office can act on. Paybacker drafts it from your facts, keeps the record of what you sent and when, and tracks the response clock.',
      }}
    />
  );
}
