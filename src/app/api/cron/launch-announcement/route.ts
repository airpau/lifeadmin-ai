import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Manual trigger only — NOT scheduled in vercel.json
// Trigger via: GET /api/cron/launch-announcement with Authorization: Bearer <CRON_SECRET>

const resend = new Resend(process.env.RESEND_API_KEY);

const BATCH_SIZE = 50;

function buildEmailHtml(email: string): string {
  const signupUrl = 'https://paybacker.co.uk/auth/signup';
  const unsubscribeUrl = `https://paybacker.co.uk/api/unsubscribe?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Paybacker is live</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f1e;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo / Brand -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <span style="font-size:28px;font-weight:800;color:#f59e0b;letter-spacing:-0.5px;">Paybacker</span>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border:1px solid #1e3a5f;border-radius:16px;padding:48px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">You're one of the first.</p>
              <h1 style="margin:0 0 24px;font-size:36px;font-weight:800;color:#ffffff;line-height:1.2;">Paybacker is now live.</h1>
              <p style="margin:0 0 32px;font-size:18px;color:#94a3b8;line-height:1.6;">You joined the waitlist — and today's the day.<br/>Your AI money-recovery assistant is ready.</p>
              <a href="${signupUrl}" style="display:inline-block;background-color:#f59e0b;color:#0a0f1e;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;">Claim your free account →</a>
              <p style="margin:20px 0 0;font-size:13px;color:#64748b;">PS: Your first 7 days are free — no card required to start.</p>
            </td>
          </tr>

          <!-- What's waiting -->
          <tr>
            <td style="padding:40px 0 0;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">What's waiting for you</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px 24px;vertical-align:top;width:32%;">
                    <p style="margin:0 0 8px;font-size:22px;">✍️</p>
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">AI Complaint Letters</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">Legally-backed letters to energy, broadband, and council tax providers — written in seconds.</p>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px 24px;vertical-align:top;width:32%;">
                    <p style="margin:0 0 8px;font-size:22px;">📦</p>
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">Subscription Tracker</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">Find forgotten subscriptions and let AI write the cancellation emails for you.</p>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px 24px;vertical-align:top;width:32%;">
                    <p style="margin:0 0 8px;font-size:22px;">🔍</p>
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">Deal Finder</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">Spot overcharges, cashback opportunities, and better deals hiding in your inbox.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Final CTA -->
          <tr>
            <td style="padding:40px 0;text-align:center;">
              <a href="${signupUrl}" style="display:inline-block;background-color:#f59e0b;color:#0a0f1e;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:10px;">Get started free →</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #1e293b;padding-top:24px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:#475569;">Paybacker Ltd · London, UK</p>
              <p style="margin:0;font-size:12px;color:#475569;">
                <a href="${unsubscribeUrl}" style="color:#475569;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
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
    .select('email, full_name')
    .is('unsubscribed_at', null);

  if (error) {
    console.error('Launch announcement: failed to fetch waitlist:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = subscribers ?? [];
  console.log(`Launch announcement: sending to ${list.length} subscribers`);

  let sent = 0;
  let errors = 0;

  // Send in batches of BATCH_SIZE to respect Resend rate limits
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (subscriber) => {
        try {
          await resend.emails.send({
            from: 'Paybacker <hello@paybacker.co.uk>',
            to: subscriber.email,
            subject: "Paybacker is live — you're in 🎉",
            html: buildEmailHtml(subscriber.email),
          });
          console.log(`Sent launch email to ${subscriber.email}`);
          sent++;
        } catch (err) {
          console.error(`Failed to send to ${subscriber.email}:`, err);
          errors++;
        }
      })
    );

    // Small pause between batches to avoid rate limit spikes
    if (i + BATCH_SIZE < list.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`Launch announcement complete: sent=${sent} errors=${errors}`);
  return NextResponse.json({ ok: true, total: list.length, sent, errors });
}
