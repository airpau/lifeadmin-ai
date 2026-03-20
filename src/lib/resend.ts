import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

// Using Resend sandbox domain until a custom domain is verified at resend.com/domains
export const FROM_EMAIL = 'LifeAdminAI <onboarding@resend.dev>';
export const REPLY_TO = 'lifeadminai@gmail.com';

export async function sendWaitlistConfirmation(name: string, email: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to: email,
    subject: "You're on the LifeAdminAI waitlist 🎉",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <h1 style="color: #f59e0b; font-size: 28px; margin-bottom: 8px;">You're on the list, ${name}!</h1>
        <p style="color: #94a3b8; font-size: 16px; line-height: 1.6;">
          Thanks for joining the LifeAdminAI waitlist. We're building an AI that fights your bills, cancels forgotten subscriptions, and gets your money back — automatically.
        </p>
        <div style="background: #1e293b; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="color: #f59e0b; font-weight: bold; margin: 0 0 8px;">What happens next?</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2;">
            <li>We'll email you when we launch (coming soon)</li>
            <li>Early access members get 3 months free</li>
            <li>Average user saves £847/year</li>
          </ul>
        </div>
        <p style="color: #64748b; font-size: 14px;">— The LifeAdminAI team</p>
      </div>
    `,
  });
}
