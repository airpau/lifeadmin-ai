import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { Resend } from 'resend';
import { config } from '../config';

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(config.RESEND_API_KEY);
  return _resend;
}

export const sendReportEmail = tool(
  'send_report_email',
  'Send a formatted report email to the founder (hello@paybacker.co.uk). Use this to deliver your analysis, recommendations, and alerts.',
  {
    subject: z.string().describe('Email subject line'),
    title: z.string().describe('Report title'),
    content: z.string().describe('Main report body (supports HTML)'),
    recommendations: z.array(z.string()).default([]).describe('List of recommendations'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  },
  async (args) => {
    const resend = getResend();
    const priorityEmoji = { low: '', medium: '', high: '[HIGH] ', urgent: '[URGENT] ' };
    const recsHtml = args.recommendations.length > 0
      ? `<h3>Recommendations</h3><ul>${args.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #0f172a;">${args.title}</h2>
        <div style="white-space: pre-wrap; line-height: 1.6;">${args.content}</div>
        ${recsHtml}
        <hr style="margin-top: 20px;">
        <p style="color: #64748b; font-size: 12px;">Paybacker AI Agent Report</p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: config.FROM_EMAIL,
        to: config.FOUNDER_EMAIL,
        replyTo: config.REPLY_TO,
        subject: `${priorityEmoji[args.priority]}${args.subject}`,
        html,
      });
      return { content: [{ type: 'text' as const, text: `Report email sent to ${config.FOUNDER_EMAIL}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Email failed: ${err.message}` }], isError: true };
    }
  }
);

export const sendUserEmail = tool(
  'send_user_email',
  'Send an email to a specific user. Only available to Support Agent and CGO. Use for ticket responses, activation emails, and engagement messages.',
  {
    to: z.string().email().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    html_body: z.string().describe('Email HTML body'),
    reply_to: z.string().email().optional(),
  },
  async (args) => {
    const resend = getResend();
    try {
      await resend.emails.send({
        from: config.FROM_EMAIL,
        to: args.to,
        replyTo: args.reply_to || config.REPLY_TO,
        subject: args.subject,
        html: args.html_body,
      });
      return { content: [{ type: 'text' as const, text: `Email sent to ${args.to}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Email failed: ${err.message}` }], isError: true };
    }
  }
);

export const sendApprovalEmail = tool(
  'send_approval_email',
  'Send an improvement proposal to the founder with approve/reject links. The founder clicks to approve or reject.',
  {
    title: z.string().describe('Proposal title'),
    description: z.string().describe('What this improvement does and why'),
    implementation: z.string().describe('How to implement this'),
    category: z.enum(['config', 'code', 'data', 'prompt', 'schedule', 'feature', 'bugfix', 'infrastructure']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    estimated_impact: z.string().describe('Expected business impact'),
  },
  async (args) => {
    // Generate approval token
    const token = crypto.randomUUID();
    const baseUrl = config.SITE_URL;
    const approveUrl = `${baseUrl}/api/admin/proposals/approve?token=${token}&action=approve`;
    const rejectUrl = `${baseUrl}/api/admin/proposals/approve?token=${token}&action=reject`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #0f172a;">Improvement Proposal: ${args.title}</h2>
        <p><strong>Category:</strong> ${args.category} | <strong>Priority:</strong> ${args.priority}</p>
        <h3>Why</h3><p>${args.description}</p>
        <h3>How</h3><p>${args.implementation}</p>
        <h3>Impact</h3><p>${args.estimated_impact}</p>
        <div style="margin: 30px 0;">
          <a href="${approveUrl}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 12px;">Approve</a>
          <a href="${rejectUrl}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reject</a>
        </div>
      </div>
    `;

    const resend = getResend();
    try {
      await resend.emails.send({
        from: config.FROM_EMAIL,
        to: config.FOUNDER_EMAIL,
        subject: `[Approve/Reject] ${args.title}`,
        html,
      });
      return { content: [{ type: 'text' as const, text: `Proposal sent for approval (token: ${token}). Title: "${args.title}"` }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Email failed: ${err.message}` }], isError: true };
    }
  }
);

export const emailTools = [sendReportEmail, sendApprovalEmail];
export const userEmailTools = [sendReportEmail, sendApprovalEmail, sendUserEmail];
