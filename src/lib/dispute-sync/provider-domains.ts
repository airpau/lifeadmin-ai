/**
 * Provider → email-domain lookups used by the Watchdog dispute-email-sync feature.
 *
 * This file is intentionally separate from src/lib/provider-match.ts so that
 * email-matching concerns don't leak into the broader provider normalisation
 * layer used by subscriptions, disputes, etc.
 *
 * When extending this list, prefer top-level domains (onestream.co.uk) over
 * subdomains (mail.onestream.co.uk) — the lookup is a suffix match.
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §3
 */

import { matchProviderName } from '../provider-match';

/**
 * Map of provider_name key (from provider-match.ts) to the set of email domains
 * that provider is known to send from. A provider can have multiple domains:
 * customer-service, no-reply, billing, etc.
 */
const PROVIDER_DOMAINS: Record<string, string[]> = {
  // --- Energy ---
  british_gas: ['britishgas.co.uk', 'britishgas.com', 'centrica.com'],
  edf: ['edfenergy.com', 'edf-online.co.uk'],
  eon: ['eonenergy.com', 'eon-uk.com', 'eonnext.com'],
  octopus_energy: ['octopus.energy', 'octopusenergy.com'],
  ovo_energy: ['ovoenergy.com', 'ovo-energy.com'],
  scottish_power: ['scottishpower.co.uk', 'spenergynetworks.co.uk'],
  shell_energy: ['shellenergy.co.uk', 'shell.com'],
  bulb: ['bulb.co.uk'],

  // --- Broadband / Telecoms ---
  bt: ['bt.com', 'btplc.com', 'btconnect.com'],
  sky: ['sky.com', 'sky.co.uk'],
  virgin_media: ['virginmedia.com', 'virginmedia.co.uk', 'virginmediao2.co.uk'],
  talktalk: ['talktalk.co.uk', 'talktalkgroup.com'],
  plusnet: ['plus.net', 'plusnet.net'],
  ee: ['ee.co.uk', 'ee.com'],
  hyperoptic: ['hyperoptic.com'],
  community_fibre: ['communityfibre.co.uk'],
  onestream: ['onestream.co.uk'],

  // --- Mobile ---
  ee_mobile: ['ee.co.uk'],
  three: ['three.co.uk'],
  vodafone: ['vodafone.co.uk', 'vodafone.com'],
  o2: ['o2.co.uk'],
  tesco_mobile: ['tescomobile.com'],
  giffgaff: ['giffgaff.com'],

  // --- Finance ---
  barclays: ['barclays.co.uk', 'barclays.com'],
  hsbc: ['hsbc.co.uk', 'hsbc.com'],
  lloyds: ['lloydsbank.com', 'lloydsbank.co.uk'],
  natwest: ['natwest.com', 'natwestgroup.com'],
  nationwide: ['nationwide.co.uk'],

  // --- Insurance ---
  aviva: ['aviva.co.uk', 'aviva.com'],
  direct_line: ['directline.com'],
  admiral: ['admiral.com', 'admiralgroup.co.uk'],
  lv: ['lv.com'],

  // --- Travel ---
  ryanair: ['ryanair.com'],
  easyjet: ['easyjet.com'],

  // --- Smart-home / IoT (added 2026-04-28 — Paul's Nuki dispute) ---
  nuki: ['nuki.io', 'nuki.com'],
};

/**
 * Get the list of domains known to be used by the given provider name.
 * The provider name is fuzzy-matched via matchProviderName() first.
 */
export function domainsForProvider(providerName: string): string[] {
  if (!providerName) return [];
  const key = matchProviderName(providerName);
  if (key && PROVIDER_DOMAINS[key]) return PROVIDER_DOMAINS[key];

  // Last-resort guess: the provider name lower-cased with no spaces + co.uk
  // (e.g. "OneStream" -> "onestream.co.uk"). Only used when no explicit
  // mapping exists, and flagged as low-confidence by callers.
  const guess = providerName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (guess.length >= 3) return [`${guess}.co.uk`, `${guess}.com`];
  return [];
}

/**
 * Check if the given email address (or bare domain) is plausibly from the
 * given provider.
 *
 * Accepts "support@onestream.co.uk" or "onestream.co.uk".
 * Match is case-insensitive suffix match, so "noreply@mail.onestream.co.uk"
 * matches "onestream.co.uk".
 */
export function addressMatchesProvider(address: string, providerName: string): boolean {
  if (!address || !providerName) return false;
  const rawDomain = address.includes('@') ? address.split('@')[1] : address;
  const domain = rawDomain.toLowerCase().trim();
  const candidates = domainsForProvider(providerName);
  return candidates.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Extract the bare domain from an email address.
 * "Support <help@onestream.co.uk>" -> "onestream.co.uk"
 */
export function extractDomain(address: string): string | null {
  if (!address) return null;
  const match = address.match(/@([^\s>]+)/);
  if (!match) return null;
  return match[1].toLowerCase().trim().replace(/[>.]$/, '');
}

/**
 * Flag indicating whether we have a high-confidence, explicit domain mapping
 * for this provider (as opposed to the heuristic guess fallback).
 */
export function hasExplicitDomains(providerName: string): boolean {
  if (!providerName) return false;
  const key = matchProviderName(providerName);
  return !!(key && PROVIDER_DOMAINS[key]);
}
