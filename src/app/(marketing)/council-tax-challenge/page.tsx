import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Challenge Your Council Tax Band UK',
  subtitle: 'Around 400,000 English homes may be in the wrong council tax band. If yours is too high, you could be entitled to a refund going all the way back to 1993. Challenge your band through the Valuation Office Agency with a formal letter.',
  badge: 'Free letter — potential refund going back to 1993',
  heroStat: '400,000',
  heroStatLabel: 'homes estimated to be in the wrong council tax band in England',
  heroStatColor: 'text-rose-400',
  ctaPrimary: 'Generate Your Free Council Tax Challenge Letter Now',
  socialProof: 'A successful council tax band reduction saves hundreds of pounds per year and can result in a backdated refund covering decades.',
  legislationTitle: 'The council tax banding system and your right to challenge',
  legislationParagraphs: [
    'Council tax bands in England and Scotland are based on estimated property values as of 1 April 1991. In Wales, they are based on values as of 1 April 2003. Because these valuations were made over 30 years ago — often by a drive-past assessment rather than a formal survey — a significant number of properties were placed in the wrong band. If your home was assessed at a higher value than comparable properties nearby, you could be overpaying by hundreds of pounds a year.',
    'The Valuation Office Agency (VOA) is responsible for setting and maintaining council tax bands in England and Wales. The Scottish Assessors Association (SAA) performs the same function in Scotland. Under the Council Tax (Alteration of Lists and Appeals) (England) Regulations 2009, you have the right to formally challenge your banding if you have evidence that it is incorrect. The most persuasive evidence is comparable property data: if similar homes on your street or in your neighbourhood are in a lower band, this is strong grounds for a challenge.',
    'If the VOA rejects your challenge, you have the right to appeal to a Valuation Tribunal for an independent decision. The tribunal service is free to use. Importantly, there are different windows for challenging: if you have recently moved into a property, you have six months to challenge without needing to demonstrate a material change. After six months, you need to show the original banding was clearly wrong. There is no upper time limit on claims if you can demonstrate the initial banding was incorrect.',
  ],
  rightsTitle: 'Your rights when challenging your council tax band',
  rights: [
    'Right to challenge your council tax band with the VOA (England/Wales) or SAA (Scotland) at any time if the banding is wrong',
    'If successful, band is reduced from the date you first occupied the property — potentially back to 1993',
    'Right to appeal to a Valuation Tribunal if the VOA rejects your challenge — the tribunal is free to use',
    'Six-month window when moving into a new property to challenge without needing to show a material change',
    'Right to request comparison data for similar properties in your area from the VOA',
    'Disabled people can apply for a band reduction if the home has been adapted for their disability needs',
    'Empty or substantially unfurnished properties may qualify for a council tax exemption or discount',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Check comparable properties',
      description: 'Look up your council tax band on the VOA website. Find similar properties nearby and check whether they are in a lower band.',
    },
    {
      step: '2',
      title: 'AI writes your challenge',
      description: 'Formal challenge letter to the VOA citing the Council Tax (Alteration of Lists and Appeals) Regulations, with your grounds for a reduction.',
    },
    {
      step: '3',
      title: 'Submit and await the decision',
      description: 'Send the letter to the VOA. If they reject your challenge, you can appeal to the Valuation Tribunal for free.',
    },
  ],
  faqs: [
    {
      q: 'How do I know if my council tax band is wrong?',
      a: "Compare your property to similar ones in your area using the VOA's online service at gov.uk/council-tax-bands. If neighbouring properties with similar size, type, and age are in a lower band, or if properties that sold in 1991 for comparable amounts are assessed lower, you may have a valid claim.",
    },
    {
      q: 'Could challenging result in my band being increased?',
      a: 'The VOA can theoretically increase a band if they believe it is genuinely too low. However, in practice this is very rare, and the VOA typically only reassesses a band when a challenge is made and new evidence warrants it. If you are confident your band is too high, the risk of an increase is minimal.',
    },
    {
      q: 'How far back will a successful refund go?',
      a: "If your band is reduced, you receive a refund from the date you moved into the property. For long-term residents, this can go back to 1 April 1993 when council tax was introduced. Your local council is responsible for calculating and issuing the refund, which can be substantial.",
    },
    {
      q: 'Do I need a solicitor or surveyor to challenge my band?',
      a: 'No. The process is designed to be used by individuals without professional representation. A formal written challenge citing the correct regulations and presenting comparable property evidence is sufficient for the majority of cases.',
    },
  ],
  finalCtaTitle: 'Ready to challenge your council tax band?',
  finalCtaSubtitle: 'Generate a formal challenge letter to the VOA in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Challenge Your Council Tax Band UK | Free Letter | Paybacker',
  description:
    'Challenge your council tax band with a formal letter to the Valuation Office Agency. Up to 400,000 homes may be in the wrong band. Free letter generator — potential refund back to 1993.',
  openGraph: {
    title: 'How to Challenge Your Council Tax Band UK | Free Letter',
    description:
      'Challenge your council tax band with a formal VOA letter. Up to 400,000 homes may be in the wrong band. Free generator — potential refund back to 1993.',
    url: 'https://paybacker.co.uk/council-tax-challenge',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/council-tax-challenge' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
