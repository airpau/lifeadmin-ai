import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

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
 * Tiered urgency: 60d (blue), 30d (mint), 14d (mint), 7d (red), 3d (red).
 */
export function buildContractEndEmail(
  userName: string,
  contracts: ContractEndAlertData[],
  daysUntilEnd: number,
): { subject: string; html: string } {
  const provider = contracts.length === 1 ? contracts[0].provider_name : `${contracts.length} contracts`;
  const hasDeal = contracts.some((c) => c.potential_saving_monthly && c.potential_saving_monthly > 0);
  const totalSaving = contracts.reduce((sum, c) => sum + (c.potential_saving_monthly || 0), 0);

  const subject = daysUntilEnd <= 7
    ? `${provider} contract ends in ${daysUntilEnd} days — ${hasDeal ? `save £${(totalSaving * 12).toFixed(0)}/yr by switching` : 'review before auto-renewal'}`
    : daysUntilEnd <= 14
      ? `${provider} contract ending soon — ${hasDeal ? 'we found a better deal' : 'time to review'}`
      : `Heads up: ${provider} contract ends in ${daysUntilEnd} days`;

  const urgency = daysUntilEnd <= 7
    ? { color: t.red, bg: '#FEE2E2', border: '#FECACA', text: 'Ending very soon — act now' }
    : daysUntilEnd <= 14
      ? { color: t.mintDeep, bg: t.mintWash, border: '#BBF7D0', text: 'Ending in 2 weeks' }
      : daysUntilEnd <= 30
        ? { color: t.mintDeep, bg: t.mintWash, border: '#BBF7D0', text: 'Contract ending soon' }
        : { color: t.blue, bg: '#DBEAFE', border: '#BFDBFE', text: 'Upcoming contract end date' };

  const contractRows = contracts.map((c) => {
    const endDate = new Date(c.contract_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const dealRow = c.potential_saving_monthly && c.potential_saving_monthly > 0 ? `
      <tr>
        <td colspan="2" style="padding:8px 16px 14px;background:${t.mintWash};">
          <div style="color:${t.mintDeep};font-size:13px;font-weight:600;">
            Switch to ${c.deal_provider || 'a better deal'} and save £${(c.potential_saving_monthly * 12).toFixed(0)}/year
          </div>
          ${c.deal_url ? `<a href="${c.deal_url}" style="${s.link};font-size:12px;">View this deal &rarr;</a>` : ''}
        </td>
      </tr>` : '';

    return `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid ${t.cardBorder};">
        <div style="font-weight:600;color:${t.textStrong};font-size:14px;">${c.provider_name}</div>
        <div style="color:${t.textMuted};font-size:12px;margin-top:2px;">
          ${c.category || 'subscription'} &middot; ends ${endDate}
          ${c.auto_renews ? ` &middot; <span style="color:${t.red};font-weight:600;">auto-renews</span>` : ''}
        </div>
        ${c.current_tariff ? `<div style="color:${t.textMuted};font-size:11px;margin-top:2px;">Current: ${c.current_tariff}</div>` : ''}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid ${t.cardBorder};text-align:right;">
        <div style="font-weight:700;color:${t.textStrong};font-size:16px;">£${c.amount.toFixed(2)}/mo</div>
      </td>
    </tr>${dealRow}`;
  }).join('');

  const autoRenewWarning = contracts.some((c) => c.auto_renews) ? `
    <div style="${s.dangerBox}">
      <div style="color:${t.red};font-weight:700;font-size:13px;margin:0 0 4px;">Auto-renewal warning</div>
      <div style="color:${t.textStrong};font-size:12px;line-height:1.55;">
        ${contracts.filter((c) => c.auto_renews).length === 1
          ? `${contracts.find((c) => c.auto_renews)!.provider_name} will auto-renew at the end of your contract, likely at a higher out-of-contract rate. Switch now to lock in a better price.`
          : `Some of these contracts will auto-renew at a higher rate. Review them now before it's too late.`}
      </div>
    </div>` : '';

  const dealCta = hasDeal ? `
    <div style="${s.tipBox}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:14px;margin:0 0 8px;">We found better deals for you</div>
      <p style="color:${t.text};font-size:13px;line-height:1.6;margin:0 0 14px;">
        Based on your current subscriptions, you could save £${(totalSaving * 12).toFixed(0)} per year by switching. Your personalised deals are ready.
      </p>
      <a href="https://paybacker.co.uk/dashboard/deals" style="${s.cta}">See your better deals &rarr;</a>
    </div>` : '';

  const bodyText = daysUntilEnd <= 7
    ? `Your contract is about to end. If you don't act now, you'll likely be moved to an expensive out-of-contract rate.`
    : daysUntilEnd <= 14
      ? `Your contract is ending soon. Now is a great time to compare deals and lock in a better price before you're moved to the provider's standard rate.`
      : `Your contract end date is approaching. We recommend reviewing your options and comparing deals before it expires.`;

  const body = `
    <div style="background:${urgency.bg};border:1px solid ${urgency.border};border-radius:12px;padding:16px;text-align:center;margin:0 0 24px;">
      <div style="color:${urgency.color};font-weight:700;font-size:14px;">${urgency.text}</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:4px;">
        ${contracts.length === 1 ? `Your ${contracts[0].provider_name} contract ends in ${daysUntilEnd} days` : `${contracts.length} contracts end in the next ${daysUntilEnd} days`}
      </div>
    </div>

    <p style="${s.p}">Hi ${userName},</p>
    <p style="${s.p}">${bodyText}</p>

    ${autoRenewWarning}

    <table role="presentation" style="width:100%;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 24px;">
      ${contractRows}
    </table>

    ${dealCta}

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${s.ctaSecondary}">Review your contracts</a>
    </div>

    <div style="${s.box}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:13px;margin:0 0 4px;">Tip</div>
      <p style="color:${t.text};font-size:12px;line-height:1.55;margin:0;">
        Upload your latest bill to Paybacker and we'll automatically extract your contract end dates, saving you from having to remember them.
      </p>
    </div>
  `;

  return {
    subject,
    html: renderEmail({
      preheader: contracts.length === 1
        ? `Your ${contracts[0].provider_name} contract ends in ${daysUntilEnd} days.`
        : `${contracts.length} contracts ending in ${daysUntilEnd} days.`,
      body,
    }),
  };
}

export async function sendContractEndAlert(
  email: string,
  userName: string,
  contracts: ContractEndAlertData[],
  daysUntilEnd: number,
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
