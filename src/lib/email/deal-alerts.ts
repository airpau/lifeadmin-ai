import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

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

  for (const sub of subscriptions) {
    const cat = sub.category || 'other';
    const dealInfo = DEAL_CATEGORIES[cat];
    if (!dealInfo) continue;

    // Skip very small amounts or council tax (can't switch)
    if (sub.amount < 5 || cat === 'council_tax' || cat === 'gambling') continue;

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
      <div style="padding: 20px 24px; ${!isLast ? 'border-bottom: 1px solid #1e293b;' : ''}">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 40px; vertical-align: top; padding-right: 14px;">
              <div style="width: 40px; height: 40px; background: #34d39915; border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px;">${icon}</div>
            </td>
            <td style="vertical-align: top;">
              <div style="font-weight: 700; color: #ffffff; font-size: 15px; letter-spacing: -0.01em;">${a.currentProvider}</div>
              <div style="color: #64748b; font-size: 12px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em;">${catInfo.title}</div>
              <div style="color: #cbd5e1; font-size: 13px; margin-top: 8px; line-height: 1.5;">${a.message}</div>
            </td>
            <td style="width: 100px; vertical-align: top; text-align: right; padding-left: 12px;">
              <div style="font-weight: 800; color: #ffffff; font-size: 18px; letter-spacing: -0.02em;">£${a.currentAmount.toFixed(2)}</div>
              <div style="color: #475569; font-size: 11px; margin-top: 2px;">/month</div>
              <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; margin-top: 10px; background: #34d399; color: #0f172a; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 12px; letter-spacing: 0.02em;">COMPARE</a>
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

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto;">
    <!-- Preheader -->
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #020617;">
      We analysed your bills and found £${potentialSavings} in potential savings this month.
    </div>

    <!-- Header Bar -->
    <div style="background: #0f172a; padding: 20px 32px; border-bottom: 1px solid #1e293b;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">Pay<span style="color: #34d399;">backer</span></td>
          <td style="text-align: right; color: #475569; font-size: 12px;">Weekly Savings Report</td>
        </tr>
      </table>
    </div>

    <!-- Hero Section -->
    <div style="background: linear-gradient(180deg, #0f172a 0%, #1a1f35 100%); padding: 40px 32px; text-align: center;">
      <div style="color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Your potential savings</div>
      <div style="font-size: 48px; font-weight: 800; color: #34d399; letter-spacing: -0.03em; line-height: 1;">£${potentialSavings}</div>
      <div style="color: #475569; font-size: 13px; margin-top: 8px;">per month · based on £${totalMonthlySpend.toFixed(2)} tracked spend</div>
    </div>

    <!-- Intro -->
    <div style="background: #0f172a; padding: 28px 32px;">
      <div style="color: #e2e8f0; font-size: 15px; line-height: 1.7;">
        Hi ${userName},<br><br>
        We have analysed your subscriptions and bills and found <strong style="color: #34d399;">${topAlerts.length} opportunities</strong> where you could be paying less.
      </div>
    </div>

    <!-- Deal Cards -->
    <div style="background: #0f172a; border-top: 2px solid #34d399; margin: 0 24px; border-radius: 0 0 16px 16px;">
      <div style="padding: 16px 24px 8px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Top switching opportunities</div>
      ${alertCards}
    </div>

    <!-- CTA -->
    <div style="padding: 32px; text-align: center;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: linear-gradient(135deg, #34d399 0%, #10b981 100%); color: #0f172a; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 15px; letter-spacing: 0.02em; box-shadow: 0 4px 14px #34d39940;">VIEW ALL DEALS</a>
      <div style="margin-top: 12px; color: #475569; font-size: 12px;">Compare and switch in minutes</div>
    </div>

    <!-- Money Tip -->
    <div style="margin: 0 24px 24px; background: #0f172a; border: 1px solid #34d39922; border-radius: 12px; padding: 20px 24px;">
      <div style="color: #34d399; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">💡 Did you know?</div>
      <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">${tip.body}</div>
    </div>

    <!-- Stats Bar -->
    <div style="margin: 0 24px; background: #0f172a; border-radius: 12px; padding: 16px 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding: 8px;">
            <div style="font-weight: 800; color: #ffffff; font-size: 20px;">${topAlerts.length}</div>
            <div style="color: #475569; font-size: 11px; margin-top: 2px;">Opportunities</div>
          </td>
          <td style="text-align: center; padding: 8px; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b;">
            <div style="font-weight: 800; color: #ffffff; font-size: 20px;">£${totalMonthlySpend.toFixed(0)}</div>
            <div style="color: #475569; font-size: 11px; margin-top: 2px;">Monthly bills</div>
          </td>
          <td style="text-align: center; padding: 8px;">
            <div style="font-weight: 800; color: #34d399; font-size: 20px;">£${potentialSavings}</div>
            <div style="color: #475569; font-size: 11px; margin-top: 2px;">Could save</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding: 32px; text-align: center;">
      <div style="color: #334155; font-size: 11px; line-height: 1.8;">
        Paybacker LTD · UK Company<br>
        AI-powered money recovery · paybacker.co.uk<br><br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #64748b; text-decoration: underline;">Manage email preferences</a> ·
        <a href="https://paybacker.co.uk/privacy-policy" style="color: #64748b; text-decoration: underline;">Privacy policy</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
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
