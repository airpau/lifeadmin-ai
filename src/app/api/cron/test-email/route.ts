import { NextResponse } from 'next/server';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

// Test endpoint — sends a single email to hello@paybacker.co.uk to verify Resend + verified domain
// Secured with CRON_SECRET so it can't be triggered by random visitors
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: 'hello@paybacker.co.uk',
      subject: `Resend test — ${new Date().toISOString()}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px;">
          <h2 style="color:#f59e0b;margin:0 0 16px;">Resend domain test</h2>
          <p style="color:#94a3b8;margin:0 0 8px;">This email confirms that Resend is working correctly with the verified <strong style="color:#e2e8f0;">paybacker.co.uk</strong> domain.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Sent at: ${new Date().toUTCString()}</p>
          <p style="color:#64748b;font-size:13px;margin:4px 0 0;">From: ${FROM_EMAIL}</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, id: result.data?.id });
  } catch (err: any) {
    console.error('Test email failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
