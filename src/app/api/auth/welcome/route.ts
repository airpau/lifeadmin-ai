import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { notifyAgents } from '@/lib/agent-notify';
import { trackSignup } from '@/lib/meta-conversions';

// Founder notification recipient — admin inbox, not the user's email.
const FOUNDER_NOTIFY_EMAIL = 'hello@paybacker.co.uk';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Idempotency — every signup path (email/password + dashboard-layout
    // OAuth drain) now calls this route. The first successful run stamps
    // `welcome_sent_at` on user_metadata; subsequent calls short-circuit.
    if (user.user_metadata?.welcome_sent_at) {
      return NextResponse.json({ sent: false, reason: 'already_welcomed' });
    }

    const { name: bodyName } = await request.json().catch(() => ({ name: null as string | null }));
    const email = user.email;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    const userId = user.id;

    // Pull tier + marketing opt-in for the founder notification body.
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, full_name, first_name')
      .eq('id', userId)
      .maybeSingle();

    const name =
      bodyName ||
      user.user_metadata?.first_name ||
      profile?.first_name ||
      profile?.full_name?.split(' ')[0] ||
      user.user_metadata?.full_name?.split(' ')[0] ||
      null;

    const tier = profile?.subscription_tier || 'free';
    const marketingOptIn = user.user_metadata?.marketing_opt_in === true;
    // Supabase stores the OAuth provider on app_metadata.provider
    // ('email' | 'google' | 'apple' | ...). Fall back to 'email' for
    // password signups that don't set it.
    const provider =
      (user.app_metadata as Record<string, unknown> | null)?.provider as string | undefined ||
      'email';

    const sent = await sendOnboardingEmail(email, name || 'there', 'welcome');

    // Founder notification — sent for EVERY new signup, regardless of
    // marketing opt-in. This is a separate admin-only notification, not
    // user-facing marketing email.
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_NOTIFY_EMAIL,
      subject: `New signup: ${name || email} (${tier}, ${provider})`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 16px;">
          <h2 style="color: #34d399; margin-top: 0;">New Member Signup</h2>
          <p style="color: #94a3b8;">Name: <strong style="color: #fff;">${escapeHtml(name || 'Not provided')}</strong></p>
          <p style="color: #94a3b8;">Email: <strong style="color: #fff;">${escapeHtml(email)}</strong></p>
          <p style="color: #94a3b8;">Tier: <strong style="color: #fff;">${escapeHtml(tier)}</strong></p>
          <p style="color: #94a3b8;">Provider: <strong style="color: #fff;">${escapeHtml(provider)}</strong></p>
          <p style="color: #94a3b8;">Marketing opt-in: <strong style="color: #fff;">${marketingOptIn ? 'Yes' : 'No'}</strong></p>
          <p style="color: #94a3b8;">Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 16px;">User ID: ${escapeHtml(userId)}</p>
          <a href="https://paybacker.co.uk/dashboard/admin" style="color: #34d399;">View in Admin Dashboard</a>
        </div>
      `,
    }).catch(err => console.error('Admin signup notification failed:', err));

    // Notify AI agents about new signup
    notifyAgents('new_signup', `New signup: ${name || email}`, `New user signed up: ${email} (${name || 'no name'}). User ID: ${userId || 'unknown'}. Tier: ${tier}. Provider: ${provider}. Time: ${new Date().toISOString()}`, 'system').catch(() => {});

    // Meta Conversions API - server-side Lead event (deduplicates with client Pixel)
    trackSignup({
      email,
      userId: userId || '',
      firstName: name || undefined,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    }).catch(() => {});

    // Stamp idempotency flag so a re-call (e.g. dashboard layout firing
    // on the next render before the user_metadata read settles) becomes
    // a no-op.
    await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        welcome_sent_at: new Date().toISOString(),
      },
    }).catch(err => console.error('welcome_sent_at flag update failed:', err));

    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error('Welcome email error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
