// src/lib/yapily/institution-policy.ts
//
// Per-institution call policy for a freshly authorised consent.
//
// Why this exists
// ───────────────
// HSBC Business consents stopped surviving their first token refresh on
// 14 May 2026 and have not survived one since. The evidence, all from
// bank_sync_log:
//
//   • Two HSBC Business consents created BEFORE that date lived for
//     days, refreshing every 3 to 6 hours (7 to 11 May, 14 to 16 May).
//   • Every HSBC Business consent created AFTER it (18 May, then every
//     reconnect from 15 Aug to 1 Oct) worked for its first hour and
//     then failed for good with "We didn't managed to
//     fix this unauthorized by refreshing the authorization credential".
//     Alive at +53 minutes, dead by +77, every time. That is one access
//     token lifetime: the token issued at authorisation works, and the
//     first refresh does not.
//   • NatWest, on identical code, on the same Paybacker user, has not
//     failed once (224 consecutive successful syncs).
//
// What changed on 14 May is commit 9e6f2ad3: the callback started
// kicking /api/cron/sync-upcoming the moment a bank is connected. That
// fires scheduled-payments, periodic-payments and direct-debits for
// EVERY account on the brand new consent, back to back with no spacing,
// in parallel with the initial transaction sync. On NatWest every one
// of those calls succeeds. On HSBC Business most of them fail:
// upcoming_endpoint_snapshots shows the current account answering all
// three, the savings account answering one, and both credit cards
// answering none, so eight of twelve calls error on every single
// connect. Neither of the two consents that survived ever saw that
// burst.
//
// RESULT OF THE FIRST TEST, 3 Oct 2026. Removing the burst was not
// enough on its own. The first reconnect after this module shipped made
// seven calls in total (hosted consent, /accounts, /consents, then four
// spaced incremental transaction requests), every one of them
// successful, then nothing for 68 minutes, and the first scheduled sync
// still failed with the same refresh error (consent bb9dfa60, tracingId
// 6ac05e3c761945853a6a96d83e2ab8c9). So the burst is not the whole
// story, and a clean reproduction now exists for Yapily.
//
// What that leaves, from the same log:
//
//   feature scope   burst at connect   outcome
//   six named       no                 lived for days   (7 May, 14 May)
//   six named       yes                died at ~1 hour  (18 May, 15 Aug)
//   everything      yes                died at ~1 hour  (21 Aug to 1 Oct)
//   everything      no                 died at ~1 hour  (3 Oct)
//
// The only combination HSBC has ever tolerated is the top row. Until
// 21 Aug every consent named six feature scopes; since then we have
// sent none, which makes Yapily request everything the bank supports,
// and for HSBC that adds IDENTITY. So for a bank on this list we now do
// both things the surviving consents did: no burst (below) and the same
// six named scopes (GENTLE_FEATURE_SCOPE).
//
// The other explanation that fits every row is that something changed
// on the HSBC or Yapily side around 16 May and nothing we send matters.
// The log cannot separate the two. One reconnect with both conditions
// restored can: if that consent also dies at an hour, this is not ours
// to fix and it goes to Yapily.
//
// The cost of the gentle list is that direct debits, standing orders
// and scheduled payments are not re-harvested for these banks. What was
// harvested before stays in upcoming_endpoint_snapshots and keeps being
// projected, and scheduled payments still arrive as future-dated rows
// on the ordinary transaction feed (see FUTURE_HORIZON_DAYS in
// sync-window.ts). A bank feed that lasts an hour is worth nothing; a
// slightly staler direct debit list is a fair price for one that lasts
// 90 days.
//
// Kept dependency-free so it can be unit-tested with `node --test`.

/**
 * Institution id prefixes whose consents must not receive the
 * once-per-consent "restricted" endpoints (scheduled-payments,
 * periodic-payments, direct-debits) or any parallel call burst.
 *
 * Prefix match, so `hsbc` covers hsbc_uk, hsbcbusiness_uk and
 * hsbc_kinetic: they share HSBC's Open Banking platform, and a personal
 * HSBC user losing their feed every hour is not a risk worth taking to
 * find out whether the personal brand behaves differently.
 */
