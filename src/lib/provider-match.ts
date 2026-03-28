import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fuzzy match a dispute/subscription provider name to provider_terms.
 * Handles case variants, brand changes, abbreviations.
 */

// Known aliases mapping to provider_terms.provider_name
const ALIASES: Record<string, string> = {
  // Energy
  'british gas': 'british_gas', 'bg': 'british_gas',
  'edf': 'edf', 'edf energy': 'edf',
  'eon': 'eon', 'e.on': 'eon', 'eon next': 'eon', 'e.on next': 'eon',
  'octopus': 'octopus_energy', 'octopus energy': 'octopus_energy',
  'ovo': 'ovo_energy', 'ovo energy': 'ovo_energy',
  'scottish power': 'scottish_power', 'sp energy': 'scottish_power',
  'shell energy': 'shell_energy', 'shell': 'shell_energy',
  'bulb': 'bulb', 'bulb energy': 'bulb',
  // Broadband
  'bt': 'bt', 'bt broadband': 'bt',
  'sky': 'sky', 'sky broadband': 'sky',
  'virgin media': 'virgin_media', 'virgin media o2': 'virgin_media', 'vmedia': 'virgin_media', 'virgin': 'virgin_media',
  'talktalk': 'talktalk', 'talk talk': 'talktalk',
  'plusnet': 'plusnet', 'plus net': 'plusnet',
  'ee': 'ee', 'ee broadband': 'ee',
  'hyperoptic': 'hyperoptic',
  'community fibre': 'community_fibre', 'communityfibre': 'community_fibre',
  // Mobile
  'ee mobile': 'ee_mobile',
  'three': 'three', '3': 'three', 'three mobile': 'three',
  'vodafone': 'vodafone',
  'o2': 'o2', 'o2 mobile': 'o2',
  'tesco mobile': 'tesco_mobile', 'tesco': 'tesco_mobile',
  'giffgaff': 'giffgaff', 'giff gaff': 'giffgaff',
  // Finance
  'barclays': 'barclays',
  'hsbc': 'hsbc',
  'lloyds': 'lloyds', 'lloyds bank': 'lloyds',
  'natwest': 'natwest',
  'nationwide': 'nationwide',
  // Insurance
  'aviva': 'aviva',
  'direct line': 'direct_line', 'directline': 'direct_line',
  'admiral': 'admiral',
  'lv': 'lv', 'lv=': 'lv',
  // Travel
  'ryanair': 'ryanair',
  'easyjet': 'easyjet', 'easy jet': 'easyjet',
};

/**
 * Match a provider name string to a provider_terms record.
 * Returns the provider_name key or null.
 */
export function matchProviderName(input: string): string | null {
  if (!input) return null;
  const normalised = input.toLowerCase().trim();

  // Direct alias match
  if (ALIASES[normalised]) return ALIASES[normalised];

  // Partial match: check if any alias is contained in the input
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (normalised.includes(alias) && alias.length >= 2) {
      return key;
    }
  }

  // Convert to provider_name format and try direct
  const asKey = normalised.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (Object.values(ALIASES).includes(asKey)) return asKey;

  return null;
}

/**
 * Fetch provider terms from DB by matching a dispute's provider_name.
 */
export async function getProviderTerms(supabase: SupabaseClient, providerName: string) {
  const matched = matchProviderName(providerName);
  if (!matched) return null;

  const { data } = await supabase
    .from('provider_terms')
    .select('*')
    .eq('provider_name', matched)
    .eq('active', true)
    .maybeSingle();

  return data;
}
