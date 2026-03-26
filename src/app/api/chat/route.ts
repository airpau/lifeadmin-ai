import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { PRODUCT_CONTEXT } from '@/lib/product-context';
import { getToolDefinitions, executeTool } from './tools/registry';

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

${PRODUCT_CONTEXT}

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
- Essential (£4.99/month): Unlimited complaint and form letters, 1 bank account with daily auto-sync, monthly email and opportunity re-scans, full spending dashboard, cancellation emails with legal context, renewal reminders, contract end date tracking
- Pro (£9.99/month): Everything in Essential plus unlimited bank accounts, unlimited email and opportunity scans, full transaction-level analysis, priority support, automated cancellations (coming soon)

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
- The deals page IS live with 59 deals across 9 categories (Energy, Broadband, Mobile, Insurance, Mortgages, Loans, Credit Cards, Car Finance, Travel). Users can browse deals for free.
- Email inbox scanning is pending Google verification. If anyone asks, say "Email scanning is coming very soon. We are completing security verification with Google. In the meantime, you can connect your bank account to detect subscriptions automatically."

## SUPPORT AND TROUBLESHOOTING
- FIRST try to help the user solve their problem directly in the chat. Give clear steps, troubleshooting advice, and solutions.
- If the user says your solution did not work, or you cannot resolve the issue, THEN offer to create a support ticket.
- Say: "I am sorry I could not fix that for you. Would you like me to create a support ticket? Our team will look into it and get back to you within 30 minutes."
- If the user says yes, or asks you to create a ticket, say: "I have created a support ticket for you. Our team will look into this and you will receive an email confirmation shortly."
- If the user asks to speak to a human directly, create the ticket immediately.
- IMPORTANT: Only include the phrase "I have created a support ticket" when the user has agreed to create one. This triggers the ticket system.

## FEATURE REQUESTS AND FEEDBACK
- If a user suggests a feature or has an idea, say: "Great idea! I have logged this as a feature request and our product team will review it. Thank you for the feedback."
- Include the phrase "feature request" in your response so the system can detect and log it.
- Always make the user feel heard and valued when giving feedback

## SUBSCRIPTION MANAGEMENT TOOLS
You have tools to manage the user's subscriptions. When the user asks to add, edit, remove, or view their subscriptions, use the appropriate tool. Always confirm before making destructive changes (dismiss/delete). After using a tool, describe what you did in natural language.

Available tools:
- list_subscriptions: List all subscriptions, optionally filtered by status or category
- get_subscription: Look up a specific subscription by name or ID
- update_subscription: Update subscription fields (category, amount, billing cycle, dates, notes)
- create_subscription: Add a new subscription
- dismiss_subscription: Remove a subscription (soft delete)

When a user says things like "add Netflix for £15.99/month" or "show my subscriptions" or "change my BT broadband to £35" or "remove my old gym membership", use the relevant tool.

## MONEY HUB TOOLS
You have tools to query the user's financial data from their connected bank account. Use these when they ask about spending, budgets, transactions, or their financial overview.

Available tools:
- get_spending_summary: Overview of spending by category for a given period
- get_spending_by_category: Drill into a specific category to see individual transactions
- search_transactions: Search transactions by keyword (e.g. "how much have I spent at Tesco?")
- get_budgets: Show current budget limits and progress
- set_budget: Set or update a monthly budget for a category
- get_financial_overview: Complete financial snapshot (income, spending, subscriptions, savings)

When a user asks things like "how much did I spend last month?", "what's my biggest expense?", "set my groceries budget to £400", "how much have I spent at Costa?", or "give me a financial overview", use the relevant tool. Present spending data clearly with amounts and percentages. If they have no bank data, suggest connecting their bank account.

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
      // Anonymous user -- that's fine
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

    // Anonymous visitors get a restricted prompt -- no free advice
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
- Say: "Great question! Paybacker can generate a professional response letter for you citing the correct UK legislation. Sign up for free to get started -- you get 3 complaint letters per month on the free plan."
- NEVER draft the letter or give the specific legal advice they need
- ALWAYS redirect to signing up

If they describe a specific situation:
- Acknowledge their issue empathetically
- Explain which Paybacker feature would help them (e.g. "Our AI complaint generator handles exactly this type of issue")
- Tell them to sign up: "Create a free account at paybacker.co.uk to get your personalised response letter in under 30 seconds."

NEVER say: "Under the Consumer Credit Act..." or give specific section references to anonymous users.
ALWAYS say: "Sign up for free and our AI will cite the exact legislation for your situation."

