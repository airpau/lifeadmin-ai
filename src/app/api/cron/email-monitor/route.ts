import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Email delivery monitor — runs twice daily (8am, 2pm).
 * Checks that all users have received their welcome email.
 * If a user signed up more than 5 minutes ago and hasn't received
 * a welcome email, sends one now.
 *
 * Also reports any gaps for the admin dashboard.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, first_name, full_name, created_at')
    .not('email', 'is', null);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, fixed: 0 });
  }

  // Get all welcome emails that have been sent
  const { data: sentEmails } = await supabase
    .from('onboarding_emails')
    .select('user_id, email_key')
    .eq('email_key', 'welcome');

  const sentUserIds = new Set((sentEmails || []).map(e => e.user_id));

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let fixed = 0;
  const gaps: Array<{ email: string; signed_up: string; fixed: boolean }> = [];

  for (const user of users) {
    // Skip users who signed up less than 5 minutes ago (give the instant send time to work)
    if (user.created_at > fiveMinutesAgo) continue;

    if (!sentUserIds.has(user.id)) {
      // Missing welcome email — send it now
      const name = user.first_name || user.full_name?.split(' ')[0] || 'there';

      try {
        const sent = await sendOnboardingEmail(user.email, name, 'welcome');

        if (sent) {
          // Record that we sent it
          await supabase.from('onboarding_emails').insert({
            user_id: user.id,
            email_key: 'welcome',
          });
          fixed++;
          gaps.push({ email: user.email, signed_up: user.created_at, fixed: true });
          console.log(`Email monitor: sent missing welcome email to ${user.email}`);
        } else {
          gaps.push({ email: user.email, signed_up: user.created_at, fixed: false });
          console.error(`Email monitor: failed to send welcome to ${user.email}`);
        }
      } catch (err: any) {
        gaps.push({ email: user.email, signed_up: user.created_at, fixed: false });
        console.error(`Email monitor: error for ${user.email}:`, err.message);
      }
    }
  }

  console.log(`Email monitor: checked=${users.length} missing=${gaps.length} fixed=${fixed}`);

  return NextResponse.json({
    ok: true,
    checked: users.length,
    all_have_welcome: gaps.length === 0,
    missing_welcome: gaps.length,
    fixed,
    gaps,
  });
}
