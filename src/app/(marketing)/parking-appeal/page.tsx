import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Appeal a Parking Charge Notice UK',
  subtitle: 'Private parking charges can be appealed through POPLA or the IAS — both free services. Many are successfully cancelled when challenged properly. Generate your free parking appeal letter citing the Protection of Freedoms Act 2012 in 30 seconds.',
  badge: 'Free appeal letter — most charges are cancelled on appeal',
  heroStat: '60%+',
  heroStatLabel: 'of private parking appeals succeed at independent adjudication',
  heroStatColor: 'text-orange-400',
  ctaPrimary: 'Generate Your Free Parking Appeal Letter Now',
  socialProof: 'Millions of private parking charge notices are issued in the UK each year. Many are not legally enforceable.',
  legislationTitle: 'Private parking law and the Protection of Freedoms Act 2012',
  legislationParagraphs: [
    "There is a critical distinction in UK parking law between Penalty Charge Notices (PCNs) issued by councils — which are statutory civil penalties enforced by local authorities — and private parking charge notices issued by private companies. Private charges are not fines. They are a contractual claim for alleged breach of the contract formed by entering a private car park. This means strict legal requirements must be met before a charge is enforceable, and many are not.",
    'The Protection of Freedoms Act 2012 (PoFA) sets out the specific conditions under which a registered keeper — rather than the actual driver — can be held liable for a private parking charge. The keeper can only be pursued if the operator sent a valid Notice to Keeper within 14 days of the parking event (or within 28 days if the vehicle was not captured by ANPR at the time), and only if the notice contained all of the prescribed information. Any failure to follow this exact process means the keeper cannot be pursued, regardless of whether the driver had grounds to appeal.',
    'Signage is the other major basis for appeal. For a contract to exist between a driver and a car park operator, the terms must have been clearly communicated at the point of entry. If signs were inadequate — too small, poorly positioned, obscured by vegetation, not present at the entrance, or written in confusing language — no contract was formed and the charge is unenforceable. The BPA Code of Practice (for members of the British Parking Association) and the IPC Code of Practice both set minimum standards for signage that operators must meet.',
  ],
  rightsTitle: 'Your rights when challenging a private parking charge',
  rights: [
    'Right to a free independent appeal via POPLA (for BPA members) or IAS (for IPC members)',
    'Registered keeper is only liable if the operator followed the exact Protection of Freedoms Act 2012 process',
    'Right to see all evidence: ANPR entry and exit images, photographs of signage, and a copy of the Notice to Keeper',
    'Charge is unenforceable if signage at the entrance was inadequate or contract terms were not clearly communicated',
    'During an appeal, the charge is frozen at its current level and cannot be escalated',
    'Private parking charges are civil contract disputes — they are not criminal fines and cannot be enforced as such',
    'Any County Court claim can be defended — do not ignore court papers if received',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe the situation',
      description: 'When and where the charge was issued, who was driving, and your grounds for appeal — signage, PoFA failure, payment machine fault, or mitigating circumstances.',
    },
    {
      step: '2',
      title: 'AI writes your appeal',
      description: 'Formal appeal letter citing PoFA 2012, the relevant BPA or IPC Code of Practice, and the specific grounds that apply to your charge.',
    },
    {
      step: '3',
      title: 'Submit your appeal',
      description: 'Send to the parking company first. If they reject it, submit to POPLA or IAS for an independent review. Both are free.',
    },
  ],
  faqs: [
    {
      q: 'Should I appeal even if I was technically in breach?',
      a: "Yes, in most cases. Even if you overstayed or parked in a restricted area, the charge may still be unenforceable if signage was inadequate, if PoFA was not followed correctly, or if the amount claimed is a disproportionate penalty rather than a genuine pre-estimate of loss. Many charges are cancelled at the internal appeal stage.",
    },
    {
      q: 'What is POPLA?',
      a: 'POPLA (Parking on Private Land Appeals) is the independent appeals service for parking operators that are members of the British Parking Association. It is free for motorists to use and its decisions are binding on BPA members. You can only go to POPLA after the operator has rejected your internal appeal.',
    },
    {
      q: 'Does appealing prevent the charge from increasing?',
      a: 'Yes. Once you submit a formal appeal, the charge is frozen at the current level while the appeal is pending. Operators cannot escalate to the higher rate during a live appeal. Keep records of when you submitted your appeal.',
    },
    {
      q: 'What if the parking company takes me to court?',
      a: 'Private parking companies do occasionally issue County Court claims. Do not ignore court documents — respond promptly and seek help from Citizens Advice. Many County Court claims are defended successfully, particularly where PoFA was not followed or signage was inadequate. The small claims track also limits legal costs.',
    },
  ],
  finalCtaTitle: 'Ready to appeal your parking charge?',
  finalCtaSubtitle: 'Generate a formal appeal letter citing UK parking law in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Appeal a Parking Charge Notice UK | Free Letter | Paybacker',
  description:
    'Appeal a private parking charge notice using the Protection of Freedoms Act 2012. Free appeal letter generator. Over 60% of appeals succeed. Works for POPLA and IAS appeals.',
  openGraph: {
    title: 'How to Appeal a Parking Charge Notice UK | Free Letter',
    description:
      'Appeal a private parking charge using the Protection of Freedoms Act 2012. Free letter generator. Over 60% of appeals succeed.',
    url: 'https://paybacker.co.uk/parking-appeal',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/parking-appeal' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
