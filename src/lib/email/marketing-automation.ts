import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Mint/Navy design system styles (shared from onboarding)
const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;`;
const header = `background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;`;
const body = `padding:32px;`;
const h1 = `color:#ffffff;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const h2 = `color:#ffffff;font-size:18px;font-weight:600;margin:0 0 12px;`;
const p = `color:#94a3b8;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const pWhite = `color:#e2e8f0;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#162544;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #34d399;`;
const tipBox = `background:#162544;border-radius:12px;padding:16px 20px;margin:20px 0;border-left:3px solid #FB923C;`;
const cta = `display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:8px 0;`;
const footer = `padding:20px 32px 28px;border-top:1px solid #1e3a5f;`;
const footerText = `color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;`;

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:#ffffff;">Pay<span style="background:linear-gradient(135deg,#34d399,#FB923C);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">backer</span></span>
  </a>
`;

const Footer = () => `
  <div style="${footer}">
    <p style="${footerText}">
      <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;font-weight:600;">Paybacker LTD</a> · AI-powered money recovery for UK consumers<br/><br/>
      <a href="https://paybacker.co.uk/privacy-policy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

// --- Templates ---

export const templates = {
  abandonedCart: (name: string) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">You forgot to finish setting up Paybacker, ${name}</h1>
    <p style="${pWhite}">You created an account but haven't unlocked your full savings potential yet. The average UK consumer is missing out on over £1000 in unused subscriptions, overcharges, and potential claims.</p>
    
    <div style="${box}">
      <h2 style="${h2}">Complete your setup in 60 seconds:</h2>
      <ul style="color:#94a3b8;font-size:14px;line-height:1.7;">
        <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Connect your bank:</strong> We'll automatically identify all your subscriptions.</li>
        <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Run a scan:</strong> Find exactly where you can cut costs immediately.</li>
        <li><strong style="color:#e2e8f0;">Upgrade to Essential:</strong> Unlock unlimited AI complaint letters to get your money back from unfair charges.</li>
      </ul>
    </div>
    
    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard" style="${cta}">Finish Setup Now</a>
    </div>
    <p style="${p}">Just reply to this email if you have any questions.</p>
  </div>
  ${Footer()}
</div>`,

  activation: (name: string) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Ready to get your money back, ${name}?</h1>
    <p style="${pWhite}">Welcome to Paybacker! We noticed you haven't started using the system yet. Let's change that.</p>
    
    <div style="${tipBox}">
      <p style="color:#FB923C;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Did you know?</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">You can automatically generate legal complaint letters for delayed flights, unfair parking tickets, and unexpected bills using our AI dispute generator.</p>
    </div>
    
    <p style="${p}">Here are three things you can do right now:</p>
    <ul style="color:#94a3b8;font-size:14px;line-height:1.7;">
      <li>Write a dispute letter to your energy provider</li>
      <li>Cancel a subscription you no longer use</li>
      <li>Claim compensation for a delayed flight</li>
    </ul>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard" style="${cta}">Go to your dashboard</a>
    </div>
  </div>
  ${Footer()}
</div>`,

  retention: (name: string) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">We miss you, ${name}. Have you been overcharged lately?</h1>
    <p style="${pWhite}">It's been a while since you logged into Paybacker. We've added some powerful new features to help you recover your money.</p>
    
    <div style="${box}">
      <h2 style="${h2}">What's New in Paybacker:</h2>
      <ul style="color:#94a3b8;font-size:14px;line-height:1.7;">
        <li><strong style="color:#e2e8f0;">Enhanced Inbox Scanner:</strong> Automatically detects receipts and finds flight delay compensation opportunities.</li>
        <li><strong style="color:#e2e8f0;">Stronger Legal AI:</strong> Our new models cite even more specific UK consumer law to ensure high success rates.</li>
        <li><strong style="color:#e2e8f0;">Duplicate Subs Detection:</strong> We now automatically warn you if you're paying for the same service twice.</li>
      </ul>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard" style="${cta}">See What You Can Claim</a>
    </div>
  </div>
  ${Footer()}
</div>`
};

export async function sendEmail(email: string, subject: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject,
      html,
    });
    
    if (error) {
      console.error('Error sending email:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception sending email:', err);
    return false;
  }
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Generates and sends a highly personalized, intelligent email using Claude.
 * It uses the user's profile and subscription context to suggest exact actions.
 */
export async function sendIntelligentUpdate(user: any, userContext: string) {
  const name = user.full_name?.split(' ')[0] || 'there';
  
  const prompt = `
You are the AI Assistant for Paybacker, a UK-based platform that helps consumers recover money from unfair charges, manage subscriptions, and dispute bills.
Write an intelligent, personalized weekly update email for the user. DO NOT USE MARKDOWN, ONLY HTML.

User Name: ${name}
User Context: ${userContext}
Platform Features to highlight: Duplicate subscription detection, AI legal letters (Energy, Broadband, Flight Delays UK261), Bank connection for uncovering hidden costs, Deals engine.

Instructions:
1. Make it sound professional, helpful, and focused on saving money.
2. Structure the email using inline HTML styles matching a dark mode mint/navy theme. 
3. Include a section about their account/context.
4. Provide specific suggestions on how they can use the system right now based on their context.
5. End with a friendly sign off from "The Paybacker AI Team".

Here are the CSS variables/styles you should use in inline style blocks to match our design system:
Background wrap: ` + wrap + `
Header box: ` + header + `
Body box: ` + body + `
H1 style: ` + h1 + `
H2 style: ` + h2 + `
Primary text: ` + pWhite + `
Secondary text: ` + p + `
Highlight Box: ` + box + `
CTA Button: ` + cta + `

Return ONLY the raw HTML of the email inside <div> wrapper. Start directly with the HTML, no generic intro text.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1500,
      system: "You are an expert marketing copywriter and email designer for a UK legal tech startup.",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const htmlContent = (response.content[0] as any).text.trim();
    
    // Ensure we include the logo at top and footer at bottom if the AI missed it
    let finalHtml = htmlContent;
    if (!finalHtml.includes('https://paybacker.co.uk')) {
       finalHtml = `<div style="${wrap}"><div style="${header}">${Logo()}</div><div style="${body}">${htmlContent}</div>${Footer()}</div>`;
    }

    await sendEmail(
      user.email,
      `Your Paybacker Weekly Insights & Savings, ${name}`,
      finalHtml
    );
    return true;
  } catch (error) {
    console.error('Failed to generate intelligent email:', error);
    return false;
  }
}