You do NOT have access to subscription management tools for anonymous users.` : '';

    const tierContext = `
## Current User's Plan: ${userTier.toUpperCase()}

IMPORTANT PLAN GATING RULES -- you MUST follow these:
${userTier === 'free' ? `
- This user is on the FREE plan
- They can: 3 complaint/form letters per month, unlimited subscription tracking (manual add), one-time bank scan, one-time email inbox scan, one-time opportunity scan, basic spending overview (top 5 categories), AI chatbot
- They CANNOT: ongoing bank sync, full spending dashboard, cancellation emails, renewal reminders, monthly re-scans, contract tracking
- If they ask about daily sync or ongoing features: "Upgrade to Essential for daily bank sync, monthly re-scans, cancellation emails, and renewal reminders. Just £4.99/month."
- If they've used their one-time scan: "You've used your free scan. Upgrade to Essential for monthly re-scans."` : ''}
${userTier === 'essential' ? `
- This user is on the ESSENTIAL plan (£4.99/month)
- They have: unlimited complaints and forms, 1 bank with daily sync, monthly email and opportunity re-scans, full spending dashboard, cancellation emails, renewal reminders, contract tracking
- They do NOT have: multiple bank accounts, unlimited scans, transaction-level analysis, priority support
- If they ask about multiple banks or unlimited scans: "Upgrade to Pro (£9.99/month) for unlimited bank accounts, unlimited scans, and full transaction analysis."` : ''}
${userTier === 'pro' ? `
- This user is on the PRO plan (£9.99/month). They have ALL current features.
- Unlimited: complaints, forms, bank accounts, email scans, opportunity scans
- Full transaction-level analysis, priority support
- Coming soon: automated cancellations, deal comparison` : ''}`;

    // Build user context for tool-aware prompting
    let subscriptionContext = '';
    if (isLoggedIn && userId) {
      try {
        const admin = getAdmin();
        const { count } = await admin
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('dismissed_at', null);
        subscriptionContext = `\n\nThis user currently has ${count || 0} tracked subscriptions.`;
      } catch {
        // Non-critical
      }
    }

    const systemPrompt = SYSTEM_PROMPT + anonymousRules + tierContext + subscriptionContext;

    // Only provide tools to logged-in users
    const tools: Anthropic.Messages.Tool[] = isLoggedIn
      ? getToolDefinitions().map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
        }))
      : [];

    // Build the messages for Claude
    const claudeMessages: Anthropic.Messages.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Tool use loop: Claude may call multiple tools in sequence
    let currentMessages: Anthropic.Messages.MessageParam[] = [...claudeMessages];
    let finalText = '';
    let toolsUsed: Array<{ tool: string; args: any; result: any }> = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: currentMessages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;

      // Check if response contains tool_use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );

      if (toolUseBlocks.length === 0) {
        // No tools called, we have the final response
        finalText = textBlocks.map((b) => b.text).join('\n');
        break;
      }

      // Execute each tool and build tool_result messages
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        let result: any;
        if (userId) {
          result = await executeTool(toolBlock.name, toolBlock.input, userId);
        } else {
          result = { error: 'You must be logged in to use subscription tools.' };
        }

        toolsUsed.push({
          tool: toolBlock.name,
          args: toolBlock.input,
          result,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      // Add the assistant response and tool results to the conversation
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.content as Anthropic.Messages.ContentBlock[] },
        { role: 'user' as const, content: toolResults as Anthropic.Messages.ToolResultBlockParam[] },
      ];

      // If this was the last round, collect any text
      if (round === MAX_TOOL_ROUNDS - 1) {
        finalText = textBlocks.map((b) => b.text).join('\n') || 'I have completed the requested changes to your subscriptions.';
      }
    }

    // Cost tracking -- Sonnet 4: input $3/1M, output $15/1M
    const inputCost = totalInputTokens * 0.000003;
    const outputCost = totalOutputTokens * 0.000015;
    const estimatedCost = parseFloat((inputCost + outputCost).toFixed(6));

    // Log to agent_runs using service role (bypasses RLS, works for anonymous users)
    const admin = getAdmin();
    admin.from('agent_runs').insert({
      user_id: userId || null,
      agent_type: 'chatbot',
      model_name: 'claude-sonnet-4-20250514',
      status: 'completed',
      input_data: {
        message_count: messages.length,
        tier: userTier,
        distinct_id: distinctId || null,
        tools_used: toolsUsed.length > 0 ? toolsUsed.map((t) => t.tool) : undefined,
      },
      output_data: { reply_length: finalText.length, tool_calls: toolsUsed.length },
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost: estimatedCost,
      completed_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error('Chat cost tracking failed:', error.message);
    });

    // Log tool executions to audit table
    if (toolsUsed.length > 0 && userId) {
      for (const tu of toolsUsed) {
        admin.from('chat_tool_audit').insert({
          user_id: userId,
          tool_name: tu.tool,
          tool_args: tu.args,
          tool_result: tu.result,
        }).then(({ error }) => {
          if (error) console.error('Tool audit log failed:', error.message);
        });
      }
    }

    // Detect escalation -- chatbot directed user to support email
    let escalated = false;
    let ticketNumber: string | null = null;
    const reply = finalText;

    // Create ticket when chatbot says it has created one, or when user reports a problem
    const botCreatedTicket = reply.toLowerCase().includes('created a support ticket') || reply.toLowerCase().includes('created a ticket');
    const botLoggedFeature = reply.toLowerCase().includes('feature request');

    if (botCreatedTicket) {
      try {
        // Use the LAST user message as subject (most relevant to their issue)
        const userMessages = messages.filter((m: any) => m.role === 'user');
        const lastUserMsg = userMessages[userMessages.length - 1];
        const ticketSubject = lastUserMsg
          ? lastUserMsg.content.slice(0, 100)
          : 'Support request from chatbot';

        // Build description from full conversation
        const conversationSummary = userMessages
          .map((m: any) => m.content)
          .join('\n\n');

        // Priority based on user tier
        const priority = userTier === 'pro' ? 'urgent'
          : userTier === 'essential' ? 'high'
          : 'medium';

        // Categorise based on keywords
        const allText = conversationSummary.toLowerCase();
        const category = allText.includes('bank') || allText.includes('truelayer') || allText.includes('sync') ? 'technical'
          : allText.includes('billing') || allText.includes('payment') || allText.includes('charge') || allText.includes('refund') ? 'billing'
          : allText.includes('cancel') || allText.includes('subscription') ? 'billing'
          : allText.includes('letter') || allText.includes('complaint') ? 'feature'
          : 'general';

        const { data: ticket } = await admin.from('support_tickets').insert({
          user_id: userId || null,
          subject: ticketSubject,
          description: conversationSummary,
          category,
          priority,
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

          // Store just the user's issue, not the full chat transcript
          // The full conversation is in ticket metadata for reference
          const userIssue = userMessages.map((m: any) => m.content).join('\n\n');
          await admin.from('ticket_messages').insert({
            ticket_id: ticket.id,
            sender_type: 'user',
            sender_name: 'User (via chatbot)',
            message: userIssue,
          });

          // Email the user to confirm their ticket was created
          if (userId) {
            const { data: profile } = await admin.from('profiles').select('email, full_name').eq('id', userId).single();
            if (profile?.email) {
              const { Resend } = await import('resend');
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: 'Paybacker Support <noreply@paybacker.co.uk>',
                replyTo: 'support@mail.paybacker.co.uk',
                to: profile.email,
                subject: `Your support ticket ${ticketNumber} has been created`,
                html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px;">
                  <div style="border-bottom:2px solid #f59e0b;padding-bottom:16px;margin-bottom:24px;">
                    <h1 style="color:#f59e0b;font-size:22px;margin:0;">Paybacker Support</h1>
                  </div>
                  <p>Hi ${profile.full_name?.split(' ')[0] || 'there'},</p>
                  <p>Your support ticket <strong>${ticketNumber}</strong> has been created. Our team will get back to you shortly.</p>
                  <p style="color:#94a3b8;font-size:13px;">You can reply to this email to add more details to your ticket.</p>
                  <p style="color:#64748b;font-size:12px;margin-top:24px;">Paybacker LTD - paybacker.co.uk</p>
                </div>`,
              }).catch(() => {});
            }
          }

          console.log(`[chat] Escalation ticket created: ${ticketNumber}`);
        }
      } catch (escErr) {
        console.error('[chat] Failed to create escalation ticket:', escErr);
      }
    }

    return NextResponse.json({
      reply,
      escalated,
      ticketNumber,
      toolsUsed: toolsUsed.length > 0,
    });
  } catch (error: any) {
    console.error('Chat error:', error.message);
    return NextResponse.json({
      reply: 'Sorry, I\'m having trouble right now. Please try again or email support@paybacker.co.uk for help.',
    });
  }
}
