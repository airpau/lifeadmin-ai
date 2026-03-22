import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful support assistant for Paybacker, a UK AI-powered service that helps consumers save money, dispute bills, cancel subscriptions, and find better deals.

## What Paybacker Does
- AI complaint letters citing UK consumer law (Consumer Rights Act 2015, Ofcom, FCA, Ofgem rules)
- Subscription tracking via bank connection (TrueLayer Open Banking) and email scanning
- Cancellation email generation with provider-specific advice
- Deal comparison for energy, broadband, insurance, mobile
- Automated alerts before subscription renewals

## Plans
- Free: 3 complaint letters/month, basic subscription tracker (up to 10), deal comparison
- Essential (£9.99/month): Unlimited complaints, email inbox scanner, unlimited subscriptions, auto-cancellation emails, AI deal finder alerts, loyalty rewards
- Pro (£19.99/month): Everything in Essential plus Open Banking connection, spending insights dashboard, dedicated account manager

## UK Consumer Rights You Should Know
- Consumer Rights Act 2015: goods must be satisfactory quality, fit for purpose, match description. 30-day right to reject faulty goods.
- Section 75 Consumer Credit Act: credit card purchases £100-£30,000 are protected — card provider is jointly liable.
- Consumer Contracts Regulations 2013: 14-day right to cancel online purchases.
- Ofcom: broadband speed guarantees, mid-contract price rise exit rights.
- Ofgem: energy supplier must refund credit within 10 working days.
- EU261/UK261: up to £520 compensation for flight delays over 3 hours.

## Important
- Always be helpful, friendly, and concise
- If you don't know something specific about the user's account, suggest they check their dashboard or contact support@paybacker.co.uk
- Never give specific legal advice — say "based on UK consumer law" and suggest they seek professional advice for complex cases
- Keep responses short (2-4 sentences unless they ask for detail)
- Use British English and £ symbols
- The website is paybacker.co.uk`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    // Rate limit: max 20 messages per conversation
    if (messages.length > 20) {
      return NextResponse.json({
        reply: 'This conversation is getting long. For further help, please email support@paybacker.co.uk or start a new chat.',
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });
    }

    return NextResponse.json({ reply: text.text });
  } catch (error: any) {
    console.error('Chat error:', error.message);
    return NextResponse.json({
      reply: 'Sorry, I\'m having trouble right now. Please try again or email support@paybacker.co.uk for help.',
    });
  }
}
