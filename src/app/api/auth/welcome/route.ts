import { NextRequest, NextResponse } from 'next/server';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { notifyAgents } from '@/lib/agent-notify';
import { trackSignup } from '@/lib/meta-conversions';

export async function POST(request: NextRequest) {
  try {
    const { email, name, userId } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const sent = await sendOnboardingEmail(email, name || 'there', 'welcome');

    // Send admin notification about new signup
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: `New signup: ${name || email}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 16px;">
          <h2 style="color: #f59e0b; margin-top: 0;">New Member Signup</h2>
          <p style="color: #94a3b8;">Name: <strong style="color: #fff;">${name || 'Not provided'}</strong></p>
          <p style="color: #94a3b8;">Email: <strong style="color: #fff;">${email}</strong></p>
          <p style="color: #94a3b8;">Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
          <a href="https://paybacker.co.uk/dashboard/admin" style="color: #f59e0b;">View in Admin Dashboard</a>
        </div>
      `,
    }).catch(err => console.error('Admin signup notification failed:', err));

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
