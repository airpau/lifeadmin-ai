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
// We cannot see inside HSBC, so we cannot say which part of the burst is
// fatal (the refused calls, the concurrency with the initial sync, or
// the restricted endpoints themselves). We do not need to. For a bank on
// this list the consent's first hour goes back to what it was when HSBC
// consents lived: transactions only, one call at a time.
//
// The cost is that direct debits, standing orders and scheduled
// payments are not re-harvested for these banks. What was harvested
// before stays in upcoming_endpoint_snapshots and keeps being projected,
// and scheduled payments still arrive as future-dated rows on the
// ordinary transaction feed (see FUTURE_HORIZON_DAYS in sync-window.ts).
// A bank feed that lasts an hour is worth nothing; a slightly staler
// direct debit list is a fair price for one that lasts 90 days.
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
