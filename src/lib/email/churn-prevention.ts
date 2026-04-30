import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

type ChurnEmailType = 'inactive_7d' | 'inactive_14d' | 'pre_renewal';

const SUBJECTS: Record<ChurnEmailType, string> = {
  inactive_7d: 'We found new savings opportunities for you',
  inactive_14d: 'New savings detected since your last visit',
  pre_renewal: 'This month with Paybacker: here is what you saved',
};

function buildEmail(type: ChurnEmailType, name: string, data: Record<string, any>): string {
  const header = `
    <div style="background:#F9FAFB;padding:24px 32px;border-bottom:1px solid #F9FAFB;text-align:center;">
      <a href="https://paybacker.co.uk" style="text-decoration:none;">
        <span style="font-size:22px;font-weight:800;color:#0B1220;">Pay<span style="color:#059669;">backer</span></span>
      </a>
    </div>`;

  const footer = `
    <div style="padding:20px 32px;border-top:1px solid #F9FAFB;text-align:center;">
      <p style="color:#4B5563;font-size:12px;line-height:1.6;margin:0;">
        <a href="https://paybacker.co.uk" style="color:#059669;text-decoration:none;font-weight:600;">Paybacker LTD</a> · ICO Registered · UK Company<br/>
        <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#4B5563;text-decoration:none;">Unsubscribe</a>
      </p>
    </div>`;

  const cta = (text: string, href: string) =>
    `<div style="text-align:center;margin:28px 0;">
      <a href="${href}" style="display:inline-block;background:#059669;color:#0B1220;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;">${text}</a>
    </div>`;

  let body = '';

  if (type === 'inactive_7d') {
    const subCount = data.activeSubscriptions || 0;
    const monthlySpend = data.monthlySpend ? `£${Math.round(data.monthlySpend)}` : 'unknown';
    const expiringCount = data.expiringContracts || 0;

    body = `
      <h1 style="color:#0B1220;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;">We have been keeping an eye on things, ${name}</h1>
      <p style="color:#E5E7EB;font-size:15px;line-height:1.75;margin:0 0 16px;">While you have been away, Paybacker has been monitoring your finances. Here is what we found:</p>

      <div style="background:#F9FAFB;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #059669;">
        <p style="color:#059669;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Your snapshot</p>
        <p style="color:#E5E7EB;margin:0 0 8px;font-size:14px;"><strong>${subCount}</strong> active subscriptions costing <strong>${monthlySpend}/month</strong></p>
        ${expiringCount > 0 ? `<p style="color:#059669;margin:0 0 8px;font-size:14px;font-weight:600;">${expiringCount} contract${expiringCount > 1 ? 's' : ''} expiring soon. Review before they auto-renew at a higher rate.</p>` : ''}
        <p style="color:#6B7280;margin:0;font-size:14px;">Log in to see if any of your providers have cheaper deals available.</p>
      </div>

      ${cta('Check your dashboard', 'https://paybacker.co.uk/dashboard')}

      <p style="color:#6B7280;font-size:14px;margin:0;">Tip: connect your bank account to automatically detect all subscriptions and get spending alerts.</p>`;
  }

  if (type === 'inactive_14d') {
    body = `
      <h1 style="color:#0B1220;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;">It has been a while, ${name}</h1>
      <p style="color:#E5E7EB;font-size:15px;line-height:1.75;margin:0 0 16px;">We have noticed you haven't logged in for two weeks. Here are three quick things you can do in under 2 minutes:</p>

      <div style="background:#F9FAFB;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #059669;">
        <p style="color:#E5E7EB;font-weight:600;margin:0 0 6px;font-size:15px;">1. Run a quick scan</p>
        <p style="color:#6B7280;margin:0 0 16px;font-size:14px;">Check if any subscriptions have increased their prices since your last visit.</p>

        <p style="color:#E5E7EB;font-weight:600;margin:0 0 6px;font-size:15px;">2. Check your spending</p>
        <p style="color:#6B7280;margin:0 0 16px;font-size:14px;">See where your money went this month with our category breakdown.</p>

        <p style="color:#E5E7EB;font-weight:600;margin:0 0 6px;font-size:15px;">3. Write a complaint letter</p>
        <p style="color:#6B7280;margin:0;font-size:14px;">Been overcharged? Our AI writes a professional complaint citing UK law in 30 seconds.</p>
      </div>

      ${cta('Log in to Paybacker', 'https://paybacker.co.uk/dashboard')}

      <div style="background:#F9FAFB;border-left:3px solid #059669;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="color:#059669;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Did you know?</p>
        <p style="color:#6B7280;margin:0;font-size:14px;line-height:1.6;">UK households overpay by an average of £1,000+ per year on bills and subscriptions. One complaint letter could pay for itself many times over.</p>
      </div>`;
  }

  if (type === 'pre_renewal') {
    const tier = data.tier || 'Essential';
    const renewalDate = data.renewalDate || 'soon';
    const lettersGenerated = data.lettersGenerated || 0;
    const subsTracked = data.subsTracked || 0;

    body = `
      <h1 style="color:#0B1220;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;">Your Paybacker month in review, ${name}</h1>
      <p style="color:#E5E7EB;font-size:15px;line-height:1.75;margin:0 0 16px;">Your ${tier} plan renews on ${renewalDate}. Here is what Paybacker has done for you:</p>

      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#F9FAFB;border:1px solid #F9FAFB;border-radius:12px;padding:20px 24px;margin:4px;min-width:120px;">
          <p style="color:white;font-size:28px;font-weight:800;margin:0;">${lettersGenerated}</p>
          <p style="color:#6B7280;font-size:12px;margin:4px 0 0;">Letters generated</p>
        </div>
        <div style="display:inline-block;background:#F9FAFB;border:1px solid #F9FAFB;border-radius:12px;padding:20px 24px;margin:4px;min-width:120px;">
          <p style="color:white;font-size:28px;font-weight:800;margin:0;">${subsTracked}</p>
          <p style="color:#6B7280;font-size:12px;margin:4px 0 0;">Subscriptions tracked</p>
        </div>
      </div>

      ${lettersGenerated > 0 ?
        `<p style="color:#059669;font-size:15px;text-align:center;margin:0 0 16px;font-weight:600;">You are actively taking charge of your finances.</p>` :
        `<p style="color:#6B7280;font-size:15px;text-align:center;margin:0 0 16px;">Write your first complaint letter to start recovering money.</p>`
      }

      ${cta('View your dashboard', 'https://paybacker.co.uk/dashboard')}`;
  }

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      ${header}
      <div style="padding:32px;">${body}
        <p style="color:#6B7280;font-size:14px;margin:24px 0 0;">Paul, Founder</p>
      </div>
      ${footer}
    </div>`;
}

export async function sendChurnEmail(
  email: string,
  firstName: string,
  type: ChurnEmailType,
  data: Record<string, any> = {},
): Promise<boolean> {
  try {
    const name = firstName || 'there';
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: SUBJECTS[type],
      html: buildEmail(type, name, data),
    });
    return true;
  } catch (err: any) {
    console.error(`[churn] Failed to send ${type} to ${email}:`, err.message);
    return false;
  }
}
