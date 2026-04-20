import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

const ZEROED = {
  savedThisMonth: 0,
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
    // 1) Saved this calendar month — SQL aggregate avoids the 1000-row fetch limit
    supabase
      .from('verified_savings')
      .select('amount_saved.sum()')
      .gte('created_at', startOfMonth)
      .single(),

    // 2) Rolling 90d savings rows — per-user grouping done in Node.
    //    Limit raised to 10 000 to prevent silent truncation while the
    //    table is small; a GROUP BY RPC should replace this once row
    //    counts exceed that threshold.
    supabase
      .from('verified_savings')
      .select('user_id, amount_saved')
      .gte('created_at', ninetyDaysAgo)
      .limit(10000),

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

  // Surface query errors early — any failure means we must not apply
  // floors or present the numbers as trustworthy live data.
  if (monthSaved.error) console.error('[homepage-stats] monthSaved query failed', monthSaved.error);
  if (ninetyDaySaved.error) console.error('[homepage-stats] ninetyDaySaved query failed', ninetyDaySaved.error);
  if (subs.error) console.error('[homepage-stats] subs query failed', subs.error);
  if (founding.error) console.error('[homepage-stats] founding query failed', founding.error);

  const anyQueryError = !!(monthSaved.error || ninetyDaySaved.error || subs.error || founding.error);

  // Hero ticker — extract scalar from the SQL-aggregate response.
  // PostgREST returns { amount_saved: { sum: "..." } } for .sum() aggregates.
  const savedThisMonth = Number(
    (monthSaved.data as unknown as { amount_saved: { sum?: string | null } } | null)
      ?.amount_saved?.sum ?? 0,
  );

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

  // Founding members — apply trust floor ONLY when the query succeeded.
  // If founding.error is set, founding.count is null → treated as 0 →
  // without the guard the floor would fire and return 250 as if it were
  // live data, masking the real outage from consumers.
  const foundingMembersReal = founding.count ?? 0;
  const foundingMembersFloored = !founding.error && foundingMembersReal < FOUNDING_TRUST_FLOOR;
  const foundingMembers = foundingMembersFloored ? FOUNDING_TRUST_FLOOR : foundingMembersReal;

  // source values:
  //   'live'  — real data from Supabase, queries all succeeded
  //   'seed'  — all zeros (no users yet), queries all succeeded
  //   'error' — one or more queries failed; numbers are unreliable
  const allZero =
    savedThisMonth === 0 &&
    avgSavingsPerUser === 0 &&
    subscriptionsTracked === 0 &&
    foundingMembersReal === 0;

  const source = anyQueryError
    ? ('error' as const)
    : allZero
      ? ('seed' as const)
      : ('live' as const);

  return NextResponse.json({
    savedThisMonth: Math.round(savedThisMonth * 100) / 100,
    avgSavingsPerUser,
    subscriptionsTracked,
    foundingMembers,
    foundingMembersReal,
    foundingMembersFloored,
    asOf: now.toISOString(),
    source,
  });
}
