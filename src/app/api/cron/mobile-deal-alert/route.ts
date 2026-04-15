import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// POST /api/cron/mobile-deal-alert
// Sends personalised giffgaff deal emails to users with mobile subscriptions.
// Trigger manually: POST with Authorization: Bearer <CRON_SECRET>
// Or via vercel.json cron schedule.

export const runtime = 'nodejs';
export const maxDuration = 60;

// Resend init moved inside the handler to prevent static build errors

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

// Brand design system — matches onboarding-sequence.ts
const S = {
  wrap: `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;`,
  header: `background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;`,
  body: `padding:32px;`,
  h1: `color:#ffffff;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`,
  p: `color:#94a3b8;font-size:15px;line-height:1.75;margin:0 0 16px;`,
  pWhite: `color:#e2e8f0;font-size:15px;line-height:1.75;margin:0 0 16px;`,
  box: `background:#162544;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #f59e0b;`,
  cta: `display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:8px 0;`,
  ctaSecondary: `display:inline-block;background:#1e3a5f;color:#e2e8f0;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;margin:8px 0 8px 12px;border:1px solid #1e3a5f;`,
  footer: `padding:20px 32px 28px;border-top:1px solid #1e3a5f;`,
  footerText: `color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;`,
  badge: `display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:11px;padding:3px 10px;border-radius:6px;letter-spacing:0.05em;text-transform:uppercase;`,
  statCard: `display:inline-block;background:#162544;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;text-align:center;margin:4px;min-width:120px;`,
  tipBox: `background:#162544;border-radius:12px;padding:16px 20px;margin:20px 0;border-left:3px solid #FB923C;`,
};

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </a>
`;

const Footer = () => `
  <div style="${S.footer}">
    <p style="${S.footerText}">
      <a href="https://paybacker.co.uk" style="color:#f59e0b;text-decoration:none;font-weight:600;">Paybacker LTD</a> · ICO Registered · UK Company<br/>
      AI-powered money recovery for UK consumers<br/><br/>
      <a href="https://paybacker.co.uk/privacy-policy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="https://paybacker.co.uk/terms-of-service" style="color:#475569;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
      <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

function buildEmailHtml(user: MobileUser, plans: GiffgaffPlan[], _unsubUrl: string): string {
  const firstName = user.full_name?.split(' ')[0] || 'there';
  const monthlySpend = Number(user.amount);
  const annualSpend = (monthlySpend * 12).toFixed(0);

  const bestPlan = plans.find(p => p.price_monthly < monthlySpend) || plans[0];
  const monthlySaving = bestPlan ? (monthlySpend - bestPlan.price_monthly).toFixed(2) : null;
  const annualSaving = monthlySaving && Number(monthlySaving) > 0 ? (Number(monthlySaving) * 12).toFixed(0) : null;

  const planRows = plans
    .slice(0, 6)
    .map(p => {
      const diff = monthlySpend - p.price_monthly;
      const saving = diff > 0
        ? `<strong style="color:#34d399;">Save £${diff.toFixed(2)}/mo</strong>`
        : `<span style="color:#64748b;">£${Math.abs(diff).toFixed(2)}/mo more</span>`;
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:14px;">${p.data_allowance}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:14px;">${p.contract_length}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #1e3a5f;color:#f59e0b;font-weight:700;font-size:14px;">£${p.price_monthly}/mo</td>
          <td style="padding:12px 16px;border-bottom:1px solid #1e3a5f;font-size:14px;">${saving}</td>
        </tr>`;
    }).join('');

  const savingsSection = annualSaving ? `
    <div style="text-align:center;margin:24px 0 8px;">
      <span style="${S.statCard}">
        <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px;">Your current spend</span>
        <span style="display:block;font-size:22px;font-weight:800;color:#f59e0b;">£${monthlySpend}/mo</span>
        <span style="display:block;font-size:12px;color:#64748b;">${user.provider_name}</span>
      </span>
      <span style="${S.statCard}">
        <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px;">giffgaff from</span>
        <span style="display:block;font-size:22px;font-weight:800;color:#34d399;">£${bestPlan.price_monthly}/mo</span>
        <span style="display:block;font-size:12px;color:#64748b;">${bestPlan.data_allowance}</span>
      </span>
      <span style="${S.statCard}">
        <span style="display:block;font-size:12px;color:#94a3b8;margin-bottom:4px;">You could save</span>
        <span style="display:block;font-size:22px;font-weight:800;color:#34d399;">£${annualSaving}/yr</span>
        <span style="display:block;font-size:12px;color:#64748b;">per year</span>
      </span>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="background:#0a0e1a;padding:32px 16px;">
<div style="${S.wrap}">
  <div style="${S.header}">${Logo()}</div>
  <div style="${S.body}">

    <span style="${S.badge}">New Deal</span>
    <h1 style="${S.h1};margin-top:12px;">We found you a better mobile deal, ${firstName}</h1>

    <p style="${S.pWhite}">You're currently paying <strong style="color:#f59e0b;">£${monthlySpend}/mo</strong> (£${annualSpend}/yr) to <strong>${user.provider_name}</strong>. We've just partnered with <strong>giffgaff</strong> and think you could pay less.</p>

    ${savingsSection}

    <div style="text-align:center;margin:24px 0;">
      <a href="${AWIN_URL}" style="${S.cta}">View giffgaff plans</a>
      <a href="${DEALS_PAGE}" style="${S.ctaSecondary}">Browse all deals</a>
    </div>

    <div style="${S.box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Compare plans</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;border-bottom:1px solid #1e3a5f;">Data</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;border-bottom:1px solid #1e3a5f;">Contract</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;border-bottom:1px solid #1e3a5f;">Price</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;border-bottom:1px solid #1e3a5f;">vs You</th>
          </tr>
        </thead>
        <tbody>${planRows}</tbody>
      </table>
      <p style="margin:10px 0 0;font-size:12px;color:#64748b;">All plans include unlimited UK calls &amp; texts. Prices verified ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}.</p>
    </div>

    <div style="${S.tipBox}">
      <p style="color:#FB923C;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Why giffgaff?</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">
        <strong style="color:#e2e8f0;">No contracts</strong> — cancel anytime on rolling monthly plans.<br/>
        <strong style="color:#e2e8f0;">O2 network</strong> — excellent UK coverage with 99% population reach.<br/>
        <strong style="color:#e2e8f0;">EU roaming</strong> — use your data abroad at no extra cost.<br/>
        <strong style="color:#e2e8f0;">Award-winning</strong> — rated #1 for customer satisfaction by Ofcom.
      </p>
    </div>

    <p style="${S.p}">This deal was matched to you because you have an active mobile contract. We only send alerts when we find something genuinely cheaper.</p>
    <p style="${S.p}">Paul, Founder</p>
  </div>
  ${Footer()}
</div>
</div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);

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

  // Deduplicate by EMAIL — one email per person (pick their highest mobile spend)
  // This prevents two emails if the same person has multiple user accounts
  const userMap = new Map<string, MobileUser>();
  for (const row of [...(mobileUsers || []), ...nameMatched]) {
    const p = row.profiles as any;
    const email = (p.email || '').toLowerCase().trim();
    if (!email) continue;
    const existing = userMap.get(email);
    const amount = Number(row.amount);
    if (!existing || amount > existing.amount) {
      userMap.set(email, {
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
