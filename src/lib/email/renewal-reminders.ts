import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

interface RenewalSubscription {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
}

/**
 * Build a renewal reminder email for upcoming subscription renewals.
 */
export function buildRenewalEmail(
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number
): { subject: string; html: string } {
  const totalRenewing = renewals.reduce((sum, r) => sum + r.amount, 0);

  const subject = daysUntilRenewal <= 7
    ? `${userName}, ${renewals.length} ${renewals.length === 1 ? 'subscription renews' : 'subscriptions renew'} in ${daysUntilRenewal} days`
    : `Heads up: ${renewals.length} ${renewals.length === 1 ? 'renewal' : 'renewals'} coming up`;

  const urgency = daysUntilRenewal <= 7
    ? { color: '#ef4444', text: 'Renewing soon — act now' }
    : daysUntilRenewal <= 14
      ? { color: '#f59e0b', text: 'Renewing in 2 weeks' }
      : { color: '#3b82f6', text: 'Upcoming renewal' };

  const rows = renewals.map((r) => `
    <tr>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b;">
        <div style="font-weight: 600; color: #ffffff; font-size: 14px;">${r.provider_name}</div>
        <div style="color: #64748b; font-size: 12px; margin-top: 2px;">${r.category || 'subscription'} · renews ${new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
      </td>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b; text-align: right;">
        <div style="font-weight: 700; color: #ffffff; font-size: 16px;">£${r.amount.toFixed(2)}</div>
        <div style="color: #64748b; font-size: 11px;">/${r.billing_cycle}</div>
      </td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; padding: 24px 0;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff;">Pay<span style="color: #f59e0b;">backer</span></div>
    </div>

    <!-- Urgency Banner -->
    <div style="background: ${urgency.color}22; border: 1px solid ${urgency.color}44; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <div style="color: ${urgency.color}; font-weight: 700; font-size: 14px;">${urgency.text}</div>
      <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">£${totalRenewing.toFixed(2)} renewing in the next ${daysUntilRenewal} days</div>
    </div>

    <div style="color: #e2e8f0; font-size: 15px; margin-bottom: 20px; line-height: 1.6;">
      Hi ${userName},<br><br>
      ${daysUntilRenewal <= 7
        ? 'These subscriptions are renewing very soon. Now is the time to check if you still need them or if there is a better deal available.'
        : 'These subscriptions are coming up for renewal. It is worth checking if you are still getting the best deal.'}
    </div>

    <table style="width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${rows}
    </table>

    <div style="text-align: center; margin: 32px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px; margin-right: 12px;">Review Subscriptions</a>
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #1e293b; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">Find Better Deals</a>
    </div>

    <div style="background: #0f172a; border: 1px solid #1e293b44; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <div style="color: #f59e0b; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Did you know?</div>
      <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        Paybacker can generate a cancellation email for any subscription in seconds, citing the correct UK consumer law. Just click on any subscription in your dashboard.
      </div>
    </div>

    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #1e293b;">
      <div style="color: #64748b; font-size: 12px; line-height: 1.6;">
        Paybacker LTD · paybacker.co.uk<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #f59e0b; text-decoration: none;">Manage preferences</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a renewal reminder email.
 */
export async function sendRenewalReminder(
  email: string,
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number
): Promise<boolean> {
  if (renewals.length === 0) return false;

  const { subject, html } = buildRenewalEmail(userName, renewals, daysUntilRenewal);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error(`Renewal reminder failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Renewal reminder error for ${email}:`, err);
    return false;
  }
}
