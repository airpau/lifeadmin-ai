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

  const alertRows = topAlerts.map((a) => {
    const catInfo = DEAL_CATEGORIES[a.category] || { title: a.category, description: a.category };
    return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #1e293b;">
          <div style="font-weight: 600; color: #ffffff; font-size: 15px;">${a.currentProvider}</div>
          <div style="color: #94a3b8; font-size: 13px; margin-top: 2px;">${catInfo.title} — £${a.currentAmount.toFixed(2)}/month</div>
          <div style="color: #f59e0b; font-size: 13px; margin-top: 6px;">${a.message}</div>
        </td>
        <td style="padding: 16px; border-bottom: 1px solid #1e293b; text-align: right; vertical-align: top;">
          <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Find Deal</a>
        </td>
      </tr>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <!-- Header -->
    <div style="text-align: center; padding: 24px 0;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff;">Pay<span style="color: #f59e0b;">backer</span></div>
    </div>

    <!-- Hero -->
    <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 36px; font-weight: 700; color: #f59e0b; margin-bottom: 8px;">£${potentialSavings}</div>
      <div style="font-size: 14px; color: #94a3b8;">Estimated monthly savings available</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Based on your tracked spend of £${totalMonthlySpend.toFixed(2)}/month</div>
    </div>

    <!-- Intro -->
    <div style="color: #e2e8f0; font-size: 15px; margin-bottom: 24px; line-height: 1.6;">
      Hi ${userName},<br><br>
      We have analysed your subscriptions and bills and found ${topAlerts.length} opportunities where you could be paying less. Here are your top savings opportunities:
    </div>

    <!-- Deal Alerts Table -->
    <table style="width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${alertRows}
    </table>

    <!-- CTA -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px;">View All Deals</a>
    </div>

    <!-- Tip -->
    <div style="background: #0f172a; border: 1px solid #f59e0b33; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div style="color: #f59e0b; font-weight: 600; font-size: 14px; margin-bottom: 6px;">Money-saving tip</div>
      <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        The FCA banned loyalty penalties for home and car insurance in 2022. If your renewal quote is higher than last year, you have every right to shop around. Companies are required to offer existing customers the same price as new customers.
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #1e293b;">
      <div style="color: #64748b; font-size: 12px; line-height: 1.6;">
        Paybacker LTD · paybacker.co.uk<br>
        You received this because you have an active Paybacker account.<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #f59e0b; text-decoration: none;">Manage preferences</a>
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
