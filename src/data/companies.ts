export interface Company {
  slug: string;
  name: string;
  category: string;
  regulator: string;
  phone: string | null;
}

export const COMPANIES: Company[] = [
  { slug: 'british-gas', name: 'British Gas', category: 'energy', regulator: 'Ofgem', phone: '0333 202 9802' },
  { slug: 'bt-broadband', name: 'BT', category: 'broadband', regulator: 'Ofcom', phone: '0800 800 150' },
  { slug: 'sky', name: 'Sky', category: 'broadband-tv', regulator: 'Ofcom', phone: '0333 759 0000' },
  { slug: 'virgin-media', name: 'Virgin Media', category: 'broadband', regulator: 'Ofcom', phone: '0345 454 1111' },
  { slug: 'edf-energy', name: 'EDF Energy', category: 'energy', regulator: 'Ofgem', phone: '0333 200 5100' },
  { slug: 'vodafone', name: 'Vodafone', category: 'mobile', regulator: 'Ofcom', phone: '0333 304 0191' },
  { slug: 'o2', name: 'O2', category: 'mobile', regulator: 'Ofcom', phone: '0344 809 0202' },
  { slug: 'three', name: 'Three', category: 'mobile', regulator: 'Ofcom', phone: '0333 338 1001' },
  { slug: 'ee', name: 'EE', category: 'mobile', regulator: 'Ofcom', phone: '0800 956 6000' },
  { slug: 'amazon', name: 'Amazon', category: 'retail', regulator: 'Trading Standards', phone: '0800 279 7234' },
  { slug: 'netflix', name: 'Netflix', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'evri', name: 'Evri (Hermes)', category: 'delivery', regulator: 'Trading Standards', phone: null },
  { slug: 'dpd', name: 'DPD', category: 'delivery', regulator: 'Trading Standards', phone: '0121 275 0500' },
  { slug: 'pure-gym', name: 'PureGym', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'the-gym-group', name: 'The Gym Group', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'octopus-energy', name: 'Octopus Energy', category: 'energy', regulator: 'Ofgem', phone: '0808 164 1088' },
  { slug: 'ovo-energy', name: 'OVO Energy', category: 'energy', regulator: 'Ofgem', phone: '0330 303 5063' },
  { slug: 'utilita', name: 'Utilita', category: 'energy', regulator: 'Ofgem', phone: '0345 207 2000' },
  { slug: 'asos', name: 'ASOS', category: 'retail', regulator: 'Trading Standards', phone: null },
  { slug: 'royal-mail', name: 'Royal Mail', category: 'delivery', regulator: 'Ofcom', phone: '03457 740 740' },
];

export function getCompanyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}
