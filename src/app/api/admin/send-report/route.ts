import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { to, subject, markdownContent, rawHtml } = await request.json();

  // Use raw HTML if provided, otherwise wrap markdown
  const html = rawHtml || `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:32px;">
  <div style="text-align:center;padding:24px 0;">
    <div style="font-size:24px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></div>
    <div style="color:#64748b;font-size:12px;margin-top:4px;">${subject}</div>
  </div>
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:32px;color:#e2e8f0;font-size:14px;line-height:1.8;">
    <pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${markdownContent.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
  </div>
  <div style="text-align:center;padding:24px 0;color:#475569;font-size:11px;">
    Paybacker LTD · Confidential
  </div>
</div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ sent: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
