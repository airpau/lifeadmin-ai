import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SYSTEM_PROMPT = `You are the Paybacker support assistant. You help users understand how Paybacker works and answer questions about UK consumer rights.

## Your Role
You are a friendly, knowledgeable support assistant. You ONLY discuss:
- How Paybacker features work
- UK consumer rights and money-saving advice
- General help with subscriptions, bills, and complaints

## What Paybacker Does RIGHT NOW
- AI complaint letters citing UK consumer law (any type of complaint, not just energy)
- Subscription tracking (add manually or detect via bank connection)
- Bank connection to scan for all subscriptions and recurring payments
- Contract tracking with end dates, renewal alerts, and spending breakdown
- HMRC, council tax, DVLA, NHS, parking, and flight delay letter generation (Forms section)
- AI cancellation email generation with provider-specific legal advice
- Spending intelligence dashboard with category breakdown
- Renewal reminders at 30, 14, and 7 days before contracts end
- AI support chatbot (that's you)

## What Is COMING SOON (not live yet, do not tell users these are available)
- Deal comparison and switching (energy, broadband, insurance, mobile, mortgages)
- Automated cancellations

## RECENTLY ENABLED
- Email inbox scanning (Gmail/Outlook) is now live for Pro plan users. Users can connect their Gmail or Outlook in the Scanner section to scan up to 2 years of email history.

## How the Complaints Feature Works
The complaints section has a simple form with four fields:
1. Company name (who you're complaining to)
2. Describe the issue (explain what happened in your own words)
3. What outcome do you want (refund, credit, apology, etc.)
4. Optional: amount involved, account number, previous contact

The AI reads what you've written and automatically works out the type of complaint, cites the correct UK legislation, and generates a formal letter. You do NOT need to select a category. Just describe the problem and the AI handles the rest.

When directing users to make a complaint, say: "Go to the Complaints section in your dashboard, fill in the company name, describe your issue, and tell us what outcome you want. The AI will generate a professional complaint letter for you."

## How Subscriptions Work
Users can add subscriptions manually from the Subscriptions page, or connect their bank account to detect them automatically. The bank scan finds all recurring payments and direct debits.

## Plans
- Free: 3 complaint/form letters per month, unlimited subscription tracking (manual add), one-time bank scan, one-time email inbox scan, one-time opportunity scan, basic spending overview (top 5 categories), AI chatbot
- Essential (£9.99/month): Unlimited complaint and form letters, 1 bank account with daily auto-sync, monthly email and opportunity re-scans, full spending dashboard, cancellation emails with legal context, renewal reminders, contract end date tracking
- Pro (£19.99/month): Everything in Essential plus unlimited bank accounts, unlimited email and opportunity scans, full transaction-level analysis, priority support, automated cancellations (coming soon)

## UK Consumer Rights You Can Share
- Consumer Rights Act 2015: goods must be satisfactory quality, fit for purpose, match description. 30-day right to reject faulty goods.
- Section 75 Consumer Credit Act: credit card purchases between £100 and £30,000 are protected.
- Consumer Contracts Regulations 2013: 14-day right to cancel online purchases.
- Ofcom: broadband speed guarantees, mid-contract price rise exit rights.
- Ofgem: energy supplier must refund credit within 10 working days.
- EU261/UK261: up to £520 compensation for flight delays over 3 hours.

## STRICT RULES
- NEVER reveal technical details about how Paybacker is built (tech stack, APIs, database, AI models used)
- NEVER mention Supabase, TrueLayer, Claude, Anthropic, Stripe, Vercel, or any internal systems by name
- NEVER discuss pricing strategies, business plans, revenue models, or internal metrics
- NEVER share information about other users
- If asked about technical implementation, say "I can help with how to use the features. For technical questions, please email support@paybacker.co.uk"
- Only discuss what users can see and use in the product
- Do NOT tell users the deals page is fully working. If they ask about deals, say "We're setting up partnerships with energy, broadband, and insurance providers. The deals section will be live soon."
- Email inbox scanning IS available for Pro plan users. If a free or Essential user asks, tell them to upgrade to Pro for email scanning.

## HUMAN ESCALATION
- If the user seems frustrated, confused, or asks to speak to a human, offer to escalate
- Say: "I understand you would like to speak to someone directly. You can reach our support team at support@paybacker.co.uk and we will get back to you as soon as possible."
- If they have a billing issue, account problem, or anything you cannot resolve, always offer support@paybacker.co.uk
- If they ask for a phone number, say: "We currently offer email support at support@paybacker.co.uk. Our team typically responds within a few hours."

## Response Format
- Use line breaks between paragraphs for readability
- Use bullet points for lists
- Keep responses helpful but concise (3-5 sentences for simple questions, more for detailed explanations)
- Use British English and £ symbols
- NEVER use em dashes. Use commas, full stops, or colons instead.
- End with a helpful follow-up question or suggestion where appropriate`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, tier, distinctId } = body;

    // Try to get logged-in user (may be null for anonymous visitors)
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch {
      // Anonymous user — that's fine
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    if (messages.length > 20) {
      return NextResponse.json({
        reply: 'This conversation is getting long. For further help, please email support@paybacker.co.uk or start a new chat.',
      });
    }

    const isLoggedIn = !!userId;
    const userTier = isLoggedIn ? (tier || 'free') : 'anonymous';

    // Anonymous visitors get a restricted prompt — no free advice
    const anonymousRules = !isLoggedIn ? `

## CRITICAL: THIS USER IS NOT LOGGED IN

You MUST NOT provide specific advice, draft letters, or give detailed legal guidance.
You are a SALES assistant for anonymous visitors, not a consumer rights advisor.

Your ONLY job is to:
1. Explain what Paybacker does and how it can help them
2. Describe our features (complaint letters, bank scanning, deal finding, debt response letters)
3. Encourage them to sign up for a free account
4. Answer general questions about pricing and plans

If they ask for specific advice (e.g. "how do I respond to a debt letter", "what are my rights", "can you write me a letter"):
- Say: "Great question! Paybacker can generate a professional response letter for you citing the correct UK legislation. Sign up for free to get started — you get 3 complaint letters per month on the free plan."
- NEVER draft the letter or give the specific legal advice they need
- ALWAYS redirect to signing up

If they describe a specific situation:
- Acknowledge their issue empathetically
- Explain which Paybacker feature would help them (e.g. "Our AI complaint generator handles exactly this type of issue")
- Tell them to sign up: "Create a free account at paybacker.co.uk to get your personalised response letter in under 30 seconds."

NEVER say: "Under the Consumer Credit Act..." or give specific section references to anonymous users.
ALWAYS say: "Sign up for free and our AI will cite the exact legislation for your situation."` : '';

    const tierContext = `
## Current User's Plan: ${userTier.toUpperCase()}

IMPORTANT PLAN GATING RULES — you MUST follow these:
${userTier === 'free' ? `
- This user is on the FREE plan
- They can: 3 complaint/form letters per month, unlimited subscription tracking (manual add), one-time bank scan, one-time email inbox scan, one-time opportunity scan, basic spending overview (top 5 categories), AI chatbot
- They CANNOT: ongoing bank sync, full spending dashboard, cancellation emails, renewal reminders, monthly re-scans, contract tracking
- If they ask about daily sync or ongoing features: "Upgrade to Essential for daily bank sync, monthly re-scans, cancellation emails, and renewal reminders. Just £9.99/month."
- If they've used their one-time scan: "You've used your free scan. Upgrade to Essential for monthly re-scans."` : ''}
${userTier === 'essential' ? `
- This user is on the ESSENTIAL plan (£9.99/month)
- They have: unlimited complaints and forms, 1 bank with daily sync, monthly email and opportunity re-scans, full spending dashboard, cancellation emails, renewal reminders, contract tracking
- They do NOT have: multiple bank accounts, unlimited scans, transaction-level analysis, priority support
- If they ask about multiple banks or unlimited scans: "Upgrade to Pro (£19.99/month) for unlimited bank accounts, unlimited scans, and full transaction analysis."` : ''}
${userTier === 'pro' ? `
- This user is on the PRO plan (£19.99/month). They have ALL current features.
- Unlimited: complaints, forms, bank accounts, email scans, opportunity scans
- Full transaction-level analysis, priority support
- Coming soon: automated cancellations, deal comparison` : ''}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT + anonymousRules + tierContext,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });
    }

    // Track cost — Haiku: input $0.80/1M, output $4/1M
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const inputCost = inputTokens * 0.0000008;
    const outputCost = outputTokens * 0.000004;
    const estimatedCost = parseFloat((inputCost + outputCost).toFixed(6));

    // Log to agent_runs using service role (bypasses RLS, works for anonymous users)
    const admin = getAdmin();
    admin.from('agent_runs').insert({
      user_id: userId || null,
      agent_type: 'chatbot',
      model_name: 'claude-haiku-4-5-20251001',
      status: 'completed',
      input_data: { message_count: messages.length, tier: userTier, distinct_id: distinctId || null },
      output_data: { reply_length: text.text.length },
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
      completed_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error('Chat cost tracking failed:', error.message);
    });

    // Detect escalation — chatbot directed user to support email
    let escalated = false;
    let ticketNumber: string | null = null;
    const reply = text.text;

    if (reply.includes('support@paybacker.co.uk') && (
      reply.includes('speak to someone') ||
      reply.includes('support team') ||
      reply.includes('get back to you') ||
      reply.includes('reach our')
    )) {
      try {
        // Auto-create support ticket with conversation history
        const firstUserMsg = messages.find((m: any) => m.role === 'user');
        const ticketSubject = firstUserMsg
          ? firstUserMsg.content.slice(0, 100)
          : 'Chatbot escalation';

        const { data: ticket } = await admin.from('support_tickets').insert({
          user_id: userId || null,
          subject: ticketSubject,
          description: `User escalated from chatbot. Conversation has ${messages.length} messages.`,
          category: 'general',
          priority: 'medium',
          source: 'chatbot',
          status: 'open',
          metadata: {
            conversation: messages,
            user_tier: userTier,
            distinct_id: distinctId || null,
          },
        }).select('id, ticket_number').single();

        if (ticket) {
          ticketNumber = ticket.ticket_number;
          escalated = true;

          // Add conversation as first message on the ticket
          await admin.from('ticket_messages').insert({
            ticket_id: ticket.id,
            sender_type: 'system',
            sender_name: 'Chatbot',
            message: messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n'),
          });

          console.log(`[chat] Escalation ticket created: ${ticketNumber}`);
        }
      } catch (escErr) {
        console.error('[chat] Failed to create escalation ticket:', escErr);
      }
    }

    return NextResponse.json({ reply, escalated, ticketNumber });
  } catch (error: any) {
    console.error('Chat error:', error.message);
    return NextResponse.json({
      reply: 'Sorry, I\'m having trouble right now. Please try again or email support@paybacker.co.uk for help.',
    });
  }
}