export const DEFAULT_GENTLE_INSTITUTION_PREFIXES: readonly string[] = ['hsbc'];

/**
 * Resolves the active prefix list.
 *
 * YAPILY_GENTLE_INSTITUTIONS overrides the default without a deploy:
 *   unset / empty          → the default list above
 *   "none"                 → no institution is treated gently
 *   "hsbc,barclays"        → exactly these prefixes
 *
 * The override exists so the restricted endpoints can be re-enabled for
 * HSBC as a deliberate, observed experiment once the feed has proven
 * stable, rather than by reverting this module.
 */
export function gentleInstitutionPrefixes(
  envValue: string | undefined = process.env.YAPILY_GENTLE_INSTITUTIONS,
): readonly string[] {
  const raw = (envValue ?? '').trim().toLowerCase();
  if (!raw) return DEFAULT_GENTLE_INSTITUTION_PREFIXES;
  if (raw === 'none') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * True when this institution's consents must be handled gently: no
 * restricted-endpoint harvest, no parallel calls, spaced requests.
 *
 * An unknown institution (null, undefined, empty) is NOT gentle. The
 * callback always resolves the institution before it reaches this
 * check, and treating "unknown" as gentle would silently switch the
 * upcoming-payments harvest off for every bank the moment a lookup
 * failed.
 */
export function isGentleInstitution(
  institutionId: string | null | undefined,
  envValue: string | undefined = process.env.YAPILY_GENTLE_INSTITUTIONS,
): boolean {
  const id = (institutionId ?? '').trim().toLowerCase();
  if (!id) return false;
  return gentleInstitutionPrefixes(envValue).some((prefix) => id.startsWith(prefix));
}

/**
 * The feature scopes named on every consent between 6 May and 21 Aug
 * 2026 (UPCOMING_FEATURE_SCOPES at the time), which is the only
 * configuration an HSBC Business consent has survived under.
 *
 * Duplicated here rather than imported from ./upcoming so this module
 * stays dependency-free, and so a later edit to that list for other
 * reasons cannot silently change what HSBC is asked for.
 *
 * Yapily adds the base ACCOUNTS / ACCOUNT scopes itself, as it did in
 * May. What this leaves out compared with an unscoped HSBC consent is
 * IDENTITY, which nothing in the product reads.
 */
export const GENTLE_FEATURE_SCOPE: readonly string[] = [
  'ACCOUNT_SCHEDULED_PAYMENTS',
  'ACCOUNT_PERIODIC_PAYMENTS',
  'ACCOUNT_DIRECT_DEBITS',
  'ACCOUNT_TRANSACTIONS',
  'ACCOUNT_TRANSACTIONS_WITH_MERCHANT',
  'ACCOUNT_BALANCES',
];

/**
 * The featureScope to name when creating a consent, or undefined to
 * name none.
 *
 * Undefined is the rule (Migle Ivanauskaite, Yapily, 21 Aug 2026:
 * naming a scope makes it a hard requirement, so the authorisation
 * fails outright on a bank that does not implement it). A bank on the
 * gentle list is the one exception, and it is safe there for a specific
 * reason: this exact list authorised successfully at HSBC Business on
 * 7 May, 14 May, 18 May and 15 Aug 2026.
 *
 * Only reachable when we know the bank BEFORE the user leaves for
 * Yapily, that is on a deep link or a reconnect. A user who picks HSBC
 * inside Yapily's own bank picker still gets an unscoped consent,
 * because we do not learn their choice until the callback.
 */
export function consentFeatureScopeFor(
  institutionId: string | null | undefined,
  envValue: string | undefined = process.env.YAPILY_GENTLE_INSTITUTIONS,
): readonly string[] | undefined {
  return isGentleInstitution(institutionId, envValue) ? GENTLE_FEATURE_SCOPE : undefined;
}
