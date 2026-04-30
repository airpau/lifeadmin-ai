import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { templates, sendEmail } from '@/lib/email/marketing-automation';

export const runtime = 'edge';
export const maxDuration = 300;

export async function GET(request: Request) {
  // Optional cron secret check
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
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
    // 1. Find all users who are trialing and their trial has expired
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, first_name, full_name')
      .eq('subscription_status', 'trialing')
      .lt('trial_ends_at', new Date().toISOString())
      .is('stripe_subscription_id', null);

    if (fetchError) {
      console.error('[trial-expiry] Error fetching expired users:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      return NextResponse.json({ message: 'No expired trials found' });
    }

    console.log(`[trial-expiry] Found ${expiredUsers.length} users whose trial has expired.`);

    const userIds = expiredUsers.map((u) => u.id);

    // 2. Downgrade their tier and status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        subscription_status: 'active', // they are active free users now
      })
      .in('id', userIds)
      .eq('subscription_status', 'trialing');

    if (updateError) {
      console.error('[trial-expiry] Error updating users:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Send them the trial expired email
    let emailsSent = 0;
    for (const user of expiredUsers) {
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
      downgraded: expiredUsers.length,
      emailsSent,
    });
  } catch (err: any) {
    console.error('[trial-expiry] Unhandled error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
