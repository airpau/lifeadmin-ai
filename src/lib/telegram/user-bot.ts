/**
 * Paybacker User Bot — Workflow Engine
 *
 * Closed-loop financial agent for Pro users:
 * 1. DETECT  — proactive cron alerts pushed to Telegram
 * 2. EXPLAIN — clear, quantified context
 * 3. RECOMMEND — specific action suggestion
 * 4. EXECUTE — draft letter / action with inline keyboard
 * 5. CONFIRM — save outcome, log verified saving
 * 6. REMIND  — follow-up after 14 days if no response
 */

import { Bot, InlineKeyboard, type Context } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { telegramTools } from './tools';
import { executeToolCall, type PendingAction } from './tool-handlers';

// ============================================================
// Supabase admin client
// ============================================================
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================
// Custom context type
// ============================================================
interface UserBotContext extends Context {
  userId?: string;
}

// ============================================================
// Helpers
// ============================================================
function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    // Try to split on newline
    let end = i + limit;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + limit / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function sendChunked(
  ctx: UserBotContext,
  text: string,
  options?: Parameters<Context['reply']>[1],
) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    if (i === chunks.length - 1 && options) {
      await ctx.reply(chunks[i], options);
    } else {
      await ctx.reply(chunks[i]);
    }
  }
}

// ============================================================
// Constants
// ============================================================
const RATE_LIMIT_PER_HOUR = 200;
const SESSION_EXPIRY_DAYS = 90;

const SYSTEM_PROMPT = `You are Paybacker's financial assistant for UK consumers. You are fully connected to the user's Paybacker account and can both READ and WRITE their financial data.

IMPORTANT: You have FULL access to the same data shown in the Money Hub dashboard, the Subscriptions page, the Disputes page, and the Contracts page. When users ask about "Money Hub", "my dashboard", "my data", or "my account" — you can access it all. Never say you can't access Money Hub or that it's a separate system.

WHAT YOU CAN DO (always use the relevant tool — never say you can't):
READ:
- Show spending breakdowns by category for any month (get_spending_summary)
- List individual transactions by merchant (list_transactions)
- Show all subscriptions/regular payments with costs (get_subscriptions)
- Show active contracts with end dates (get_contracts)
- Show budget vs actual spending (get_budget_status)
- Show upcoming renewals within 30 days (get_upcoming_renewals)
- Show price increase alerts (get_price_alerts)
- Show disputes and their status (get_disputes)
- Look up UK consumer law rights (search_legal_rights)

WRITE:
- Recategorise all transactions from a merchant (recategorise_transactions)
- Recategorise a specific transaction by ID (recategorise_transaction — use list_transactions to find IDs first)
- Set or update monthly budget limits (set_budget)
- Remove budget limits (delete_budget)
- Recategorise subscriptions (recategorise_subscription)
- Add new subscriptions to track (add_subscription)
- Mark subscriptions as cancelled (cancel_subscription)
- Create a new savings goal (create_savings_goal)
- Update progress on a savings goal (update_savings_goal)
- Create a financial task or reminder (create_task)
- Update the status of a dispute, mark as won/lost, add notes (update_dispute_status)
- Add a contract manually — mortgage, broadband, loan, energy, etc. (add_contract)
- Draft complaint letters citing UK consumer law (draft_dispute_letter)

Rules:
- ALWAYS call the relevant tool before answering — never make up numbers or say "I can't"
- If the user asks you to do something, DO IT with a tool — don't suggest they do it in the dashboard
- Currency: £X.XX format. Dates: DD/MM/YYYY (UK format)
- Keep responses concise — bullet points, bold headers, no essays
- Be specific about financial impact: "that's £276/year" not "your bill went up"
- You have conversation history — reference previous messages naturally
- When recategorising, suggest related actions (e.g. "shall I set a budget for this category too?")

CRITICAL: When you commit to taking an action for the user (creating a goal, setting a budget, adding a subscription, etc.), you MUST call the appropriate tool. Never describe an action as done without actually executing the tool call. If a user asks you to do multiple things, call multiple tools. Saying "I've set your budget" without calling set_budget is a lie — always call the tool first, then confirm.

When a user asks to create a savings goal with a monthly saving amount, ALSO call set_budget to create a budget for that category to track their spending.`;

