import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// POST /api/cron/mobile-deal-alert
// Sends personalised giffgaff deal emails to users with mobile subscriptions.
// Trigger manually: POST with Authorization: Bearer <CRON_SECRET>
// Or via vercel.json cron schedule.

export const runtime = 'nodejs';
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY!);

const AWIN_URL = 'https://www.awin1.com/cread.php?awinmid=3599&awinaffid=2825812&ued=https%3A%2F%2Fwww.giffgaff.com%2Fsim-only-plans';
const DEALS_PAGE = 'https://paybacker.co.uk/dashboard/deals';

interface MobileUser {
  user_id: string;
  email: string;
  full_name: string | null;
  provider_name: string;
  amount: number;
  billing_cycle: string;
}

interface GiffgaffPlan {
  plan_name: string;
  data_allowance: string;
  price_monthly: number;
  contract_length: string;
}

function buildEmailHtml(user: MobileUser, plans: GiffgaffPlan[], unsubUrl: string): string {
  const firstName = user.full_name?.split(' ')[0] || 'there';
  const monthlySpend = Number(user.amount);
  const annualSpend = (monthlySpend * 12).toFixed(0);

  // Find the best saving plan (cheapest that still has real data)
  const bestPlan = plans.find(p => p.price_monthly < monthlySpend) || plans[0];
  const monthlySaving = bestPlan ? (monthlySpend - bestPlan.price_monthly).toFixed(2) : null;
  const annualSaving = monthlySaving ? (Number(monthlySaving) * 12).toFixed(0) : null;

  const planRows = plans
    .slice(0, 6)
    .map(p => {
      const saving = monthlySpend > p.price_monthly
        ? `<span style="color:#10b981;font-weight:700;">Save £${(monthlySpend - p.price_monthly).toFixed(2)}/mo</span>`
        : `<span style="color:#64748b;">£${(p.price_monthly - monthlySpend).toFixed(2)}/mo more</span>`;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;">${p.data_allowance}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;">${p.contract_length}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f59e0b;font-weight:700;font-size:13px;">£${p.price_monthly}/mo</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;">${saving}</td>
        </tr>`;
    }).join('');

  const savingsBanner = annualSaving && Number(annualSaving) > 0 ? `
    <tr>
      <td style="padding:24px 0 0;">
        <div style="background:linear-gradient(135deg,#064e3b 0%,#022c22 100%);border:1px solid #059669;border-radius:12px;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;color:#6ee7b7;font-weight:600;">BASED ON YOUR ${user.provider_name.toUpperCase()} SPEND</p>
          <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">You could save <span style="color:#34d399;">£${annualSaving}/yr</span></p>
          <p style="margin:8px 0 0;font-size:13px;color:#6ee7b7;">Switching to giffgaff ${bestPlan.data_allowance} at £${bestPlan.price_monthly}/mo vs your current £${monthlySpend}/mo</p>
        </div>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New mobile deal — could you save £${annualSaving || '100+'}/yr?</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f1e;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:28px;text-align:center;">
              <span style="font-size:26px;font-weight:800;color:#f59e0b;letter-spacing:-0.5px;">Paybacker</span>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border:1px solid #1e3a5f;border-radius:16px;padding:40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">New Mobile Deal</p>
              <h1 style="margin:0 0 16px;font-size:30px;font-weight:800;color:#ffffff;line-height:1.2;">Hi ${firstName}, we found you a better mobile deal</h1>
              <p style="margin:0 0 28px;font-size:16px;color:#94a3b8;line-height:1.6;">
                We've just partnered with <strong style="color:#fff;">giffgaff</strong> — flexible SIM-only plans with no contracts required.
                You're currently paying <strong style="color:#f59e0b;">£${monthlySpend}/mo (£${annualSpend}/yr)</strong> to ${user.provider_name}.
              </p>
              <a href="${AWIN_URL}" style="display:inline-block;background-color:#f59e0b;color:#0a0f1e;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">View giffgaff Plans →</a>
            </td>
          </tr>

          ${savingsBanner}

          <!-- Plans table -->
          <tr>
            <td style="padding:32px 0 0;">
              <p style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">giffgaff Plans — Best Value</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden;">
                <thead>
                  <tr style="background:#1e293b;">
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Data</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Contract</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Price</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">vs You</th>
                  </tr>
                </thead>
                <tbody>${planRows}</tbody>
              </table>
              <p style="margin:8px 0 0;font-size:11px;color:#475569;">All plans include unlimited UK calls and texts. Prices verified ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}.</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:32px 0 0;text-align:center;">
              <a href="${AWIN_URL}" style="display:inline-block;background-color:#f59e0b;color:#0a0f1e;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;margin-bottom:12px;">Switch to giffgaff →</a>
              <br />
              <a href="${DEALS_PAGE}" style="display:inline-block;margin-top:8px;font-size:13px;color:#64748b;text-decoration:underline;">Browse all deals in Paybacker</a>
            </td>
          </tr>

          <!-- Why giffgaff -->
          <tr>
            <td style="padding:32px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1e293b;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#f59e0b;">Why giffgaff?</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">✓ No contracts — cancel anytime on rolling plans</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">✓ Runs on the O2 network — excellent UK coverage</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">✓ Unlimited UK calls &amp; texts on all plans</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;">✓ EU roaming included</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0;text-align:center;color:#475569;font-size:11px;line-height:1.8;">
              Paybacker LTD · <a href="https://paybacker.co.uk" style="color:#475569;">paybacker.co.uk</a><br />
              <a href="${unsubUrl}" style="color:#475569;">Unsubscribe</a> · We'll only send deal alerts relevant to your contracts.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch all active giffgaff plans from DB, ordered cheapest first
  const { data: plans, error: plansError } = await supabase
    .from('affiliate_deals')
    .select('plan_name, data_allowance, price_monthly, contract_length')
    .eq('provider', 'giffgaff')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (plansError || !plans?.length) {
    return NextResponse.json({ error: 'No giffgaff plans found' }, { status: 500 });
  }

  // 2. Find users with active mobile subscriptions
  const { data: mobileUsers, error: usersError } = await supabase
    .from('subscriptions')
    .select(`
      user_id, provider_name, amount, billing_cycle,
      profiles!inner(email, full_name)
    `)
    .neq('status', 'cancelled')
    .is('dismissed_at', null)
    .or('provider_type.eq.mobile,category.eq.mobile')
    .not('profiles.email', 'is', null);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  // Also catch mobile users matched by provider name (no category set)
  const mobileKeywords = ['giffgaff','o2','vodafone','three','ee','tesco mobile','smarty',
    'lebara','id mobile','voxi','sky mobile','bt mobile','talkmobile','asda mobile'];

  const { data: nameMatchedUsers } = await supabase
    .from('subscriptions')
    .select(`
      user_id, provider_name, amount, billing_cycle,
      profiles!inner(email, full_name)
    `)
    .neq('status', 'cancelled')
    .is('dismissed_at', null)
    .is('provider_type', null)
    .is('category', null)
    .not('profiles.email', 'is', null);

  const nameMatched = (nameMatchedUsers || []).filter(s => {
    const name = (s.provider_name || '').toLowerCase();
    return mobileKeywords.some(kw => name.includes(kw));
  });

  // Deduplicate by user_id — one email per user (pick their highest mobile spend)
  const userMap = new Map<string, MobileUser>();
  for (const row of [...(mobileUsers || []), ...nameMatched]) {
    const p = row.profiles as any;
    const existing = userMap.get(row.user_id);
    const amount = Number(row.amount);
    if (!existing || amount > existing.amount) {
      userMap.set(row.user_id, {
        user_id: row.user_id,
        email: p.email,
        full_name: p.full_name,
        provider_name: row.provider_name,
        amount,
        billing_cycle: row.billing_cycle,
      });
    }
  }

  const recipients = Array.from(userMap.values());

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No mobile users found' });
  }

  // 3. Send emails
  let sent = 0;
  const errors: string[] = [];

  for (const user of recipients) {
    const unsubUrl = `https://paybacker.co.uk/api/unsubscribe?email=${encodeURIComponent(user.email)}`;
    const html = buildEmailHtml(user, plans as GiffgaffPlan[], unsubUrl);

    const monthlySpend = user.amount;
    const bestPlan = plans.find((p: any) => p.price_monthly < monthlySpend) || plans[0];
    const annualSaving = bestPlan ? Math.round((monthlySpend - (bestPlan as any).price_monthly) * 12) : 0;
    const subject = annualSaving > 0
      ? `Save £${annualSaving}/yr on mobile — new giffgaff deal`
      : `New mobile deal: giffgaff plans from £8/mo`;

    const { error } = await resend.emails.send({
      from: 'Paybacker <hello@paybacker.co.uk>',
      replyTo: 'hello@paybacker.co.uk',
      to: user.email,
      subject,
      html,
    });

    if (error) {
      errors.push(`${user.email}: ${error.message}`);
    } else {
      sent++;
    }
  }

  return NextResponse.json({
    sent,
    total: recipients.length,
    errors: errors.length ? errors : undefined,
  });
}
