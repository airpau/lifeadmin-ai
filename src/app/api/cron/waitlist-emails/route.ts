import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WAITLIST_SEQUENCE, sendSequenceEmail } from '@/lib/email/waitlist-sequence';

// Vercel cron calls this daily — sends sequence emails to eligible waitlist members
// Vercel cron config: see vercel.json

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron call from Vercel
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: subscribers, error } = await supabase
    .from('waitlist_signups')
    .select('id, email, full_name, created_at, emails_sent')
    .is('unsubscribed_at', null);

  if (error) {
    console.error('Cron: failed to fetch waitlist:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const results = { sent: 0, skipped: 0, errors: 0 };

  for (const subscriber of subscribers ?? []) {
    const signupDate = new Date(subscriber.created_at);
    const daysSinceSignup = Math.floor(
      (now.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const emailsSent: string[] = subscriber.emails_sent ?? [];

    // Find the next sequence email that's due and not yet sent
    const due = WAITLIST_SEQUENCE.filter(
      (s) => s.dayOffset > 0 && // Day 0 is sent at signup time
             daysSinceSignup >= s.dayOffset &&
             !emailsSent.includes(s.id)
    );

    for (const seq of due) {
      const sent = await sendSequenceEmail(
        subscriber.email,
        subscriber.full_name ?? 'there',
        seq.id
      );

      if (sent) {
        await supabase
          .from('waitlist_signups')
          .update({ emails_sent: [...emailsSent, seq.id] })
          .eq('id', subscriber.id);
        results.sent++;
      } else {
        results.errors++;
      }
    }

    if (due.length === 0) results.skipped++;
  }

  console.log('Waitlist email cron results:', results);
  return NextResponse.json({ ok: true, ...results });
}
