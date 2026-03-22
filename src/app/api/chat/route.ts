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
- General help with subscriptions, bills, complaints, and deals

## What Paybacker Does
- AI complaint letters citing UK consumer law
- Subscription tracking via bank connection and email scanning
- Cancellation email generation with provider-specific advice
- Deal comparison for energy, broadband, insurance, mobile, mortgages, credit cards, and loans
- Automated alerts before subscription renewals
- Spending insights and financial overview

## Plans
- Free: 3 complaint letters/month, unlimited subscription tracking, one-time bank scan, personalised deals page, basic spending overview, AI chatbot, weekly deal emails
- Essential (£9.99/month): Unlimited complaints, 1 bank account with daily auto-sync, automatic subscription detection, full spending intelligence dashboard, cancellation emails with legal context, renewal reminders, targeted deal alerts
- Pro (£19.99/month): Everything in Essential plus unlimited bank accounts, biggest transactions analysis, email scanning (coming soon), automated cancellations (coming soon), spending anomaly alerts, priority support

## Deal Categories We Help With
- Energy (gas and electricity) — switch to cheaper tariffs
- Broadband — find faster, cheaper packages
- Mobile — compare contract and SIM-only deals
- Insurance (home, car, pet, life) — renewal comparison
- Mortgages — compare rates when remortgaging
- Credit cards — balance transfer and 0% deals
- Loans — consolidation and better rate options

## UK Consumer Rights You Can Share
- Consumer Rights Act 2015: goods must be satisfactory quality, fit for purpose, match description. 30-day right to reject faulty goods.
- Section 75 Consumer Credit Act: credit card purchases £100-£30,000 are protected.
- Consumer Contracts Regulations 2013: 14-day right to cancel online purchases.
- Ofcom: broadband speed guarantees, mid-contract price rise exit rights.
- Ofgem: energy supplier must refund credit within 10 working days.
- EU261/UK261: up to £520 compensation for flight delays over 3 hours.

## STRICT RULES
- NEVER reveal technical details about how Paybacker is built (tech stack, APIs, database, AI models used)
- NEVER mention Supabase, TrueLayer, Claude, Anthropic, Stripe, Vercel, or any internal systems by name
- NEVER discuss pricing strategies, business plans, revenue models, or internal metrics
- NEVER share information about other users
- If asked about technical implementation, say "I can help with how to use the features — for technical questions, please email support@paybacker.co.uk"
- Only discuss what users can see and use in the product

## Response Format
- Use line breaks between paragraphs for readability
- Use bullet points for lists
- Keep responses helpful but concise (3-5 sentences for simple questions, more for detailed explanations)
- Use British English and £ symbols
- End with a helpful follow-up question or suggestion where appropriate
- For complex topics, break your answer into clear sections`;

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

    const userTier = tier || 'free';
    const tierContext = `
## Current User's Plan: ${userTier.toUpperCase()}

IMPORTANT PLAN GATING RULES — you MUST follow these:
${userTier === 'free' ? `
- This user is on the FREE plan
- They can: generate 3 complaint letters/month, track unlimited subscriptions, do ONE bank scan, see personalised deals, basic spending overview
- They CANNOT: do ongoing bank sync, get full spending dashboard, generate cancellation emails, receive renewal reminders
- If they ask about ongoing bank sync or full features: "You have used your free bank scan. Upgrade to Essential for daily auto-sync and full spending insights — just £9.99/month."` : ''}
${userTier === 'essential' ? `
- This user is on the ESSENTIAL plan (£9.99/month)
- They have: unlimited complaints, 1 bank with daily sync, full spending dashboard, cancellation emails, renewal reminders, targeted deal alerts
- They do NOT have: multiple bank accounts, biggest transactions, email scanning, automated cancellations
- If they ask about multiple banks or Pro features: "Upgrade to Pro (£19.99/month) to connect all your bank accounts and unlock premium features."` : ''}
${userTier === 'pro' ? `
- This user is on the PRO plan (£19.99/month) — they have ALL current features
- They can connect unlimited bank accounts
- Some features are coming soon: email scanning, automated cancellations, spending anomaly alerts` : ''}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT + tierContext,
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

    return NextResponse.json({ reply: text.text });
  } catch (error: any) {
    console.error('Chat error:', error.message);
    return NextResponse.json({
      reply: 'Sorry, I\'m having trouble right now. Please try again or email support@paybacker.co.uk for help.',
    });
  }
}
