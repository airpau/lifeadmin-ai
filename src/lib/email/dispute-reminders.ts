import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;`;
const header = `background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;`;
const body = `padding:32px;`;
const h1 = `color:#ffffff;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const pWhite = `color:#e2e8f0;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#162544;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #34d399;`;
const tipBox = `background:#162544;border-radius:12px;padding:16px 20px;margin:20px 0;border-left:3px solid #ef4444;`;
const cta = `display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:8px 0;`;
const footer = `padding:20px 32px 28px;border-top:1px solid #1e3a5f;`;
const footerText = `color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;`;

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:#ffffff;">Pay<span style="color:#34d399;">backer</span></span>
  </a>
`;

const Footer = () => `
  <div style="${footer}">
    <p style="${footerText}">
      <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;font-weight:600;">Paybacker LTD</a> · ICO Registered · UK Company<br/>
      AI-powered money recovery for UK consumers<br/><br/>
      <a href="https://paybacker.co.uk/privacy-policy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="https://paybacker.co.uk/legal/terms" style="color:#475569;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
      <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

export async function sendDisputeReminderEmail(
  email: string,
  firstName: string,
  dispute: {
    id: string;
    providerName: string;
    daysOld: number;
    amount?: number | null;
  },
  isEscalation: boolean
): Promise<boolean> {
  const name = firstName || 'there';
  const amountStr = dispute.amount ? ` (£\${dispute.amount.toFixed(2)})` : '';

  let subject: string;
  let htmlContent: string;

  if (isEscalation) {
    subject = `Your \${dispute.providerName} dispute is \${dispute.daysOld} days old — time to escalate`;
    htmlContent = `
      <div style="\${wrap}">
        <div style="\${header}">\${Logo()}</div>
        <div style="\${body}">
          <h1 style="\${h1}">It's time to escalate your dispute, \${name}</h1>
          <p style="\${pWhite}">Your dispute with <strong>\${dispute.providerName}</strong>\${amountStr} has been open for \${dispute.daysOld} days.</p>
          
          <div style="\${tipBox}">
            <p style="color:#ef4444;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Your Consumer Rights</p>
            <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Under UK consumer law, if a company has not resolved your complaint within 8 weeks (56 days), you have the right to escalate your case to the relevant ombudsman or regulator free of charge.</p>
          </div>

          <p style="\${pWhite}">The ombudsman has the power to force companies to refund you, pay compensation, and issue official apologies.</p>

          <div style="text-align:center;margin:28px 0;">
            <a href="https://paybacker.co.uk/dashboard/complaints/\${dispute.id}" style="\${cta}">Draft Escapation Letter</a>
          </div>

          <div style="\${box}">
            <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:14px;">How to proceed:</p>
            <ol style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;padding-left:20px;">
              <li>Go to your dispute in the dashboard</li>
              <li>Ask our AI: "Help me draft an ombudsman referral"</li>
              <li>Use the drafted letter to open your case</li>
            </ol>
          </div>
        </div>
        \${Footer()}
      </div>
    `;
  } else {
    subject = `Follow up on your \${dispute.providerName} dispute`;
    htmlContent = `
      <div style="\${wrap}">
        <div style="\${header}">\${Logo()}</div>
        <div style="\${body}">
          <h1 style="\${h1}">Checking in on your dispute, \${name}</h1>
          <p style="\${pWhite}">Your dispute with <strong>\${dispute.providerName}</strong>\${amountStr} was filed \${dispute.daysOld} days ago.</p>
          
          <div style="\${box}">
            <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:14px;">Have you received a response?</p>
            <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Most companies are required by industry guidelines to acknowledge official complaints within 5 working days.</p>
          </div>

          <p style="\${pWhite}">If they haven't replied, now is the perfect time to send a quick follow-up to keep the pressure on.</p>

          <div style="text-align:center;margin:28px 0;">
            <a href="https://paybacker.co.uk/dashboard/complaints/\${dispute.id}" style="\${cta}">Update Dispute Status</a>
          </div>

          <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">Tip: You can ask the AI chat on the dispute page to <em>"Help me follow up with \${dispute.providerName}"</em> and it will write the email for you.</p>
        </div>
        \${Footer()}
      </div>
    `;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: subject,
      html: htmlContent,
    });
    if (error) {
      console.error(`Dispute reminder email failed for \${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Dispute reminder email error for \${email}:`, err);
    return false;
  }
}
