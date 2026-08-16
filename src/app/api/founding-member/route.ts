import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const FREE_TRIAL_TIER = 'pro';
const FREE_TRIAL_DAYS = 14;

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Founding-member grants are OFF unless explicitly enabled.
 *
 * Why: POST here hands any authenticated user `subscription_tier = 'pro'`
 * plus `founding_member = true`, and `founding_member = true` permanently
 * exempts a profile from webhook demotion (every profile write in
 * /api/webhooks/stripe carries `.neq('founding_member', true)`). Left
 * open, anyone who signs up can grant themselves un-demotable Pro. The
 * campaign this endpoint was built for has long since ended.
 *
 * Set FOUNDING_MEMBER_ENABLED=true to re-open it for a future campaign.
 * Existing founding members are untouched — this only blocks NEW grants.
 */
const FOUNDING_MEMBER_ENABLED = process.env.FOUNDING_MEMBER_ENABLED === 'true';

// GET: Check trial availability
export async function GET() {
  if (!FOUNDING_MEMBER_ENABLED) {
    return NextResponse.json({
      active: false,
      offer: null,
      reason: 'The founding member offer has closed.',
    });
  }

  return NextResponse.json({
    active: true,
    tier: FREE_TRIAL_TIER,
    days: FREE_TRIAL_DAYS,
    offer: `Free ${FREE_TRIAL_TIER.charAt(0).toUpperCase() + FREE_TRIAL_TIER.slice(1)} trial for ${FREE_TRIAL_DAYS} days`,
  });
}

// POST: Start free trial
export async function POST(request: NextRequest) {
  try {
    // Closed by default — see FOUNDING_MEMBER_ENABLED note above.
    // 410 Gone, not 403, because the offer itself has ended rather than
    // this particular user being refused.
    if (!FOUNDING_MEMBER_ENABLED) {
      return NextResponse.json(
        {
          error: 'The founding member offer has closed.',
          message: 'Our founding member offer has now closed, but you can still start free and upgrade any time.',
          upgradeUrl: '/pricing',
        },
        { status: 410 },
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdmin();

    // Check if already on trial or paid
    const { data: profile } = await admin
      .from('profiles')
      .select('subscription_tier, founding_member, stripe_subscription_id')
      .eq('id', user.id)
      .single();

    // Already on a paid plan
    if (profile?.stripe_subscription_id) {
      return NextResponse.json({ claimed: true, alreadyPaid: true, tier: profile.subscription_tier });
    }

    // Already used their free trial
    if (profile?.founding_member) {
      return NextResponse.json({ claimed: true, alreadyTrial: true, tier: profile.subscription_tier });
    }

    // Start the free trial
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + FREE_TRIAL_DAYS);

    await admin.from('profiles').update({
      subscription_tier: FREE_TRIAL_TIER,
      subscription_status: 'trialing',
      founding_member: true,
      founding_member_expires: expiresAt.toISOString(),
      trial_started_at: new Date().toISOString(),
      trial_ends_at: expiresAt.toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({
      claimed: true,
      tier: FREE_TRIAL_TIER,
      days: FREE_TRIAL_DAYS,
      expires: expiresAt.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
