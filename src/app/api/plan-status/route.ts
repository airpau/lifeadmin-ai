/**
 * GET /api/plan-status
 *
 * Returns the user's current tier, the matrix of what their tier
 * allows, and where they currently stand on each axis. Powers the
 * over-limit banner + Pro-feature locks across the dashboard.
 *
 * Note: this is read-only diagnostic data. It does not enforce
 * limits — that happens at the connect/create endpoints. A user
 * who is "over limit" keeps using their existing banks/spaces/etc.
 * unaffected.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveTier, PLAN_LIMITS } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function over(usage: number, limit: number | null): boolean {
  if (limit === null) return false;
  return usage > limit;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = await getEffectiveTier(user.id);
  const limits = PLAN_LIMITS[tier];

  const [banksRes, emailsRes, spacesRes] = await Promise.all([
    supabase
      .from('bank_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('email_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('account_spaces')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const banks = banksRes.count ?? 0;
  const emails = emailsRes.count ?? 0;
  const spaces = spacesRes.count ?? 0;

  const status = {
    tier,
    limits: {
      maxBanks: limits.maxBanks,
      maxEmails: limits.maxEmails,
      maxSpaces: limits.maxSpaces,
    },
    usage: {
      banks,
      emails,
      spaces,
    },
    overLimit: {
      banks: over(banks, limits.maxBanks),
      emails: over(emails, limits.maxEmails),
      spaces: over(spaces, limits.maxSpaces),
    },
    features: {
      topMerchants: limits.features.includes('top_merchants'),
      export: limits.features.includes('export'),
      mcp: limits.features.includes('mcp'),
      priceAlertTelegram: limits.features.includes('price_alert_telegram'),
      fullSpending: limits.features.includes('full_spending'),
      budgetsGoals: limits.features.includes('budgets_goals'),
    },
  };

  return NextResponse.json(status);
}
