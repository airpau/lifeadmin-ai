// src/lib/yapily/sync-scheduler.ts
//
// Staggering for the automatic bank refresh.
//
// Added 2026-08-21 after Migle Ivanauskaite's (Yapily) pre-launch
// review. The problem she raised:
//
//   The refresh cron fired at fixed clock times and iterated every
//   active connection back to back. Every user, and every one of a
//   single user's banks, hit Yapily inside the same few seconds. Three
//   consequences, in ascending order of how much they hurt:
//
//     1. Burst load against Yapily's 30 req/sec ceiling. Fine at our
//        current volume, a hard wall at any real scale, and the sort of
//        traffic shape that gets an application rate-limited.
//     2. Concurrent calls carrying the SAME consent token. Yapily
//        returns spurious 400s for these.
//     3. Worst: repeated simultaneous use of one consent token can trip
//        consent expiry, which drops the user's bank connection and
//        forces a full reconnect. A load-shaping problem turning into a
//        user-visible outage.
//
// The fix is not jitter inside the run. Vercel's maxDuration caps a
// function at 60s, so in-run sleeping can only spread calls across
// about a minute and everyone still starts at the same clock time.
// Instead each connection carries its own offset within the refresh
// cycle and its own next_sync_at; the cron runs frequently and only
// picks up what is actually due.

/**
 * Length of one refresh cycle. Migle's guidance was "every four hours"
 * as the default cadence.
 *
 * Worth knowing: the EBA RTS (Article 31(5)) caps UNATTENDED AIS access
 * at four calls per 24 hours unless the bank agrees otherwise. Yapily's
 * data-restrictions doc says this "will typically apply to EU banks but
 * not UK", and we are UK-only, so 6 cycles a day is acceptable here.
 * If Paybacker ever adds EU institutions, this constant is the first
 * thing that has to change — 360 (6 hours) would put us at exactly 4.
 */
export const SYNC_INTERVAL_MINUTES = 240;

/**
 * Target gap between two connections belonging to the SAME user.
 *
 * Migle asked for "at least an hour between calls for different bank
 * connections". 75 minutes gives headroom over that hour, and divides
 * the 240-minute cycle into three distinct slots before it wraps —
 * which covers Free (2 banks) and Essential (3 banks) exactly. Pro is
 * uncapped, so a user with more than three banks will wrap around and
 * start reusing slots; the modulo below keeps the wrap even rather than
 * piling everyone onto slot 0.
 */
export const MIN_SPACING_MINUTES = 75;

/**
 * Deterministic 0..(SYNC_INTERVAL_MINUTES-1) starting point for a user.
 *
 * Derived from the user id rather than random so it is stable across
 * redeploys and reproducible in tests, and so a connection always
 * refreshes at about the same times of day (predictable for the user,
 * and it keeps our traffic profile flat rather than reshuffling nightly).
 *
 * Hashing the USER rather than the CONNECTION matters: it means two
 * different users' first connections land on different minutes, so we
 * don't recreate the same synchronised burst one level down.
 */
export function userBaseOffsetMinutes(userId: string): number {
  // FNV-1a. Chosen for being short, dependency-free and well spread over
  // short ASCII strings like a UUID. Not security-sensitive.
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 0 forces an unsigned 32-bit read; without it a negative hash
  // produces a negative modulo and an offset outside the valid range.
  return (hash >>> 0) % SYNC_INTERVAL_MINUTES;
}

/**
 * Offset for the Nth connection (0-indexed) belonging to a user.
 *
 * `connectionIndex` should be the count of the user's existing
 * connections at the time this one is created, so their banks fan out
 * across the cycle instead of stacking on one minute.
 */
export function assignSyncOffsetMinutes(
  userId: string,
  connectionIndex: number,
): number {
  const base = userBaseOffsetMinutes(userId);
  const spaced = base + Math.max(0, connectionIndex) * MIN_SPACING_MINUTES;
  return spaced % SYNC_INTERVAL_MINUTES;
}

/**
 * The next moment at or after `from` that falls on this connection's
 * offset within the cycle.
 *
 * Cycles are anchored to the Unix epoch rather than to "now", so the
 * schedule is absolute: it does not drift forward every time a run is
 * slightly late, and two connections with the same offset genuinely
 * collide (making the spacing above meaningful) rather than being
 * accidentally separated by run latency.
 */
export function computeNextSyncAt(
  offsetMinutes: number,
  from: Date = new Date(),
): Date {
  const cycleMs = SYNC_INTERVAL_MINUTES * 60_000;
  const offsetMs = (((offsetMinutes % SYNC_INTERVAL_MINUTES) + SYNC_INTERVAL_MINUTES) %
    SYNC_INTERVAL_MINUTES) * 60_000;

  const cycleStart = Math.floor(from.getTime() / cycleMs) * cycleMs;
  let next = cycleStart + offsetMs;
  // Strictly in the future: `<=` not `<`, so a run that happens exactly
  // on the offset schedules the following cycle rather than re-arming
  // itself for the same instant and looping.
  if (next <= from.getTime()) next += cycleMs;
  return new Date(next);
}

/**
 * How long a claim may sit before another run is allowed to steal it.
 *
 * sync_claimed_at is set when a run picks a connection up and cleared
 * when it finishes. If a function times out mid-sync the claim would
 * otherwise pin that connection forever, so anything older than this is
 * treated as abandoned. Set comfortably above the cron's maxDuration.
 */
export const SYNC_CLAIM_STALE_MINUTES = 15;

/** ISO timestamp before which an outstanding claim counts as stale. */
export function staleClaimCutoff(from: Date = new Date()): string {
  return new Date(from.getTime() - SYNC_CLAIM_STALE_MINUTES * 60_000).toISOString();
}
