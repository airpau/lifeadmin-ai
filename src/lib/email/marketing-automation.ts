/**
 * Lifecycle / marketing automation emails — abandoned cart, activation,
 * trial-expired, retention, and the AI-generated weekly update.
 *
 * Migrated to the canonical PaybackerEmailLayout (2026-05-01) so every send
 * here renders through `renderPaybackerEmail` — same chrome, contrast and
 * footer as the rest of the email surface. Earlier hand-rolled inline styles
 * (white wrap + near-white `#E5E7EB` body text) produced unreadable bodies in
 * Gmail iOS dark mode; the canonical layout fixes contrast at the source.
 *
 * Public API is preserved:
 *   - `templates.{abandonedCart, activation, trialExpired, retention}(name)` → HTML string
 *   - `sendEmail(email, subject, html)` → boolean
 *   - `sendIntelligentUpdate(user, userContext)` → boolean
 */

import Anthropic from '@anthropic-ai/sdk';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import {
  renderPaybackerEmail,
  paragraph,
  card,
  callout,
  unorderedList,
  type RenderEmailInput,
} from './PaybackerEmailLayout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

// --- Static templates -------------------------------------------------------

function buildAbandonedCart(name: string): RenderEmailInput {
  return {
    preheader: 'Finish setting up Paybacker — most UK households recover £1,000+',
    heading: `You forgot to finish setting up Paybacker, ${name}`,
    intro:
      "You created an account but haven't unlocked your full savings potential yet. The average UK consumer is missing out on over £1,000 in unused subscriptions, overcharges and potential claims.",
    body: [
      card(
        unorderedList([
          '<strong>Connect your bank:</strong> we automatically identify every subscription and direct debit.',
          '<strong>Run a scan:</strong> find exactly where you can cut costs immediately.',
          '<strong>Upgrade to Essential:</strong> unlock unlimited AI complaint letters to reclaim unfair charges.',
        ]),
        { eyebrow: 'Complete your setup in 60 seconds' },
      ),
      paragraph('Just reply to this email if you have any questions.'),
    ].join('\n'),
    cta: { label: 'Finish setup now', href: `${SITE}/dashboard` },
  };
}

function buildActivation(name: string): RenderEmailInput {
  return {
    preheader: 'Three things you can do in Paybacker right now',
    heading: `Ready to get your money back, ${name}?`,
    intro:
      "Welcome to Paybacker. We noticed you haven't started using the system yet — let's change that.",
    body: [
      callout(
        'Did you know?',
        'You can automatically generate legal complaint letters for delayed flights, unfair parking tickets and unexpected bills using our AI dispute generator.',
      ),
      paragraph('Here are three things you can do right now:'),
      card(
        unorderedList([
          'Write a dispute letter to your energy provider',
          'Cancel a subscription you no longer use',
          'Claim compensation for a delayed flight under UK261',
        ]),
        { eyebrow: 'Get value in five minutes' },
      ),
    ].join('\n'),
    cta: { label: 'Go to your dashboard', href: `${SITE}/dashboard` },
  };
}

function buildTrialExpired(name: string): RenderEmailInput {
  return {
    preheader: 'Your trial ended — your data and letters are still here',
    heading: `Your Paybacker Pro trial has ended, ${name}`,
    intro:
      "Your Pro trial is up. We've moved your account to the Free plan — your data, subscriptions and dispute letters are all still here.",
    body: [
      card(
        unorderedList([
          '3 AI dispute letters per month (was unlimited)',
          '2 connected banks and 1 email account',
          'Top-5 spending categories instead of the full 20+',
        ]),
        { eyebrow: 'What changes on Free' },
      ),
      paragraph(
        'Loved the unlimited letters and full Money Hub? Upgrade any time — your data is preserved.',
      ),
    ].join('\n'),
    cta: { label: 'See pricing', href: `${SITE}/pricing` },
  };
}

function buildRetention(name: string): RenderEmailInput {
  return {
    preheader: "What's new in Paybacker — recover money you didn't know you were owed",
    heading: `We miss you, ${name}. Have you been overcharged lately?`,
    intro:
      "It's been a while since you logged into Paybacker. We've added some powerful new features to help you recover your money.",
    body: [
      card(
        unorderedList([
          '<strong>Enhanced inbox scanner:</strong> automatically detects receipts and finds flight delay compensation opportunities.',
          '<strong>Stronger legal AI:</strong> our newest models cite even more specific UK consumer law for higher success rates.',
          '<strong>Duplicate subs detection:</strong> we now warn you if you are paying for the same service twice.',
        ]),
        { eyebrow: "What's new in Paybacker" },
      ),
    ].join('\n'),
    cta: { label: 'See what you can claim', href: `${SITE}/dashboard` },
  };
}

export const templates = {
  abandonedCart: (name: string) => renderPaybackerEmail(buildAbandonedCart(name)),
  activation: (name: string) => renderPaybackerEmail(buildActivation(name)),
  trialExpired: (name: string) => renderPaybackerEmail(buildTrialExpired(name)),
  retention: (name: string) => renderPaybackerEmail(buildRetention(name)),
};

// --- Sender -----------------------------------------------------------------

