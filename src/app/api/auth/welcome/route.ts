import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { notifyAgents } from '@/lib/agent-notify';
import { trackSignup } from '@/lib/meta-conversions';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name } = await request.json();
    const email = user.email;
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    const userId = user.id;

    const sent = await sendOnboardingEmail(email, name || 'there', 'welcome');

    const signupTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });

    // Send admin notification about new signup (email)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: `New signup: ${name || email}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 16px;">
          <h2 style="color: #34d399; margin-top: 0;">New Member Signup</h2>
          <p style="color: #94a3b8;">Name: <strong style="color: #fff;">${name || 'Not provided'}</strong></p>
          <p style="color: #94a3b8;">Email: <strong style="color: #fff;">${email}</strong></p>
          <p style="color: #94a3b8;">Time: ${signupTime}</p>
          <a href="https://paybacker.co.uk/dashboard/admin" style="color: #34d399;">View in Admin Dashboard</a>
        </div>
      `,
    }).catch(err => console.error('Admin signup notification failed:', err));

    // Telegram alert to founder
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
    if (tgToken && tgChatId) {
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(tgChatId),
          text: `New signup: ${name || 'Unknown'} (${email}) at ${signupTime} — tier: Free`,
        }),
      }).catch(() => {});
    }

    // Notify AI agents about new signup
    notifyAgents('new_signup', `New signup: ${name || email}`, `New user signed up: ${email} (${name || 'no name'}). User ID: ${userId || 'unknown'}. Time: ${new Date().toISOString()}`, 'system').catch(() => {});

    // Meta Conversions API - server-side Lead event (deduplicates with client Pixel)
    trackSignup({
      email,
      userId: userId || '',
      firstName: name || undefined,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    }).catch(() => {});

    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error('Welcome email error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
