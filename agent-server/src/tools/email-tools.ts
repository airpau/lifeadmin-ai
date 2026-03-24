import { Resend } from 'resend';
import { config } from '../config';

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(config.RESEND_API_KEY);
  return _resend;
}

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const sendReportEmail: ToolDef = {
  name: 'send_report_email',
  description: 'Send a formatted report email to the founder (hello@paybacker.co.uk). Use this to deliver your analysis, recommendations, and alerts.',
  schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Email subject line' },
      title: { type: 'string', description: 'Report title' },
      content: { type: 'string', description: 'Main report body (supports HTML)' },
      recommendations: { type: 'array', items: { type: 'string' }, default: [], description: 'List of recommendations' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    },
    required: ['subject', 'title', 'content'],
  },
  handler: async (args) => {
    const resend = getResend();
    const priorityEmoji: Record<string, string> = { low: '', medium: '', high: '[HIGH] ', urgent: '[URGENT] ' };
    const recs = args.recommendations || [];
    const recsHtml = recs.length > 0
      ? `<h3>Recommendations</h3><ul>${recs.map((r: string) => `<li>${r}</li>`).join('')}</ul>`
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
        subject: `${priorityEmoji[args.priority || 'medium']}${args.subject}`,
        html,
      });
      return `Report email sent to ${config.FOUNDER_EMAIL}`;
    } catch (err: any) {
      return `Email failed: ${err.message}`;
    }
  },
};

const sendUserEmail: ToolDef = {
  name: 'send_user_email',
  description: 'Send an email to a specific user. Only available to Support Agent and CGO. Use for ticket responses, activation emails, and engagement messages.',
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', format: 'email', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      html_body: { type: 'string', description: 'Email HTML body' },
      reply_to: { type: 'string', format: 'email', description: 'Reply-to address' },
    },
    required: ['to', 'subject', 'html_body'],
  },
  handler: async (args) => {
    const resend = getResend();
    try {
      await resend.emails.send({
        from: config.FROM_EMAIL,
        to: args.to,
        replyTo: args.reply_to || config.REPLY_TO,
        subject: args.subject,
        html: args.html_body,
      });
      return `Email sent to ${args.to}`;
    } catch (err: any) {
      return `Email failed: ${err.message}`;
    }
  },
};

const sendApprovalEmail: ToolDef = {
  name: 'send_approval_email',
  description: 'Send an improvement proposal to the founder with approve/reject links. The founder clicks to approve or reject.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Proposal title' },
      description: { type: 'string', description: 'What this improvement does and why' },
      implementation: { type: 'string', description: 'How to implement this' },
      category: { type: 'string', enum: ['config', 'code', 'data', 'prompt', 'schedule', 'feature', 'bugfix', 'infrastructure'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      estimated_impact: { type: 'string', description: 'Expected business impact' },
    },
    required: ['title', 'description', 'implementation', 'category', 'estimated_impact'],
  },
  handler: async (args) => {
    // Generate approval token
    const token = crypto.randomUUID();
    const baseUrl = config.SITE_URL;
    const approveUrl = `${baseUrl}/api/admin/proposals/approve?token=${token}&action=approve`;
    const rejectUrl = `${baseUrl}/api/admin/proposals/approve?token=${token}&action=reject`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #0f172a;">Improvement Proposal: ${args.title}</h2>
        <p><strong>Category:</strong> ${args.category} | <strong>Priority:</strong> ${args.priority || 'medium'}</p>
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
      return `Proposal sent for approval (token: ${token}). Title: "${args.title}"`;
    } catch (err: any) {
      return `Email failed: ${err.message}`;
    }
  },
};

export const emailTools: ToolDef[] = [sendReportEmail, sendApprovalEmail];
export const userEmailTools: ToolDef[] = [sendReportEmail, sendApprovalEmail, sendUserEmail];