// ============================================================
// Rate limiter — 200 messages per user per hour
// ============================================================
async function checkRateLimit(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('telegram_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'inbound')
    .gte('created_at', oneHourAgo);

  return (count ?? 0) < RATE_LIMIT_PER_HOUR;
}

// ============================================================
// Session expiry — deactivate after 90 days inactivity
// ============================================================
function isSessionExpired(lastMessageAt: string | null): boolean {
  if (!lastMessageAt) return false;
  const daysSince = (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > SESSION_EXPIRY_DAYS;
}

// ============================================================
// Conversation history — load last 10 messages for context
// ============================================================
async function getConversationHistory(
  supabase: ReturnType<typeof getAdmin>,
  chatId: number,
): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from('telegram_message_log')
    .select('direction, message_text')
    .eq('telegram_chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return [];

  // Reverse to chronological order and map to Claude message format
  const history: Anthropic.MessageParam[] = [];
  for (const msg of data.reverse()) {
    if (!msg.message_text) continue;
    const role = msg.direction === 'inbound' ? 'user' : 'assistant';
    // Merge consecutive same-role messages
    if (history.length > 0 && history[history.length - 1].role === role) {
      history[history.length - 1] = {
        role,
        content: history[history.length - 1].content + '\n' + msg.message_text,
      };
    } else {
      history.push({ role, content: msg.message_text });
    }
  }

  // Ensure history starts with user message (Claude requirement)
  while (history.length > 0 && history[0].role === 'assistant') {
    history.shift();
  }

  return history;
}

// ============================================================
// Claude tool-use loop (with prompt caching + conversation history)
// ============================================================
async function callClaudeWithTools(
  userId: string,
  userMessage: string,
  chatId: number,
): Promise<{ text: string; pendingAction?: PendingAction }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = getAdmin();

  // Load conversation history for context
  const history = await getConversationHistory(supabase, chatId);

  // Build messages: history + current message
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  let pendingAction: PendingAction | undefined;
  let pendingActionText = '';
  const toolsUsed: string[] = [];

  // Enable prompt caching on system prompt and tools
  const cachedTools = telegramTools.map((tool, idx) => {
    if (idx === telegramTools.length - 1) {
      return { ...tool, cache_control: { type: 'ephemeral' as const } };
    }
    return tool;
  });

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: cachedTools,
    messages,
  });

  // Tool use loop
  while (response.stop_reason === 'tool_use') {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hasPendingAction = false;

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolsUsed.push(block.name);
        const result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
          userId,
        );

        if (result.pendingAction) {
          pendingAction = result.pendingAction;
          pendingActionText = result.text;
          hasPendingAction = true;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.text,
        });
      }
    }

    // Stop the loop immediately when a pending action exists (e.g. draft letter awaiting
    // user approval). Feeding the result back to Claude would cause it to re-invoke the
    // generation tool and produce duplicate previews.
    if (hasPendingAction) {
      break;
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: cachedTools,
      messages,
    });
  }

  // When a pending action was produced, use the tool result text directly — this avoids
  // feeding the letter back to Claude and getting a duplicate/re-generated response.
  const finalText = pendingAction
    ? pendingActionText
    : response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

  return { text: finalText, pendingAction };
}

