import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build_only');

// paybacker.co.uk domain is verified in Resend — RESEND_FROM_EMAIL set to noreply@, REPLY_TO set to support@
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>';
export const REPLY_TO = 'support@paybacker.co.uk';

export async function sendWaitlistConfirmation(name: string, email: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to: email,
    subject: "You're on the Paybacker waitlist 🎉",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <h1 style="color: #34d399; font-size: 28px; margin-bottom: 8px;">You're on the list, ${name}!</h1>
        <p style="color: #94a3b8; font-size: 16px; line-height: 1.6;">
          Thanks for joining Paybacker. We're building an AI that fights your bills, cancels forgotten subscriptions, and gets your money back — automatically.
        </p>
        <div style="background: #1e293b; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="color: #34d399; font-weight: bold; margin: 0 0 8px;">What happens next?</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2;">
            <li>We'll email you when we launch (coming soon)</li>
            <li>Early access members get 3 months free</li>
            <li>First look at every new feature we ship</li>
          </ul>
        </div>
        <p style="color: #64748b; font-size: 14px;">— The Paybacker team</p>
      </div>
    `,
  });
}
