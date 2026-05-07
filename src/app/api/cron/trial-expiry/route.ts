import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { templates, sendEmail } from '@/lib/email/marketing-automation';

export const runtime = 'edge';
export const maxDuration = 300;

export async function GET(request: Request) {
  // Cron auth — fail closed. A misconfigured (unset) CRON_SECRET must NOT
  // make the route public; mass downgrades + outbound emails are gated.
  const authHeader = request.headers.get('authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Missing Supabase environment variables' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Find all users who are trialing and their trial has expired.
    // Exclude founding members — /api/cron/founding-member-expiry is the
    // single source of truth for that cohort and runs an hour earlier.
    // Exclude users who already have trial_expired_at set so we don't
    // re-email anyone whose downgrade has already been processed (the
    // founding-member cron sets this column when it downgrades).
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, first_name, full_name')
      .eq('subscription_status', 'trialing')
      .lt('trial_ends_at', new Date().toISOString())
      .is('stripe_subscription_id', null)
      .is('trial_expired_at', null)
      .or('founding_member.is.null,founding_member.eq.false');

    if (fetchError) {
      console.error('[trial-expiry] Error fetching expired users:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      return NextResponse.json({ message: 'No expired trials found' });
    }

    console.log(`[trial-expiry] Found ${expiredUsers.length} users whose trial has expired.`);

    const userIds = expiredUsers.map((u) => u.id);

    // 2. Downgrade their tier and status. Stamp trial_expired_at so this
    // row is idempotent — any subsequent run (or the founding-member cron)
    // will skip it. The .eq('subscription_status', 'trialing') guard means
    // a row that flipped to e.g. 'active' (user upgraded mid-cron) won't
    // be touched. Use .select() to recover ONLY the rows that were
    // actually updated, so we email exactly the users we downgraded.
    const { data: downgradedUsers, error: updateError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        subscription_status: 'active', // they are active free users now
        trial_expired_at: new Date().toISOString(),
      })
      .in('id', userIds)
      .eq('subscription_status', 'trialing')
      .select('id, email, first_name, full_name');

    if (updateError) {
      console.error('[trial-expiry] Error updating users:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Send the trial-expired email only to users we actually downgraded.
    let emailsSent = 0;
    for (const user of downgradedUsers ?? []) {
      if (!user.email) continue;

      const name = user.first_name || user.full_name?.split(' ')[0] || 'there';
      const html = templates.trialExpired(name);

      const success = await sendEmail(
        user.email,
        'Your Paybacker Pro trial has ended',
        html
      );

      if (success) {
        emailsSent++;
      }

      // small delay to prevent rate limits from Resend
      await new Promise(r => setTimeout(r, 100));
    }

    return NextResponse.json({
      success: true,
      downgraded: downgradedUsers?.length ?? 0,
      emailsSent,
    });
  } catch (err: any) {
    console.error('[trial-expiry] Unhandled error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
