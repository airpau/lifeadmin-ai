import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ONBOARDING_SEQUENCE, sendOnboardingEmail } from '@/lib/email/onboarding-sequence';
import { canSendEmail } from '@/lib/email-rate-limit';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Fetch all users with their profile data
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, first_name, full_name, created_at')
    .not('email', 'is', null);

  if (error || !profiles?.length) {
    return NextResponse.json({ sent: 0, message: 'No profiles found' });
  }

  // Fetch all already-sent onboarding emails
  const { data: sentRows } = await admin
    .from('onboarding_emails')
    .select('user_id, email_key');

  // Build a set of "userId:emailKey" for fast lookup
  const alreadySent = new Set(
    (sentRows || []).map((r) => `${r.user_id}:${r.email_key}`)
  );

  let totalSent = 0;
  const results: string[] = [];

  for (const profile of profiles) {
    const days = daysSince(profile.created_at);
    const firstName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';
    const email = profile.email;

    // Stop onboarding after 14 days — they're no longer "new"
    if (days > 14) continue;

    // Max 1 onboarding email per user per day
    let sentThisRun = false;

    for (const seq of ONBOARDING_SEQUENCE) {
      if (sentThisRun) break;
      // Send if enough days have passed and not already sent
      if (days >= seq.dayOffset && !alreadySent.has(`${profile.id}:${seq.key}`)) {
        // Check global daily email cap before sending
        const rateCheck = await canSendEmail(admin, profile.id, 'onboarding_email');
        if (!rateCheck.allowed) {
          results.push(`${email} → SKIPPED (${rateCheck.reason})`);
          break;
        }

        const sent = await sendOnboardingEmail(email, firstName, seq.key);

        if (sent) {
          // Record in onboarding_emails table for sequence deduplication
          await admin.from('onboarding_emails').insert({
            user_id: profile.id,
            email_key: seq.key,
          });
          // Record in tasks table so the global rate limiter counts this send
          await admin.from('tasks').insert({
            user_id: profile.id,
            type: 'onboarding_email',
            title: `Onboarding email: ${seq.key}`,
            status: 'completed',
          });
          totalSent++;
          sentThisRun = true;
          results.push(`${email} → ${seq.key}`);
        }

        // Only send one email per user per cron run to avoid spam
        break;
      }
    }
  }

  return NextResponse.json({ sent: totalSent, results });
}
