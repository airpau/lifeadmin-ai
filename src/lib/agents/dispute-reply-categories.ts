/**
 * Pure category-detection helpers for the dispute-reply engine.
 *
 * Extracted from `dispute-reply-engine.ts` so it can be unit-tested
 * without dragging in the engine's Anthropic / Supabase dependency
 * chain. The engine re-exports `detectReplyCategories` from here.
 */

const ISSUE_TYPE_TO_CATEGORY: Record<string, string[]> = {
  energy_dispute: ['energy', 'general'],
  broadband_complaint: ['broadband', 'general'],
  flight_compensation: ['travel', 'general'],
  parking_appeal: ['parking', 'general'],
  debt_dispute: ['debt', 'finance', 'general'],
  refund_request: ['general', 'finance'],
  hmrc_tax_rebate: ['hmrc', 'general'],
  council_tax_band: ['council_tax', 'general'],
  dvla_vehicle: ['dvla', 'general'],
  nhs_complaint: ['nhs', 'general'],
  gym_membership: ['gym', 'general'],
  insurance_dispute: ['insurance', 'finance', 'general'],
};

const PROVIDER_TYPE_TO_CATEGORY: Record<string, string[]> = {
  broadband: ['broadband', 'general'],
  energy: ['energy', 'general'],
  mobile: ['broadband', 'general'],
  insurance: ['insurance', 'general'],
  travel: ['travel', 'general'],
  parking: ['parking', 'general'],
  finance: ['finance', 'general'],
  debt: ['debt', 'finance', 'general'],
  government: ['council_tax', 'hmrc', 'dvla', 'general'],
  nhs: ['nhs', 'general'],
  gym: ['gym', 'general'],
  general: ['general'],
};

export function detectReplyCategories(args: {
  issueType?: string | null;
  providerType?: string | null;
  scenarioText: string;
}): string[] {
  let categories =
    ISSUE_TYPE_TO_CATEGORY[args.issueType || ''] ||
    (args.providerType ? PROVIDER_TYPE_TO_CATEGORY[args.providerType] : null) ||
    ['general'];

  const s = args.scenarioText.toLowerCase();
  const augment = (cat: string, re: RegExp) => {
    if (re.test(s) && !categories.includes(cat)) categories = [...categories, cat];
  };

  augment(
    'finance',
    /\b(paypal|klarna|clearpay|chargeback|section\s*75|s\.?\s*75|cca\s*1974|credit\s*card|debit\s*card|direct\s*debit|standing\s*order|unauthori[sz]ed\s*(payment|charge|transaction|debit)|payment\s*(taken|removed|deducted)|automatic\s*(charge|renewal|payment)|recurring\s*(charge|payment))\b/,
  );
  augment(
    'travel',
    /\b(flight|airline|cancel(?:l?ed)?\s*(my\s+)?flight|delay(?:ed)?\s*(my\s+)?flight|baggage|ryanair|easyjet|jet2|tui|british\s*airways|wizz\s*air|caa\b|uk261|eu261)\b/,
  );
  augment(
    'energy',
    /\b(energy|gas|electric(ity)?|ofgem|british\s*gas|octopus(\s*energy)?|edf|ovo|e\.?on|sse\b|scottish\s*power|smart\s*meter|back-?bill)\b/,
  );
  augment(
    'broadband',
    /\b(broadband|mobile\s*(?:contract|provider|tariff|bill)?|isp|ofcom|talktalk|mid-?contract\s*(price\s*rise|increase))\b/,
  );
  augment(
    'debt',
    /\b(debt\s*(claim|collection)|bailiff|enforcement\s*officer|statute\s*barred|lowell|cabot|intrum|limitation\s*act)\b/,
  );
  augment('insurance', /\b(insurance|insurer|claim\s*declined|underwriter|policy\s*(claim|wording|exclusion))\b/);
  augment('rail', /\b(train|rail|delay\s*repay|tfl\b|avanti|lner|gwr|northern\s*trains?|scotrail)\b/);

  return categories;
}
