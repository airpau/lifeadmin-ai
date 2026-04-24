import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

// Deal categories we can offer alternatives for
const DEAL_CATEGORIES: Record<string, { title: string; description: string; switchMessage: string }> = {
  energy: {
    title: 'Energy',
    description: 'gas and electricity',
    switchMessage: 'Energy prices vary massively between suppliers. Switching could save you hundreds per year.',
  },
  broadband: {
    title: 'Broadband',
    description: 'broadband and home internet',
    switchMessage: 'Out-of-contract broadband prices are often double what new customers pay. Time to switch.',
  },
  mobile: {
    title: 'Mobile',
    description: 'mobile phone plan',
    switchMessage: 'SIM-only deals are often half the price of contract phones. Check if you can save.',
  },
  car_insurance: {
    title: 'Car Insurance',
    description: 'car insurance',
    switchMessage: 'Auto-renewal loyalty penalties are now banned by the FCA. Shop around for a better quote.',
  },
  insurance: {
    title: 'Insurance',
    description: 'insurance',
    switchMessage: 'Insurance renewals often increase. Compare quotes to make sure you are getting the best deal.',
  },
  pet_insurance: {
    title: 'Pet Insurance',
    description: 'pet insurance',
    switchMessage: 'Pet insurance premiums increase with age. Compare to check you are not overpaying.',
  },
  mortgage: {
    title: 'Mortgage',
    description: 'mortgage',
    switchMessage: 'If your fixed rate is ending, remortgaging could save you thousands. Even a small rate reduction makes a big difference.',
  },
  credit_card: {
    title: 'Credit Card',
    description: 'credit card',
    switchMessage: 'Balance transfer cards with 0% interest could save you hundreds in interest payments.',
  },
  loan: {
    title: 'Loan',
    description: 'loan',
    switchMessage: 'Consolidating multiple loans into one could reduce your monthly payments and total interest.',
  },
  car_finance: {
    title: 'Car Finance',
    description: 'car finance',
    switchMessage: 'Car finance rates vary widely. Refinancing could reduce your monthly payment.',
  },
  streaming: {
    title: 'Streaming',
    description: 'streaming subscriptions',
    switchMessage: 'You might be paying for streaming services you rarely use. Review and save.',
  },
  fitness: {
    title: 'Fitness',
    description: 'gym membership',
    switchMessage: 'Gym memberships vary hugely in price. Budget gyms offer the same equipment for a fraction of the cost.',
  },
};

interface UserSubscription {
  provider_name: string;
  amount: number;
  category: string | null;
  billing_cycle: string;
}

interface DealAlert {
  category: string;
  currentProvider: string;
  currentAmount: number;
  message: string;
}

/**
 * Analyse a user's subscriptions and identify deal switching opportunities.
 */
export function findDealOpportunities(subscriptions: UserSubscription[]): DealAlert[] {
  const alerts: DealAlert[] = [];

  // Categories that should never show deal suggestions
  const excludedCats = new Set([
    'mortgage', 'loan', 'council_tax', 'tax', 'fee', 'parking',
    'credit_card', 'car_finance', 'gambling',
  ]);

  for (const sub of subscriptions) {
    const cat = sub.category || 'other';
    const dealInfo = DEAL_CATEGORIES[cat];
    if (!dealInfo) continue;

    // Skip null categories, excluded categories, and very small amounts
    if (!sub.category) continue;
    if (excludedCats.has(cat)) continue;
    if (sub.amount < 5) continue;

    alerts.push({
      category: cat,
      currentProvider: sub.provider_name,
      currentAmount: sub.amount,
      message: dealInfo.switchMessage,
    });
  }

  // Sort by amount descending — biggest savings opportunities first
  return alerts.sort((a, b) => b.currentAmount - a.currentAmount);
}

/**
 * Generate an HTML deal alert email for a user.
 */