export async function sendEmail(email: string, subject: string, html: string) {
  try {
    const { error } = await resend.emails.send({
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

// --- AI-generated weekly update --------------------------------------------

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface WeeklyUpdateContent {
  preheader?: string;
  heading?: string;
  intro?: string;
  sections?: { title: string; bullets: string[] }[];
  closing?: string;
  cta_label?: string;
  cta_href?: string;
  subject?: string;
}

function safeParseJson(raw: string): WeeklyUpdateContent | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as WeeklyUpdateContent;
  } catch {
    return null;
  }
}

function fallbackContent(name: string, userContext: string): WeeklyUpdateContent {
  return {
    preheader: 'Your weekly Paybacker insights',
    heading: `Your Paybacker weekly update, ${name}`,
    intro:
      'A quick summary of what you can do this week to keep more of your money. ' + userContext,
    sections: [
      {
        title: 'Three quick wins',
        bullets: [
          'Connect your bank to surface forgotten subscriptions and direct debits.',
          'Scan your inbox for refund and compensation opportunities (up to £520 for delayed flights).',
          'Write a complaint letter in 30 seconds — our AI cites the exact UK law.',
        ],
      },
    ],
    cta_label: 'Open your dashboard',
    cta_href: `${SITE}/dashboard`,
  };
}

function renderWeeklyUpdate(content: WeeklyUpdateContent, name: string): {
  html: string;
  subject: string;
} {
  const heading = (content.heading || `Your Paybacker weekly update, ${name}`).trim();
  const preheader = (content.preheader || 'Your weekly Paybacker insights').trim();
  const intro = content.intro?.trim();

  const sectionBlocks = (content.sections ?? [])
    .filter((s) => s && s.title && Array.isArray(s.bullets) && s.bullets.length > 0)
    .map((s) => card(unorderedList(s.bullets), { eyebrow: s.title }));

  const closing = content.closing?.trim();

  const body = [
    ...sectionBlocks,
    closing ? paragraph(closing) : '',
    paragraph('— The Paybacker AI Team'),
  ]
    .filter(Boolean)
    .join('\n');

  const ctaLabel = (content.cta_label || 'Open your dashboard').trim();
  const ctaHref = (content.cta_href && content.cta_href.startsWith('http')
    ? content.cta_href
    : `${SITE}/dashboard`
  ).trim();

  const html = renderPaybackerEmail({
    preheader,
    heading,
    intro,
    body,
    cta: { label: ctaLabel, href: ctaHref },
  });

  const subject = content.subject?.trim() || `Your Paybacker weekly update, ${name}`;
  return { html, subject };
}

/**
 * Generates and sends a personalised weekly update email.
 *
 * Claude returns STRUCTURED JSON (intro / sections / cta) — never raw HTML —
 * which we then render through the canonical layout. This guarantees brand
 * consistency and readable contrast across every recipient, while keeping
 * the per-user personalisation that made the previous version useful.
 */
export async function sendIntelligentUpdate(user: any, userContext: string) {
  const name = user.full_name?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const prompt = `You are the AI assistant for Paybacker, a UK platform that helps consumers recover money from unfair charges, manage subscriptions and dispute bills.

Generate a personalised weekly update for the user as STRICT JSON only — no prose, no Markdown, no HTML. The wrapping email layout (logo, header, footer, button styling) is rendered by Paybacker; you provide only the content slots.

User first name: ${name}
User context: ${userContext}
Today: ${today}
Features you may reference where relevant: AI dispute letters citing UK consumer law (energy, broadband, flight delays under UK261), bank-connection subscription detection, duplicate-subscription warnings, weekly money digest, deals engine.

Return ONE JSON object that matches this schema exactly:
{
  "subject": "Email subject line, friendly, under 70 chars, may include the first name",
  "preheader": "One sentence inbox preview under 90 chars",
  "heading": "Short H1 — 'Your Paybacker weekly update, <name>' or similar",
  "intro": "1-2 sentences of plain text. No HTML.",
  "sections": [
    { "title": "Short section title (Title Case)", "bullets": ["plain-text bullet", "..."] }
  ],
  "closing": "One short closing sentence. Optional.",
  "cta_label": "Button label, e.g. 'Open your dashboard'",
  "cta_href": "https://paybacker.co.uk/dashboard"
}

Rules:
- Output JSON only — no \`\`\` fences, no commentary.
- Bullets must be plain text (you may use simple <strong>...</strong> for emphasis).
- 1-3 sections, each with 2-4 bullets.
- Be specific to the user's context where possible. Never invent dates.
- Sign-off ("— The Paybacker AI Team") is added automatically. Do not include it.`;

  let content: WeeklyUpdateContent | null = null;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      system:
        'You produce strict JSON for a UK consumer fintech weekly email. No prose, no Markdown.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text?: string }).text ?? '';
    content = safeParseJson(raw);
  } catch (error) {
    console.error('Failed to generate intelligent email content:', error);
  }

  const finalContent = content ?? fallbackContent(name, userContext);
  const { html, subject } = renderWeeklyUpdate(finalContent, name);

  return await sendEmail(user.email, subject, html);
}
