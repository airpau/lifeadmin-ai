// TrueLayer was decommissioned 2026-04-27. Yapily is the only Open
// Banking provider going forward. Helpers are kept as constants for
// any code that still wants to gate behaviour on the provider name —
// the gate is now always-on for Yapily.
export const OPEN_BANKING_PROVIDER = 'yapily' as const;
export const isTrueLayer = false;
export const isYapily = true;
