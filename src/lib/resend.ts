import { Resend } from 'resend';

// Lazy singleton — defers instantiation until first use so that Next.js build-time
// page-data collection doesn't throw "Missing API key" in preview environments
// where RESEND_API_KEY is absent.
let _resend: Resend | undefined;
function getClient() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}
export const resend = new Proxy({} as Resend, {
  get(_, prop) {
    return Reflect.get(getClient(), prop, getClient());
  },
});

// paybacker.co.uk domain is verified in Resend (sending enabled, receiving DISABLED).
// mail.paybacker.co.uk is the receiving-enabled domain — user replies MUST route there or
// they vanish into the void (verified via Resend domains API 2026-04-26).
// FROM stays on the apex so the visible sender looks clean (noreply@paybacker.co.uk).
// REPLY-TO is on the receiving-enabled subdomain so /api/webhooks/resend-inbound fires
// when users reply, which re-opens the ticket so Riley can re-engage.
// Override at deploy-time via RESEND_REPLY_TO env var if you ever flip the apex domain
// to receiving=enabled in Resend.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>';
export const REPLY_TO = process.env.RESEND_REPLY_TO || 'support@mail.paybacker.co.uk';

export async function sendWaitlistConfirmation(name: string, email: string) {
  // Migrated to canonical PaybackerEmailLayout (2026-05-01).
  // Imported lazily to avoid pulling layout module into bundles that don't need it.
  const { sendPaybackerEmail } = await import('@/lib/email/send');
  const { card, unorderedList } = await import('@/lib/email/PaybackerEmailLayout');
  return sendPaybackerEmail({
    to: email,
    subject: "You're on the Paybacker waitlist",
    preheader: "You're on the list — early access perks ahead",
    heading: `You're on the list, ${name}`,
    intro:
      "Thanks for joining Paybacker. We're building an AI that fights your bills, cancels forgotten subscriptions, and gets your money back — automatically.",
    body: card(
      unorderedList([
        "We'll email you when we launch (coming soon)",
        'Early access members get 3 months free',
        'First look at every new feature we ship',
      ]),
      { eyebrow: 'What happens next' },
    ),
  });
}
