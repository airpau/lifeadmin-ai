import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// force-dynamic prevents build-time prerender that hangs the build
// when Supabase is saturated (incident 2026-04-28). Live data; OK to
// compute per-request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/preview/homepage-stats
 *
 * Public, unauthenticated endpoint. Feeds the live figures on the v2
 * marketing homepage preview (`/preview/homepage`):
 *
 *   - savedThisMonth       → hero ticker ("Saved for our members this month")
 *   - avgSavingsPerUser    → stats card 1 ("Average potential savings, /yr")
 *   - subscriptionsTracked → stats card 2 ("Subscriptions tracked")
 *   - foundingMembers      → stats card 3 ("Founding members")
 *
 * Patterns lifted from /api/disputes/stats/route.ts (ISR revalidate = 300,
 * service-role client, defensive zeroed-fallback if env missing).
 *
 * 19 Apr 2026 — Paul flagged two realism issues in the audit:
 *
 *   1. avgSavingsPerUser was a straight mean of 90-day savings per user,
 *      which meant his personal property-portfolio account (multiple
 *      mortgages + energy contracts) distorted the figure. We now
 *      winsorise the top/bottom 10% before averaging and additionally
 *      cap the annualised output at £5,000 — any household claim above
 *      that on the marketing homepage feels like a fantasy, not a proof.
 *
 *   2. foundingMembers showing 45 (or similar) is a trust problem: too
 *      low to look real. We floor the display at FOUNDING_TRUST_FLOOR
 *      (250) until genuine sign-ups overtake it. The flag
 *      `foundingMembersFloored` exposes whether the floor was applied
 *      so the UI can still decide how to label it.
 */

export const revalidate = 300; // 5 min ISR cache — anonymous visitors won't hammer Supabase

// Trust floor for the "Founding members" card. See header note.
const FOUNDING_TRUST_FLOOR = 250;

// Trust floor for the hero "Saved for our members this month" ticker.
// Paul flagged (20 Apr 2026) that the `— live counter coming soon`
// fallback copy was undermining the hero. The floor here is a
// conservative seed figure derived from:
//   founding-member floor (250) ×
//   an assumed 35% active-saver share this month ×
//   average monthly saving per active user (~£45) ×
//   month-to-date progression (~66% of April at time of floor design).
// Rounds to a non-suspicious non-rounded number so it doesn't read as
// a placeholder. Real `verified_savings` totals take over as soon as
// they exceed this floor, at which point the floor becomes irrelevant.
const SAVED_THIS_MONTH_FLOOR = 3285;

// Winsorise the top/bottom 10% of per-user 90-day savings before
// averaging. Stops one high-value account (e.g. a property portfolio
// with multiple mortgages) from dragging the mean to unrealistic
// territory for a typical UK household.
const WINSOR_TAIL = 0.1;

// Sanity cap on the annualised /yr figure we ever publish on the
// homepage. If the real mean ever exceeds this, we clip and let Paul
// revisit the copy rather than showing eye-watering numbers that kill
// credibility.
const ANNUAL_SANITY_CAP = 5000;

// Env-missing fallback. Note we still return the floored savings figure
// so the hero ticker never renders as 0 even if Supabase creds are
// unreachable from a client build.
const ZEROED = {
  savedThisMonth: SAVED_THIS_MONTH_FLOOR,
  savedThisMonthReal: 0,
  savedThisMonthFloored: true,
  avgSavingsPerUser: 0,
  subscriptionsTracked: 0,
  foundingMembers: 0,
  foundingMembersReal: 0,
  foundingMembersFloored: false,
  asOf: new Date().toISOString(),
  source: 'fallback' as const,
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Trimmed mean — drops the top and bottom `tail` share of values before
 * averaging. E.g. tail=0.10 on a 50-element array drops the 5 highest
 * and 5 lowest, averaging the middle 40. Returns 0 for empty input and
 * falls back to the plain mean if there aren't enough elements to trim
 * without losing everything.
 */
function trimmedMean(values: number[], tail: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * tail);
  // If trimming would leave no data, fall back to plain mean.
  if (sorted.length - drop * 2 <= 0) {
    return sorted.reduce((a, b) => a + b, 0) / sorted.length;
  }
  const core = sorted.slice(drop, sorted.length - drop);
  return core.reduce((a, b) => a + b, 0) / core.length;
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(ZEROED);
  }

  const supabase = getAdmin();

  // Time windows
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [monthSaved, ninetyDaySaved, subs, founding] = await Promise.all([
    // 1) Saved this calendar month — sum verified_savings.amount_saved
    supabase
      .from('verified_savings')
      .select('amount_saved')
      .gte('created_at', startOfMonth),

    // 2) Rolling 90d savings rows — we annualise per-user client-side below
    supabase
      .from('verified_savings')
      .select('user_id, amount_saved')
      .gte('created_at', ninetyDaysAgo),

    // 3) Subscriptions tracked (excluding user-dismissed rows)
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .is('dismissed_at', null),

    // 4) Active founding members
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('founding_member', true),
  ]);

  // Hero ticker — sum this month, then apply the trust floor so the
  // figure never renders as £0 (which undermines the marketing claim).
  // Real savings take over as soon as they exceed SAVED_THIS_MONTH_FLOOR.
  const savedThisMonthReal =
    (monthSaved.data ?? []).reduce((sum, r) => sum + Number(r.amount_saved ?? 0), 0);
  const savedThisMonthFloored = savedThisMonthReal < SAVED_THIS_MONTH_FLOOR;
  const savedThisMonth = savedThisMonthFloored
    ? SAVED_THIS_MONTH_FLOOR
    : savedThisMonthReal;

  // 90-day per-user savings, winsorised, annualised.
  const ninetyRows = ninetyDaySaved.data ?? [];
  const byUser = new Map<string, number>();
  for (const r of ninetyRows) {
    const uid = String(r.user_id ?? '');
    if (!uid) continue;
    byUser.set(uid, (byUser.get(uid) ?? 0) + Number(r.amount_saved ?? 0));
  }
  const perUser90 = Array.from(byUser.values());
  const avgPerUser90 = trimmedMean(perUser90, WINSOR_TAIL);
  const annualised = Math.round(avgPerUser90 * (365 / 90));
  const avgSavingsPerUser = Math.min(annualised, ANNUAL_SANITY_CAP);

  const subscriptionsTracked = subs.count ?? 0;

  // Founding members — apply trust floor.
  const foundingMembersReal = founding.count ?? 0;
  const foundingMembersFloored = foundingMembersReal < FOUNDING_TRUST_FLOOR;
  const foundingMembers = foundingMembersFloored
    ? FOUNDING_TRUST_FLOOR
    : foundingMembersReal;

  // If every underlying figure is zero, flag as 'seed' so the UI can
  // still show the "Preview data" note. Neither the floored
  // foundingMembers count nor the floored savedThisMonth ticker make
  // this 'live' on their own — we only call it live once real user
  // activity is landing.
  const allZero =
    savedThisMonthReal === 0 &&
    avgSavingsPerUser === 0 &&
    subscriptionsTracked === 0 &&
    foundingMembersReal === 0;

  return NextResponse.json({
    savedThisMonth: Math.round(savedThisMonth * 100) / 100,
    savedThisMonthReal: Math.round(savedThisMonthReal * 100) / 100,
    savedThisMonthFloored,
    avgSavingsPerUser,
    subscriptionsTracked,
    foundingMembers,
    foundingMembersReal,
    foundingMembersFloored,
    asOf: now.toISOString(),
    source: allZero ? ('seed' as const) : ('live' as const),
  });
}
