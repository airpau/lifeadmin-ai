/**
 * Registry of known UK supplier domains for the Deals & Switching module.
 * Maps domains to supplier metadata for deal lookups.
 */

export type SupplierCategory = 'energy' | 'broadband' | 'insurance' | 'mobile' | 'streaming' | 'other'

export interface SupplierInfo {
  name: string
  category: SupplierCategory
  domain: string
  dealsAvailable: boolean
  switchingUrl?: string
}

export const SUPPLIER_REGISTRY: SupplierInfo[] = [
  // Energy
  { name: 'SSE', category: 'energy', domain: 'sse.co.uk', dealsAvailable: true },
  { name: 'British Gas', category: 'energy', domain: 'britishgas.co.uk', dealsAvailable: true },
  { name: 'EDF Energy', category: 'energy', domain: 'edfenergy.com', dealsAvailable: true },
  { name: 'E.ON', category: 'energy', domain: 'eon.co.uk', dealsAvailable: true },
  { name: 'Octopus Energy', category: 'energy', domain: 'octopus.energy', dealsAvailable: true },
  { name: 'OVO Energy', category: 'energy', domain: 'ovo.energy', dealsAvailable: true },
  { name: 'Bulb', category: 'energy', domain: 'bulb.co.uk', dealsAvailable: true },

  // Broadband
  { name: 'Sky', category: 'broadband', domain: 'sky.com', dealsAvailable: true },
  { name: 'BT', category: 'broadband', domain: 'bt.com', dealsAvailable: true },
  { name: 'Virgin Media', category: 'broadband', domain: 'virginmedia.com', dealsAvailable: true },
  { name: 'TalkTalk', category: 'broadband', domain: 'talktalk.co.uk', dealsAvailable: true },
  { name: 'Plusnet', category: 'broadband', domain: 'plusnet.co.uk', dealsAvailable: true },

  // Mobile
  { name: 'EE', category: 'mobile', domain: 'ee.co.uk', dealsAvailable: true },
  { name: 'O2', category: 'mobile', domain: 'o2.co.uk', dealsAvailable: true },
  { name: 'Three', category: 'mobile', domain: 'three.co.uk', dealsAvailable: true },
  { name: 'Vodafone', category: 'mobile', domain: 'vodafone.co.uk', dealsAvailable: true },

  // Insurance
  { name: 'Aviva', category: 'insurance', domain: 'aviva.com', dealsAvailable: true },
  { name: 'LV=', category: 'insurance', domain: 'lv.com', dealsAvailable: true },
  { name: 'Admiral', category: 'insurance', domain: 'admiral.com', dealsAvailable: true },
  { name: 'Direct Line', category: 'insurance', domain: 'directline.com', dealsAvailable: true },

  // Comparison sites (don't show deals on these — they're already comparison sites)
  { name: 'Compare the Market', category: 'other', domain: 'comparethemarket.com', dealsAvailable: false },
  { name: 'MoneySupermarket', category: 'other', domain: 'moneysupermarket.com', dealsAvailable: false },
  { name: 'Confused.com', category: 'other', domain: 'confused.com', dealsAvailable: false },
  { name: 'uSwitch', category: 'other', domain: 'uswitch.com', dealsAvailable: false },
]

export function getSupplierByDomain(domain: string): SupplierInfo | undefined {
  const normalised = domain.replace(/^www\./, '').toLowerCase()
  return SUPPLIER_REGISTRY.find(s => normalised === s.domain || normalised.endsWith(`.${s.domain}`))
}

export function isKnownSupplier(domain: string): boolean {
  return getSupplierByDomain(domain) !== undefined
}