// ============================================================
// Bot factory — called by webhook route
// ============================================================
export function createUserBot(): Bot<UserBotContext> {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_USER_BOT_TOKEN is not set');

  const bot = new Bot<UserBotContext>(token);

  // -------------------------------------------------------
  // /start
  // -------------------------------------------------------
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `Welcome to *Paybacker* 👋\n\n` +
        `I'm your personal financial assistant. I can:\n\n` +
        `• Show your spending by category\n` +
        `• Track subscriptions and upcoming renewals\n` +
        `• Alert you to price increases on your bills\n` +
        `• Check your budget status\n` +
        `• Draft complaint letters citing UK consumer law\n` +
        `• Track disputes and remind you to follow up\n\n` +
        `*To get started, link your Paybacker account:*\n\n` +
        `1. Go to paybacker.co.uk/dashboard/settings/telegram\n` +
        `2. Click "Generate Link Code"\n` +
        `3. Send: \`/link YOUR_CODE\`\n\n` +
        `This bot is available to Pro subscribers only.`,
      { parse_mode: 'Markdown' },
    );
  });

  // -------------------------------------------------------
  // /link <code>
  // -------------------------------------------------------
  bot.command('link', async (ctx) => {
    const code = ctx.match?.trim().toUpperCase();
    if (!code) {
      return ctx.reply('Please include your link code: /link ABC123');
    }

    const supabase = getAdmin();
    const chatId = ctx.chat?.id;
    const username = ctx.from?.username;

    const { data: linkCode } = await supabase
      .from('telegram_link_codes')
      .select('user_id, expires_at, used')
      .eq('code', code)
      .single();

    if (!linkCode) {
      return ctx.reply(
        'Code not found. Generate a new one at paybacker.co.uk/dashboard/settings/telegram',
      );
    }
    if (linkCode.used) {
      return ctx.reply(
        'This code has already been used. Generate a new one at paybacker.co.uk/dashboard/settings/telegram',
      );
    }
    if (new Date(linkCode.expires_at) < new Date()) {
      return ctx.reply(
        'This code has expired (15 min limit). Generate a new one at paybacker.co.uk/dashboard/settings/telegram',
      );
    }

    // Verify Pro subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
      .eq('id', linkCode.user_id)
      .single();

    const tier = profile?.subscription_tier;
    const status = profile?.subscription_status;
    const hasStripe = !!profile?.stripe_subscription_id;
    const isPro =
      tier === 'pro' &&
      (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing');

    if (!isPro) {
      return ctx.reply(
        `This bot is for Pro subscribers only.\n\nUpgrade at paybacker.co.uk/dashboard/upgrade`,
      );
    }

    // Create or update session
    await supabase.from('telegram_sessions').upsert(
      {
        user_id: linkCode.user_id,
        telegram_chat_id: chatId,
        telegram_username: username ?? null,
        is_active: true,
        linked_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_chat_id' },
    );

    // Mark code used
    await supabase.from('telegram_link_codes').update({ used: true }).eq('code', code);

    await ctx.reply(
      `✅ *Account linked!*\n\n` +
        `You're all set. Try asking me:\n` +
        `• "What are my active subscriptions?"\n` +
        `• "How much did I spend on food this month?"\n` +
        `• "Any price increases on my bills?"\n` +
        `• "Write a complaint to BT about my broadband price rise"`,
      { parse_mode: 'Markdown' },
    );
  });

  // -------------------------------------------------------
  // /unlink
  // -------------------------------------------------------
  bot.command('unlink', async (ctx) => {
    const supabase = getAdmin();
    const chatId = ctx.chat?.id;

    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();

    if (!session) {
      return ctx.reply('No account is linked to this chat.');
    }

    await supabase
      .from('telegram_sessions')
      .update({ is_active: false })
      .eq('telegram_chat_id', chatId);

    await ctx.reply(
      'Account unlinked. You can re-link at any time from paybacker.co.uk/dashboard/settings/telegram',
    );
  });

  // -------------------------------------------------------
  // /help
  // -------------------------------------------------------
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*Paybacker Bot — Help*\n\n` +
        `*Commands:*\n` +
        `/start — Welcome and setup\n` +
        `/link CODE — Link your account\n` +
        `/unlink — Disconnect account\n` +
        `/help — This message\n\n` +
        `*What you can ask:*\n` +
        `• "How much did I spend on groceries in March?"\n` +
        `• "Show my active subscriptions"\n` +
        `• "Any contracts expiring soon?"\n` +
        `• "What's my budget status?"\n` +
        `• "Any bill increases I should know about?"\n` +
        `• "Write a complaint to Virgin Media about my price rise"\n` +
        `• "What are my rights if a company raises prices mid-contract?"\n` +
        `• "Show my open disputes"\n\n` +
        `*How it works:*\n` +
        `I have real-time access to your Paybacker data. When I spot a problem, I'll message you proactively with a recommended action.`,
      { parse_mode: 'Markdown' },
    );
  });

  // -------------------------------------------------------
  // Callback: Approve draft letter
  // -------------------------------------------------------
  bot.callbackQuery(/^approve_(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    const supabase = getAdmin();
    const chatId = ctx.chat?.id;

    await ctx.answerCallbackQuery({ text: 'Saving your letter...' });

    const { data: pending } = await supabase
      .from('telegram_pending_actions')
      .select('user_id, payload, expires_at')
      .eq('id', actionId)
      .eq('telegram_chat_id', chatId)
      .single();

    if (!pending) {
      return ctx.editMessageText('This action has expired. Please ask me to draft the letter again.');
    }
    if (new Date(pending.expires_at) < new Date()) {
      return ctx.editMessageText('This action expired. Please ask me to draft the letter again.');
    }

    const payload = pending.payload as {
      provider: string;
      issue_description: string;
      desired_outcome: string;
      issue_type: string;
      letter_text: string;
    };

    // Save dispute
    const { data: dispute } = await supabase
      .from('disputes')
      .insert({
        user_id: pending.user_id,
        provider_name: payload.provider,
        issue_type: payload.issue_type ?? 'complaint',
        issue_summary: payload.issue_description,
        desired_outcome: payload.desired_outcome,
        status: 'open',
      })
      .select('id')
      .single();

    // Save correspondence
    if (dispute?.id) {
      await supabase.from('correspondence').insert({
        dispute_id: dispute.id,
        user_id: pending.user_id,
        entry_type: 'ai_letter',
        title: `Complaint letter to ${payload.provider}`,
        content: payload.letter_text,
        entry_date: new Date().toISOString(),
      });

      // Schedule 14-day follow-up via detected_issues
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 14);

      await supabase.from('detected_issues').insert({
        user_id: pending.user_id,
        issue_type: 'dispute_no_response',
        title: `${payload.provider} complaint — follow-up due`,
        detail: `You sent a complaint letter to ${payload.provider} on ${new Date().toLocaleDateString('en-GB')}. If they haven't responded within 14 days, you can escalate.`,
        recommendation: `Escalate to the relevant ombudsman if ${payload.provider} hasn't responded.`,
        source_type: 'dispute',
        source_id: dispute.id,
        telegram_chat_id: chatId ?? null,
        status: 'actioned',
        follow_up_due_at: followUpDate.toISOString(),
        actioned_at: new Date().toISOString(),
      });
    }

    // Delete pending action
    await supabase.from('telegram_pending_actions').delete().eq('id', actionId);

    await ctx.editMessageText(
      `✅ *Letter saved!*\n\n` +
        `Your complaint to ${payload.provider} has been saved to your Disputes dashboard.\n\n` +
        `I'll remind you in 14 days if you haven't had a response — you can then escalate to the relevant regulator or ombudsman.\n\n` +
        `View it at: paybacker.co.uk/dashboard/disputes`,
      { parse_mode: 'Markdown' },
    );
  });

  // -------------------------------------------------------
  // Callback: Cancel draft letter
  // -------------------------------------------------------
  bot.callbackQuery(/^cancel_(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    const supabase = getAdmin();

    await supabase.from('telegram_pending_actions').delete().eq('id', actionId);
    await ctx.editMessageText('Letter cancelled. Send me a message if you want to try again.');
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------
  // Callback: Confirm saving (verified_savings)
  // -------------------------------------------------------
  bot.callbackQuery(/^confirm_saving_(.+)$/, async (ctx) => {
    const issueId = ctx.match[1];
    const supabase = getAdmin();
    const chatId = ctx.chat?.id;

    await ctx.answerCallbackQuery({ text: 'Recording saving...' });

    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();

    if (!session) {
      return ctx.editMessageText('Session expired. Please re-link your account.');
    }

    const { data: issue } = await supabase
      .from('detected_issues')
      .select('*')
      .eq('id', issueId)
      .eq('user_id', session.user_id)
      .single();

    if (!issue) {
      return ctx.editMessageText('Issue not found.');
    }

    // Record verified saving
    await supabase.from('verified_savings').insert({
      user_id: session.user_id,
      saving_type: issue.issue_type === 'price_increase' ? 'price_reverted' : 'dispute_won',
      title: `${issue.title} — resolved`,
      amount_saved: issue.amount_impact ?? 0,
      annual_saving: issue.amount_impact ?? 0,
      detected_issue_id: issueId,
      confirmed_by: 'telegram',
    });

    // Mark issue resolved
    await supabase
      .from('detected_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issueId);

    await ctx.editMessageText(
      `✅ *Saving recorded!*\n\nGreat news — this has been added to your Verified Savings in your Money Hub dashboard.\n\npaybacker.co.uk/dashboard/money-hub`,
      { parse_mode: 'Markdown' },
    );
  });

  // -------------------------------------------------------
  // Callback: Dismiss issue
  // -------------------------------------------------------
  bot.callbackQuery(/^dismiss_(.+)$/, async (ctx) => {
    const issueId = ctx.match[1];
    const supabase = getAdmin();

    await supabase
      .from('detected_issues')
      .update({ status: 'dismissed' })
      .eq('id', issueId);

    await ctx.editMessageText('Got it — I\'ll stop tracking this issue.');
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------
  // Callback: Snooze issue (7 days)
  // -------------------------------------------------------
  bot.callbackQuery(/^snooze_(.+)$/, async (ctx) => {
    const issueId = ctx.match[1];
    const supabase = getAdmin();
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await supabase
      .from('detected_issues')
      .update({ status: 'snoozed', snooze_until: snoozeUntil.toISOString() })
      .eq('id', issueId);

    await ctx.editMessageText(
      `Snoozed for 7 days. I'll remind you on ${snoozeUntil.toLocaleDateString('en-GB')}.`,
    );
    await ctx.answerCallbackQuery();
  });

  // -------------------------------------------------------
  // Text message handler — main conversational query interface
  // -------------------------------------------------------
  bot.on('message:text', async (ctx) => {
    const supabase = getAdmin();
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    // Check linked session
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id, last_message_at')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();

    if (!session) {
      return ctx.reply(
        `Please link your Paybacker account first:\n\n` +
          `1. Go to paybacker.co.uk/dashboard/settings/telegram\n` +
          `2. Generate a link code\n` +
          `3. Send: /link YOUR_CODE\n\n` +
          `Or type /start for setup instructions.`,
      );
    }

    // Check 90-day session expiry
    if (isSessionExpired(session.last_message_at)) {
      await supabase
        .from('telegram_sessions')
        .update({ is_active: false })
        .eq('telegram_chat_id', chatId);

      return ctx.reply(
        `Your session has expired due to inactivity (90 days).\n\nPlease re-link your account at paybacker.co.uk/dashboard/settings/telegram`,
      );
    }

    // Verify Pro subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status, stripe_subscription_id')
      .eq('id', session.user_id)
      .single();

    const tier = profile?.subscription_tier;
    const status = profile?.subscription_status;
    const hasStripe = !!profile?.stripe_subscription_id;
    const isPro =
      tier === 'pro' &&
      (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing');

    if (!isPro) {
      return ctx.reply(
        `This feature requires a Pro subscription.\n\nUpgrade at paybacker.co.uk/dashboard/upgrade`,
      );
    }

    // Rate limit: 200 messages per hour
    const withinLimit = await checkRateLimit(supabase, session.user_id);
    if (!withinLimit) {
      return ctx.reply(
        `You've reached the limit of ${RATE_LIMIT_PER_HOUR} messages per hour. Please try again shortly.`,
      );
    }

    // Update last_message_at
    supabase
      .from('telegram_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('telegram_chat_id', chatId)
      .then(() => {});

    // Log inbound (await so it's in DB before getConversationHistory runs)
    const startTime = Date.now();
    await supabase
      .from('telegram_message_log')
      .insert({
        user_id: session.user_id,
        telegram_chat_id: chatId,
        direction: 'inbound',
        message_text: userMessage,
      });

    // Show typing...
    await ctx.replyWithChatAction('typing');

    try {
      const { text, pendingAction } = await callClaudeWithTools(session.user_id, userMessage, chatId);

      // Log outbound
      supabase
        .from('telegram_message_log')
        .insert({
          user_id: session.user_id,
          telegram_chat_id: chatId,
          direction: 'outbound',
          message_text: text,
          processing_time_ms: Date.now() - startTime,
        })
        .then(() => {});

      if (pendingAction) {
        // Store pending action in DB
        const { data: pending } = await supabase
          .from('telegram_pending_actions')
          .insert({
            user_id: session.user_id,
            telegram_chat_id: chatId,
            action_type: 'dispute_letter',
            payload: pendingAction,
          })
          .select('id')
          .single();

        const keyboard = new InlineKeyboard()
          .text('Approve and save ✓', `approve_${pending?.id}`)
          .text('Cancel ✗', `cancel_${pending?.id}`);

        const chunks = splitMessage(text);
        for (let i = 0; i < chunks.length; i++) {
          if (i === chunks.length - 1) {
            await ctx.reply(chunks[i], { reply_markup: keyboard });
          } else {
            await ctx.reply(chunks[i]);
          }
        }
      } else {
        await sendChunked(ctx, text);
      }
    } catch (error) {
      console.error('[UserBot] Error processing message:', error);
      await ctx.reply(
        'Sorry, I ran into an issue. Please try again in a moment.',
      );
    }
  });

  return bot;
}

// ============================================================
// Helper: send a proactive alert to a linked user
// Used by the telegram-alerts cron job
// ============================================================
export async function sendProactiveAlert(params: {
  chatId: number;
  issue: {
    id: string;
    title: string;
    detail: string;
    recommendation?: string | null;
    amount_impact?: number | null;
    issue_type: string;
  };
  showFollowUpButtons?: boolean;
}): Promise<{ messageId?: number; ok: boolean }> {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) return { ok: false };

  const { chatId, issue, showFollowUpButtons } = params;
  const TELEGRAM_API = `https://api.telegram.org/bot${token}`;

  let text = `*${issue.title}*\n\n${issue.detail}`;
  if (issue.recommendation) {
    text += `\n\n_${issue.recommendation}_`;
  }
  if (issue.amount_impact && issue.amount_impact > 0) {
    text += `\n\n💰 *Annual impact: £${Number(issue.amount_impact).toFixed(2)}*`;
  }

  // Build inline keyboard
  let replyMarkup: object | undefined;

  if (showFollowUpButtons) {
    // Follow-up: did it get resolved?
    replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Yes, resolved ✅', callback_data: `confirm_saving_${issue.id}` },
          { text: 'No response yet', callback_data: `snooze_${issue.id}` },
          { text: 'Dismiss', callback_data: `dismiss_${issue.id}` },
        ],
      ],
    };
  } else {
    // Initial alert: action or dismiss
    replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Dismiss', callback_data: `dismiss_${issue.id}` },
          { text: 'Snooze 7 days', callback_data: `snooze_${issue.id}` },
        ],
      ],
    };
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    }),
  });

  const data = await res.json() as { ok: boolean; result?: { message_id: number } };
  return { ok: data.ok, messageId: data.result?.message_id };
}
