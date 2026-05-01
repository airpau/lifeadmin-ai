/**
 * Merchant + dispute-type normalisation for the outcome dataset.
 * Pure helpers — keep stable so historical stats join correctly.
 */

const INDUSTRY_BY_KEYWORD: Array<{ kw: RegExp; industry: string }> = [
  { kw: /(octopus|british gas|edf|eon|e\.on|ovo|bulb|scottish power|sse|shell energy|good energy|utilita)/i, industry: 'energy' },
  { kw: /(bt|virgin media|sky|talktalk|now broadband|plusnet|vodafone broadband|hyperoptic)/i, industry: 'broadband' },
  { kw: /(o2|ee|three|vodafone|giffgaff|tesco mobile|smarty|id mobile|lebara|lyca)/i, industry: 'mobile' },
  { kw: /(hsbc|barclays|natwest|lloyds|halifax|santander|monzo|starling|first direct|nationwide|metro bank|tsb)/i, industry: 'banking' },
  { kw: /(ryanair|easyjet|british airways|jet2|tui|wizz|air france|klm|lufthansa|virgin atlantic)/i, industry: 'airline' },
  { kw: /(amazon|ebay|argos|currys|john lewis|asos|next|very|boohoo|shein)/i, industry: 'retail' },
  { kw: /(aviva|admiral|direct line|churchill|hastings|axa|lv=|saga|more th>n|esure)/i, industry: 'insurance' },
  { kw: /(thames water|severn trent|anglian water|yorkshire water|south west water|united utilities|wessex water)/i, industry: 'water' },
  { kw: /(council|borough|hmrc|dvla|nhs|valuation office|voa)/i, industry: 'government' },
  { kw: /(parking|euro car parks|parkingeye|smart parking|ukpc|civil enforcement)/i, industry: 'parking' },
  { kw: /(klarna|clearpay|paypal credit|zilch)/i, industry: 'finance' },
];

export function normaliseMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|uk|gb|group|holdings|services|company|co\.?)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.replace(/\s+/g, '_').slice(0, 80);
}

export function inferIndustry(merchantRaw: string | null | undefined): string | null {
  if (!merchantRaw) return null;
  const lower = merchantRaw.toLowerCase();
  for (const { kw, industry } of INDUSTRY_BY_KEYWORD) {
    if (kw.test(lower)) return industry;
  }
  return null;
}

const DISPUTE_TYPE_BY_KEYWORD: Array<{ kw: RegExp; type: string }> = [
  { kw: /(back ?bill|estimated bill|billing error|overcharg|wrong reading|usage)/i, type: 'energy_billing' },
  { kw: /(broadband speed|slow|outage|connection)/i, type: 'broadband_speed' },
  { kw: /(mid[- ]contract|price increase|price rise)/i, type: 'price_increase' },
  { kw: /(flight|delay|cancell|baggage|denied boarding)/i, type: 'flight_compensation' },
  { kw: /(parking|pcn|charge notice)/i, type: 'parking_appeal' },
  { kw: /(refund|faulty|return|warranty|repair)/i, type: 'refund_request' },
  { kw: /(debt|cca|statute barred|collection)/i, type: 'debt_dispute' },
  { kw: /(council tax|band)/i, type: 'council_tax_band' },
  { kw: /(cancel|early termination)/i, type: 'cancellation' },
];

export function inferDisputeType(
  issueType: string | null | undefined,
  issueSummary: string | null | undefined,
): string | null {
  const blob = `${issueType ?? ''} ${issueSummary ?? ''}`.toLowerCase();
  if (!blob.trim()) return null;
  for (const { kw, type } of DISPUTE_TYPE_BY_KEYWORD) {
    if (kw.test(blob)) return type;
  }
  return issueType ? issueType.toLowerCase().replace(/\s+/g, '_').slice(0, 60) : null;
}
