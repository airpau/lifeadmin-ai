/**
 * Bank consent renewal reminder emails (Yapily build review, step 9).
 *
 * UK open banking rules cap account-information consent at 90 days, after
 * which the user must actively reconfirm or the bank stops sharing data.
 *
 * Why this file exists: the only pre-expiry notification we had was a
 * WhatsApp template, which is Pro-only. Free and Essential users got
 * nothing at all — their bank feed simply stopped, and they found out by
 * noticing missing transactions. Yapily's build review asks how a user is
 * prompted before expiry; "only if they pay for Pro" is not an answer.
 *
 * These are TRANSACTIONAL, not marketing: the user is being told a thing
 * they explicitly set up is about to stop working. Hence variant
 * 'standard' with no unsubscribeUrl — see MissingUnsubscribeUrlError in
 * ./send for why marketing sends are treated differently.
 */

import { sendPaybackerEmail } from './send';
import { callout, paragraph, orderedList, card } from './PaybackerEmailLayout';

export interface ConsentRenewalReminderInput {
  /** Display name of the bank, e.g. "NatWest". */
  bankName: string;
  /**
   * Whole days until the consent expires. Zero or negative means it has
   * already lapsed, which changes the copy from a warning to a recovery
   * prompt — those are meaningfully different messages and conflating
   * them reads as careless.
   */
  daysLeft: number;
}

export async function sendConsentRenewalReminderEmail(
  email: string,
  firstName: string,
  input: ConsentRenewalReminderInput,
): Promise<boolean> {
  const name = firstName || 'there';
  const bank = input.bankName || 'your bank';
  const moneyHubUrl = 'https://paybacker.co.uk/dashboard/money-hub';
  const hasExpired = input.daysLeft <= 0;

  const built = hasExpired
    ? {
        subject: `Your ${bank} connection has stopped — one tap to restore it`,
        preheader: `Reconnect ${bank} to resume tracking your money`,
        heading: `Your ${bank} connection needs renewing, ${name}`,
        intro: `Open banking rules require your permission to be reconfirmed every 90 days. Your <strong>${bank}</strong> connection has now reached that limit, so we've stopped receiving new transactions.`,
        body: [
          callout(
            'What this means',
            "Nothing has been lost — your history, disputes and tracked payments are all exactly where you left them. We just can't see anything new until you reconfirm.",
            'danger',
          ),
          paragraph(
            'While the connection is paused we cannot spot price rises, catch duplicate charges, or warn you about direct debits you may not be able to cover.',
          ),
          card(
            orderedList([
              'Open Money Hub',
              `Find the ${bank} card at the top of the page`,
              'Tap Renew — it takes about ten seconds',
            ]),
            { eyebrow: 'How to restore it' },
          ),
        ].join('\n'),
        cta: { label: `Renew ${bank}`, href: moneyHubUrl },
      }
    : {
        subject: `Your ${bank} connection expires in ${input.daysLeft} ${input.daysLeft === 1 ? 'day' : 'days'}`,
        preheader: `Reconfirm ${bank} before it pauses in ${input.daysLeft} ${input.daysLeft === 1 ? 'day' : 'days'}`,
        heading: `Quick renewal needed, ${name}`,
        intro: `Open banking rules require your permission to be reconfirmed every 90 days. Your <strong>${bank}</strong> connection reaches that point in <strong>${input.daysLeft} ${input.daysLeft === 1 ? 'day' : 'days'}</strong>.`,
        body: [
          callout(
            'Renew now and nothing changes',
            'One tap extends your existing permission. You will not need to log in to your bank again, and your transaction history stays exactly as it is.',
          ),
          paragraph(
            'If you let it lapse, we stop receiving new transactions — which means no price-rise alerts, no duplicate-charge detection, and no low-balance warnings until you reconnect.',
          ),
          paragraph(
            'This is a requirement of UK open banking regulation, not a Paybacker setting — every provider has to ask.',
            { muted: true },
          ),
        ].join('\n'),
        cta: { label: 'Renew in one tap', href: moneyHubUrl },
      };

  const result = await sendPaybackerEmail({
    to: email,
    subject: built.subject,
    preheader: built.preheader,
    heading: built.heading,
    intro: built.intro,
    body: built.body,
    cta: built.cta,
    tags: [
      { name: 'category', value: 'consent_renewal' },
      { name: 'state', value: hasExpired ? 'expired' : 'expiring_soon' },
    ],
  });

  if (!result.ok) {
    console.error(`[consent-renewal] reminder email failed for ${email}:`, result.error);
    return false;
  }
  return true;
}
