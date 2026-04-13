import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

interface ContractEndAlertData {
  provider_name: string;
  amount: number;
  category: string | null;
  contract_end_date: string;
  auto_renews: boolean;
  current_tariff?: string | null;
  deal_provider?: string | null;
  deal_price?: number | null;
  potential_saving_monthly?: number | null;
  deal_url?: string | null;
}

/**
 * Build a contract end date alert email.
 * Tiered urgency: 60d (blue), 30d (amber), 14d (amber), 7d (red), 3d (red).
 */
export function buildContractEndEmail(
  userName: string,
  contracts: ContractEndAlertData[],
  daysUntilEnd: number
): { subject: string; html: string } {
  const provider = contracts.length === 1 ? contracts[0].provider_name : `${contracts.length} contracts`;
  const hasDeal = contracts.some(c => c.potential_saving_monthly && c.potential_saving_monthly > 0);
  const totalSaving = contracts.reduce((sum, c) => sum + (c.potential_saving_monthly || 0), 0);

  const subject = daysUntilEnd <= 7
    ? `⚠️ ${provider} contract ends in ${daysUntilEnd} days — ${hasDeal ? `save £${(totalSaving * 12).toFixed(0)}/yr by switching` : 'review before auto-renewal'}`
    : daysUntilEnd <= 14
      ? `${provider} contract ending soon — ${hasDeal ? 'we found a better deal' : 'time to review'}`
      : `Heads up: ${provider} contract ends in ${daysUntilEnd} days`;

  const urgency = daysUntilEnd <= 7
    ? { color: '#ef4444', bg: '#ef444422', text: 'Ending very soon — act now', icon: '🚨' }
    : daysUntilEnd <= 14
      ? { color: '#f59e0b', bg: '#f59e0b22', text: 'Ending in 2 weeks', icon: '⏰' }
      : daysUntilEnd <= 30
        ? { color: '#f59e0b', bg: '#f59e0b22', text: 'Contract ending soon', icon: '📅' }
        : { color: '#3b82f6', bg: '#3b82f622', text: 'Upcoming contract end date', icon: '📋' };

  const contractRows = contracts.map(c => {
    const endDate = new Date(c.contract_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const dealRow = c.potential_saving_monthly && c.potential_saving_monthly > 0 ? `
      <tr>
        <td colspan="2" style="padding: 8px 16px 14px; background: #34d39911;">
          <div style="color: #34d399; font-size: 13px; font-weight: 600;">
            💰 Switch to ${c.deal_provider || 'a better deal'} and save £${(c.potential_saving_monthly * 12).toFixed(0)}/year
          </div>
          ${c.deal_url ? `<a href="${c.deal_url}" style="color: #34d399; font-size: 12px; text-decoration: underline;">View this deal →</a>` : ''}
        </td>
      </tr>` : '';

    return `
    <tr>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b;">
        <div style="font-weight: 600; color: #ffffff; font-size: 14px;">${c.provider_name}</div>
        <div style="color: #64748b; font-size: 12px; margin-top: 2px;">
          ${c.category || 'subscription'} · ends ${endDate}
          ${c.auto_renews ? ' · <span style="color: #ef4444;">auto-renews</span>' : ''}
        </div>
        ${c.current_tariff ? `<div style="color: #64748b; font-size: 11px; margin-top: 2px;">Current: ${c.current_tariff}</div>` : ''}
      </td>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b; text-align: right;">
        <div style="font-weight: 700; color: #ffffff; font-size: 16px;">£${c.amount.toFixed(2)}/mo</div>
      </td>
    </tr>${dealRow}`;
  }).join('');

  const autoRenewWarning = contracts.some(c => c.auto_renews) ? `
    <div style="background: #ef444422; border: 1px solid #ef444444; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <div style="color: #ef4444; font-weight: 600; font-size: 13px;">⚠️ Auto-renewal warning</div>
      <div style="color: #94a3b8; font-size: 12px; margin-top: 4px;">
        ${contracts.filter(c => c.auto_renews).length === 1
          ? `${contracts.find(c => c.auto_renews)!.provider_name} will auto-renew at the end of your contract, likely at a higher out-of-contract rate. Switch now to lock in a better price.`
          : `Some of these contracts will auto-renew at a higher rate. Review them now before it's too late.`}
      </div>
    </div>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; padding: 24px 0;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; background: #0a1628; padding: 12px 20px; border-radius: 8px; display: inline-block;">Pay<span style="color: #34d399;">backer</span></div>
    </div>

    <!-- Urgency Banner -->
    <div style="background: ${urgency.bg}; border: 1px solid ${urgency.color}44; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <div style="color: ${urgency.color}; font-weight: 700; font-size: 14px;">${urgency.icon} ${urgency.text}</div>
      <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">
        ${contracts.length === 1 ? `Your ${contracts[0].provider_name} contract ends in ${daysUntilEnd} days` : `${contracts.length} contracts end in the next ${daysUntilEnd} days`}
      </div>
    </div>

    <div style="color: #e2e8f0; font-size: 15px; margin-bottom: 20px; line-height: 1.6;">
      Hi ${userName},<br><br>
      ${daysUntilEnd <= 7
        ? 'Your contract is about to end. If you don\'t act now, you\'ll likely be moved to an expensive out-of-contract rate.'
        : daysUntilEnd <= 14
          ? 'Your contract is ending soon. Now is a great time to compare deals and lock in a better price before you\'re moved to the provider\'s standard rate.'
          : 'Your contract end date is approaching. We recommend reviewing your options and comparing deals before it expires.'}
    </div>

    ${autoRenewWarning}

    <table style="width: 100%; background: #0a1628; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${contractRows}
    </table>

    <!-- Deal CTA -->
    ${hasDeal ? `
    <div style="background: #0a1628; border: 1px solid #34d39944; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
      <div style="color: #34d399; font-weight: 700; font-size: 14px; margin-bottom: 8px;">💰 We found better deals for you</div>
      <div style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
        Based on your current subscriptions, you could save £${(totalSaving * 12).toFixed(0)} per year by switching. Your personalised deals are ready.
      </div>
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #34d399; color: #0a1628; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px;">See Your Better Deals →</a>
    </div>` : ''}

    <div style="text-align: center; margin: 24px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display: inline-block; background: #34d399; color: #0a1628; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Review Your Contracts</a>
    </div>

    <div style="background: #0a1628; border: 1px solid #34d39922; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <div style="color: #34d399; font-weight: 600; font-size: 13px; margin-bottom: 4px;">💡 Tip</div>
      <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        Upload your latest bill to Paybacker and we'll automatically extract your contract end dates, saving you from having to remember them.
      </div>
    </div>

    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #1e293b;">
      <div style="color: #64748b; font-size: 12px; line-height: 1.6;">
        Paybacker LTD · paybacker.co.uk<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #34d399; text-decoration: none;">Manage preferences</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a contract end date alert email.
 */
export async function sendContractEndAlert(
  email: string,
  userName: string,
  contracts: ContractEndAlertData[],
  daysUntilEnd: number
): Promise<boolean> {
  if (contracts.length === 0) return false;

  const { subject, html } = buildContractEndEmail(userName, contracts, daysUntilEnd);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error(`Contract end alert failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Contract end alert error for ${email}:`, err);
    return false;
  }
}
