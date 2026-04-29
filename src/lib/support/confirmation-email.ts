/**
 * Shared support-ticket confirmation email.
 *
 * Why this exists: previously the user-bot's createSupportTicket
 * sent its own (older-format) email IMMEDIATELY at ticket
 * creation, and the support-agent cron sent a DIFFERENT (newer-
 * format) email on its first pass. Result: every user got two
 * confirmation emails with different copy. Paul flagged this on
 * 2026-04-29 for TKT-0018.
 *
 * This module is the ONE confirmation template. Both call sites
 * (bot, cron) import it. Whichever fires first marks the ticket
 * `metadata.confirmation_sent = true`; the other one no-ops.
 */

import { Resend } from 'resend';

const REPLY_TO = process.env.RESEND_REPLY_TO || 'support@paybacker.co.uk';
const FROM = process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>';

export async function sendTicketConfirmationEmail(args: {
  toEmail: string;
  userFirstName: string;
  ticketRef: string;
  subject: string;
  priority: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: args.toEmail,
      subject: `We've received your support request (${args.ticketRef})`,
      // X-Paybacker-Ticket lets the resend-inbound webhook match a
      // user's reply back to this ticket without scraping the subject.
      headers: { 'X-Paybacker-Ticket': args.ticketRef },
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0f172a;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#34d399;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${args.ticketRef}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      <p style="margin:0 0 16px;">Hi ${args.userFirstName},</p>
      <p style="margin:0 0 16px;">Thank you for contacting Paybacker Support. We have received your request and it has been logged in our system.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:600;color:#0f172a;">Ticket Reference: #${args.ticketRef}</p>
        <p style="margin:0 0 4px;color:#475569;"><strong>Subject:</strong> ${args.subject}</p>
        <p style="margin:0;color:#475569;"><strong>Priority:</strong> ${args.priority}</p>
      </div>
      <p style="margin:0 0 12px;">Our support team will review your request and respond shortly. You will receive a follow-up email with our response.</p>
      <p style="margin:0 0 12px;color:#64748b;font-size:13px;">You can reply to this email at any time to add further details to your ticket.</p>
      <p style="margin:0;color:#64748b;">Best regards,<br/>Paybacker Support</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;">paybacker.co.uk</a>
    </div>
  </div>
</body></html>`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