export function buildDealAlertEmail(
  userName: string,
  alerts: DealAlert[],
  totalMonthlySpend: number
): { subject: string; html: string } {
  const topAlerts = alerts.slice(0, 5); // Max 5 deals per email
  const potentialSavings = Math.round(totalMonthlySpend * 0.15); // Estimate 15% savings

  const subject = `${userName}, we found ${topAlerts.length} ways to save on your bills`;

  const categoryIcons: Record<string, string> = {
    energy: '⚡', broadband: '📡', mobile: '📱', car_insurance: '🚗', insurance: '🛡️',
    pet_insurance: '🐾', mortgage: '🏠', credit_card: '💳', loan: '🏦', car_finance: '🚗',
    streaming: '📺', fitness: '💪',
  };

  const alertCards = topAlerts.map((a, i) => {
    const catInfo = DEAL_CATEGORIES[a.category] || { title: a.category, description: a.category };
    const icon = categoryIcons[a.category] || '💰';
    const isLast = i === topAlerts.length - 1;
    return `
      <div style="padding:20px 24px;${!isLast ? `border-bottom:1px solid ${t.cardBorder};` : ''}">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:40px;vertical-align:top;padding-right:14px;">
              <div style="width:40px;height:40px;background:${t.mintWash};border-radius:10px;text-align:center;line-height:40px;font-size:20px;">${icon}</div>
            </td>
            <td style="vertical-align:top;">
              <div style="font-weight:700;color:${t.textStrong};font-size:15px;letter-spacing:-0.01em;">${a.currentProvider}</div>
              <div style="color:${t.textMuted};font-size:12px;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">${catInfo.title}</div>
              <div style="color:${t.text};font-size:13px;margin-top:8px;line-height:1.5;">${a.message}</div>
            </td>
            <td style="width:100px;vertical-align:top;text-align:right;padding-left:12px;">
              <div style="font-weight:800;color:${t.textStrong};font-size:18px;letter-spacing:-0.02em;">£${a.currentAmount.toFixed(2)}</div>
              <div style="color:${t.textMuted};font-size:11px;margin-top:2px;">/month</div>
              <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;margin-top:10px;background:${t.mint};color:#FFFFFF !important;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:0.02em;">COMPARE</a>
            </td>
          </tr>
        </table>
      </div>
    `;
  }).join('');

  // Rotate through money-saving tips
  const tips = [
    { title: 'FCA loyalty penalty ban', body: 'Since 2022, insurers cannot charge existing customers more than new customers for home and car insurance. If your renewal went up, challenge it.' },
    { title: 'Energy credit refunds', body: 'Your energy supplier must refund any credit on your account within 10 working days if you ask. The average UK household is owed around £150.' },
    { title: 'Section 75 protection', body: 'Credit card purchases between £100 and £30,000 are protected under Section 75. If something goes wrong, your card provider is jointly liable.' },
    { title: 'Broadband exit rights', body: 'Under Ofcom rules, if your broadband speed is consistently below what was advertised, you can exit your contract penalty-free.' },
    { title: 'Flight delay compensation', body: 'Flights delayed over 3 hours from a UK airport could entitle you to up to £520 per person under UK261. Airlines count on you not claiming.' },
  ];
  const tip = tips[Math.floor(Math.random() * tips.length)];

  const body = `
    <div style="background:${t.mintWash};border-radius:12px;padding:32px 24px;text-align:center;margin:0 0 24px;">
      <div style="color:${t.mintDeep};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;font-weight:700;">Your potential savings</div>
      <div style="font-size:48px;font-weight:800;color:${t.mintDeep};letter-spacing:-0.03em;line-height:1;">£${potentialSavings}</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:8px;">per month &middot; based on £${totalMonthlySpend.toFixed(2)} tracked spend</div>
    </div>

    <p style="${s.p}">Hi ${userName}, we've analysed your subscriptions and bills and found <strong style="${s.strong};color:${t.mintDeep};">${topAlerts.length} opportunities</strong> where you could be paying less.</p>

    <div style="background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;overflow:hidden;margin:0 0 24px;">
      <div style="padding:16px 24px 8px;color:${t.textMuted};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Top switching opportunities</div>
      ${alertCards}
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="${s.cta}">View all deals</a>
    </div>

    <div style="${s.tipBox}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">${tip.title}</div>
      <div style="color:${t.textStrong};font-size:13px;line-height:1.6;">${tip.body}</div>
    </div>

    <table role="presentation" style="width:100%;background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;padding:16px 24px;border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="text-align:center;padding:8px;">
          <div style="font-weight:800;color:${t.textStrong};font-size:20px;">${topAlerts.length}</div>
          <div style="color:${t.textMuted};font-size:11px;margin-top:2px;">Opportunities</div>
        </td>
        <td style="text-align:center;padding:8px;border-left:1px solid ${t.cardBorder};border-right:1px solid ${t.cardBorder};">
          <div style="font-weight:800;color:${t.textStrong};font-size:20px;">£${totalMonthlySpend.toFixed(0)}</div>
          <div style="color:${t.textMuted};font-size:11px;margin-top:2px;">Monthly bills</div>
        </td>
        <td style="text-align:center;padding:8px;">
          <div style="font-weight:800;color:${t.mintDeep};font-size:20px;">£${potentialSavings}</div>
          <div style="color:${t.textMuted};font-size:11px;margin-top:2px;">Could save</div>
        </td>
      </tr>
    </table>
  `;

  return {
    subject,
    html: renderEmail({
      preheader: `We analysed your bills and found £${potentialSavings}/mo in potential savings.`,
      body,
    }),
  };
}

/**
 * Send a deal alert email to a user.
 */
export async function sendDealAlertEmail(
  email: string,
  userName: string,
  alerts: DealAlert[],
  totalMonthlySpend: number
): Promise<boolean> {
  if (alerts.length === 0) return false;

  const { subject, html } = buildDealAlertEmail(userName, alerts, totalMonthlySpend);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });

    if (error) {
      console.error(`Deal alert email failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Deal alert email error for ${email}:`, err);
    return false;
  }
}
