import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'DVLA vehicle tax refund and registration issues UK',
  subtitle:
    'Sold your car, overpaid vehicle tax, or having problems with your V5C logbook? UK law gives you clear rights to refunds and corrections. Paybacker helps you write a formal DVLA letter in seconds.',
  badge: 'Free to use — no credit card required',
  heroStat: '£100+',
  heroStatLabel: 'average vehicle tax refund when selling or scrapping a car',
  ctaPrimary: 'Generate Your Free DVLA Letter Now',
  socialProof:
    'DVLA processes millions of tax refunds every year. If you sell, scrap, or export a vehicle, you are automatically entitled to a refund for any full months remaining.',
  legislationTitle: 'Your legal rights on DVLA vehicle tax and registration',
  legislationParagraphs: [
    'Under the Vehicle Excise and Registration Act 1994 (VERA 1994), vehicle excise duty (VED) is a statutory tax payable on all vehicles used or kept on public roads. Section 7 of the Act provides that when a vehicle is sold, scrapped, exported, or taken off the road with a Statutory Off Road Notification (SORN), the registered keeper is entitled to a refund of vehicle tax for any complete months remaining. The refund is calculated automatically by DVLA when you notify them of the change.',
    'The Driver and Vehicle Licensing Agency (DVLA) is required under VERA 1994 and the Freedom of Information Act 2000 to maintain accurate vehicle records and to respond to keeper inquiries. If your V5C registration certificate (logbook) contains errors — for example an incorrect name, address, or vehicle details — you have the right to request a correction. DVLA must process these corrections within 4 to 6 weeks.',
    'If DVLA fails to process your refund, correction, or SORN within a reasonable time, or if you receive a penalty charge notice (PCN) for untaxed vehicle use while your tax was actually paid, you have the right to challenge the decision. Paybacker generates a formal letter citing the relevant sections of VERA 1994 and DVLA guidance, requesting the refund or correction you are entitled to.',
  ],
  rightsTitle: 'Your rights under UK vehicle and tax law',
  rights: [
    'Right to an automatic refund of vehicle tax for any full remaining months when you sell, scrap, or export a vehicle',
    'Right to notify DVLA of a sale immediately and receive confirmation within 4 weeks',
    'Right to place a vehicle off-road with a SORN and pay no tax while it is not used on public roads',
    'Right to correct errors on your V5C logbook free of charge',
    'Right to challenge an incorrect penalty charge notice (PCN) for vehicle tax',
    'Right to reclaim overpaid tax if you paid by Direct Debit and the vehicle is no longer registered to you',
    'Right to receive a replacement V5C if the original is lost, stolen, or damaged',
    'Right to escalate to the DVLA Chief Executive or the DVLA Data Protection Officer if your complaint is ignored',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe your DVLA issue',
      description:
        'Tell us what happened — sold car with no refund, incorrect V5C, SORN not processed, or an unfair penalty charge.',
    },
    {
      step: '2',
      title: 'AI generates your letter',
      description:
        'Paybacker writes a formal DVLA letter citing VERA 1994, DVLA guidance, and your specific statutory right to a refund or correction.',
    },
    {
      step: '3',
      title: 'Send to DVLA and get action',
      description:
        'Post to DVLA Swansea or use the online service. DVLA must respond to complaints within 4 to 6 weeks.',
    },
  ],
  faqs: [
    {
      q: 'How do I get a vehicle tax refund when I sell my car?',
      a: 'When you tell DVLA you have sold your vehicle (online or by post), the remaining tax is automatically refunded to the registered keeper for any full months left. The refund is sent to the address on the V5C within 4 to 6 weeks. You do not need to apply separately — but if the refund does not arrive, Paybacker generates a chase letter.',
    },
    {
      q: 'What is a SORN and when should I use it?',
      a: 'SORN (Statutory Off Road Notification) tells DVLA your vehicle is not being used on public roads and you are not paying vehicle tax. You must SORN a vehicle if it is untaxed and kept off-road. Once SORN is in place, you do not need to tax or insure the vehicle until you put it back on the road.',
    },
    {
      q: 'Can I challenge a DVLA penalty charge?',
      a: 'Yes. If you received a PCN for untaxed vehicle use but your vehicle was taxed, SORNed, or sold, you can challenge it. Paybacker generates a formal representation letter citing the correct statutory grounds. You must usually challenge within 28 or 30 days depending on the issuing body.',
    },
    {
      q: 'How long does DVLA take to correct my V5C?',
      a: 'DVLA aims to process V5C corrections within 4 to 6 weeks. If you have not received an updated logbook after 8 weeks, you should chase DVLA directly. Paybacker can generate a chase letter citing your right to accurate records under VERA 1994.',
    },
  ],
  finalCtaTitle: 'Ready to resolve your DVLA issue?',
  finalCtaSubtitle:
    'Generate a formal DVLA letter citing UK vehicle tax law in seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'DVLA Vehicle Tax Refund & Registration Issues UK | Free Letter | Paybacker',
  description:
    'Claim a DVLA vehicle tax refund, correct your V5C logbook, or challenge a penalty charge. Generate your free formal letter citing VERA 1994 in seconds.',
  openGraph: {
    title: 'DVLA Vehicle Tax Refund & Registration Issues UK | Free Letter',
    description:
      'Generate a formal DVLA letter citing UK vehicle tax law in seconds. Free to use.',
    url: 'https://paybacker.co.uk/dvla-vehicle',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/dvla-vehicle' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
