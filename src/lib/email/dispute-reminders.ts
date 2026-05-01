/**
 * Dispute reminder emails — migrated to canonical PaybackerEmailLayout (2026-05-01).
 */

import { sendPaybackerEmail } from './send';
import { callout, paragraph, orderedList, card } from './PaybackerEmailLayout';

export async function sendDisputeReminderEmail(
  email: string,
  firstName: string,
  dispute: {
    id: string;
    providerName: string;
    daysOld: number;
    amount?: number | null;
  },
  isEscalation: boolean,
): Promise<boolean> {
  const name = firstName || 'there';
  const amountStr = dispute.amount ? ` (£${dispute.amount.toFixed(2)})` : '';
  const dashboardUrl = `https://paybacker.co.uk/dashboard/complaints/${dispute.id}`;

  const built = isEscalation
    ? {
        subject: `Your ${dispute.providerName} dispute is ${dispute.daysOld} days old — time to escalate`,
        preheader: `Your ${dispute.providerName} dispute is ${dispute.daysOld} days old`,
        heading: `It's time to escalate your dispute, ${name}`,
        intro: `Your dispute with <strong>${dispute.providerName}</strong>${amountStr} has been open for ${dispute.daysOld} days.`,
        body: [
          callout(
            'Your consumer rights',
            'Under UK consumer law, if a company has not resolved your complaint within 8 weeks (56 days), you have the right to escalate your case to the relevant ombudsman or regulator free of charge.',
            'danger',
          ),
          paragraph('The ombudsman has the power to force companies to refund you, pay compensation, and issue official apologies.'),
          card(
            orderedList([
              'Go to your dispute in the dashboard',
              'Ask our AI: "Help me draft an ombudsman referral"',
              'Use the drafted letter to open your case',
            ]),
            { eyebrow: 'How to proceed' },
          ),
        ].join('\n'),
        cta: { label: 'Draft escalation letter', href: dashboardUrl },
      }
    : {
        subject: `Follow up on your ${dispute.providerName} dispute`,
        preheader: `Checking in on your ${dispute.providerName} dispute`,
        heading: `Checking in on your dispute, ${name}`,
        intro: `Your dispute with <strong>${dispute.providerName}</strong>${amountStr} was filed ${dispute.daysOld} days ago.`,
        body: [
          callout(
            'Have you received a response?',
            'Most companies are required by industry guidelines to acknowledge official complaints within 5 working days.',
          ),
          paragraph("If they haven't replied, now is the perfect time to send a quick follow-up to keep the pressure on."),
          paragraph(
            `Tip: You can ask the AI chat on the dispute page to <em>"Help me follow up with ${dispute.providerName}"</em> and it will write the email for you.`,
            { muted: true },
          ),
        ].join('\n'),
        cta: { label: 'Update dispute status', href: dashboardUrl },
      };

  const result = await sendPaybackerEmail({
    to: email,
    subject: built.subject,
    preheader: built.preheader,
    heading: built.heading,
    intro: built.intro,
    body: built.body,
    cta: built.cta,
  });
  if (!result.ok) {
    console.error(`Dispute reminder email failed for ${email}:`, result.error);
    return false;
  }
  return true;
}
