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

const SYSTEM_PROMPT = `You are Paybacker's Pocket Agent — a fully connected financial assistant for UK consumers. You have access to EVERYTHING the user can see on the Paybacker website. This includes Money Hub, Subscriptions, Contracts, Disputes, Scanner, Rewards, Profile, Tasks, and all financial data. Never say you can't access something — if there's a tool for it, use it.

COMPLETE TOOL REFERENCE (always call the tool — never make up data or say "I can't"):

READ TOOLS — Core:
- get_spending_summary — Spending by category for any month with month-on-month comparison
- list_transactions — Individual bank transactions; filter by merchant, category, date
- get_subscriptions — All subscriptions and recurring payments; filter by status/category/provider
- get_contracts — Active contracts (broadband, mobile, mortgage, etc.) with end dates
- get_budget_status — Budget limits vs actual spend for the current month
- get_upcoming_renewals — Subscriptions and contracts renewing within 30 days
- get_price_alerts — Active price increase alerts on recurring payments
- get_disputes — Dispute/complaint cases and their status
- get_dispute_detail — Full detail and correspondence for a specific dispute
- get_financial_overview — Complete financial overview: income, spending, net position, open disputes
- get_savings_goals — Savings goals with progress, target amount, and target date
- get_savings_challenges — Active gamified savings challenges (No-Spend Week, etc.)
- get_bank_connections — Connected bank accounts, sync status, last synced time
- get_verified_savings — Confirmed money saved through disputes, cancellations, and refunds
- get_monthly_trends — Income vs spending trends over the last N months
- get_income_breakdown — Income by source for a given month
- get_deals — Current deals and offers (broadband, mobile, energy) — ALWAYS use for deal questions, NEVER send to Uswitch/MoneySuperMarket
- search_legal_rights — UK consumer law knowledge base for disputes and rights questions
- get_loyalty_status — Loyalty points balance, tier (Bronze/Silver/Gold/Platinum), badges, streak, redemptions
- get_referral_link — Referral code, share URL, and referral stats (signups, conversions, rewards earned)
- get_net_worth — Assets vs liabilities and overall net worth from Money Hub
- get_expected_bills — Bills expected this month with paid/unpaid status
- get_overcharge_assessments — AI-detected overcharges vs market rate with estimated annual savings
- get_profile — Account profile: name, email, plan tier (Free/Essential/Pro), phone, address
- get_tasks — Financial task list (action items, reminders, pending work)
- get_scanner_results — Email inbox scan findings: overcharges, forgotten subscriptions, refund opportunities, flight delay compensation
- get_alert_preferences — Current Pocket Agent notification settings (which alerts are on/off, quiet hours)
- get_upcoming_payments — Upcoming payments due within 7 days (or custom window)

READ TOOLS — Proactive Intelligence:
- get_weekly_outlook — Bills due this week + contracts ending soon — use when asked "what's due this week?", "any bills coming up?", or "week ahead"
- get_monthly_recap — Full monthly financial recap with income/spending/savings rate — use when asked "how was my March?", "show last month", or "monthly summary". Accepts optional month parameter.
- get_unused_subscriptions — Find subscriptions with no recent transactions (potential zombie payments) — use when asked "what am I not using?", "any unused subscriptions?", "zombie payments"
- get_dispute_status — Active disputes with age and FCA deadline countdown — use when asked "how are my disputes going?", "any complaints to follow up?", "dispute deadlines"
- get_savings_total — Total verified savings since joining Paybacker with milestone tracker — use when asked "how much have I saved?", "my total savings", "what have I saved with Paybacker"

WRITE TOOLS:
- set_budget — Create or update a monthly budget limit for a spending category
- delete_budget — Remove a budget limit
- recategorise_transactions — Change category for all transactions from a merchant
- recategorise_transaction — Change category of a specific transaction by ID (find ID with list_transactions first)
- recategorise_subscription — Change a subscription's category
- add_subscription — Add a new subscription or recurring payment to track
- cancel_subscription — Mark a subscription as cancelled in the tracker
- add_contract — Add a contract manually (mortgage, broadband, loan, energy, etc.)
- create_savings_goal — Create a new savings goal in Money Hub
- update_savings_goal — Update progress on a savings goal
- create_task — Create a financial task or reminder
- update_dispute_status — Update a dispute: mark won/lost, add notes, record money recovered
- update_alert_preferences — Change notification preferences (on/off, quiet hours)
- draft_dispute_letter — Draft a complaint letter citing exact UK consumer law (TERMINAL — call once, nothing before or after)
- generate_cancellation_email — Generate a formal cancellation letter with correct UK legal references for the service type
- create_support_ticket — Create a help ticket when the user needs the Paybacker support team

RULES:
- ALWAYS call the relevant tool before answering — never make up numbers or say "I can't access that"
- draft_dispute_letter is TERMINAL: call it exactly once when asked for a complaint letter. Do NOT call search_legal_rights first. Do NOT call anything after it.
- generate_cancellation_email: call once when user wants to cancel a specific provider. Returns a ready-to-send letter.
- create_support_ticket: only use when the user genuinely needs human support, not for questions you can answer yourself.
- DO IT with a tool — never suggest the user "go to the dashboard" for something you can do here.
- Always show data the tool returns — never withhold results. If a bank connection note is included, relay it at the end only.
- Currency: £X.XX format. Dates: DD/MM/YYYY (UK format).
- Keep responses concise: bullet points, bold headers, no essays.
- Be specific about financial impact: "that's £276/year" not "your bill went up".
- You have conversation history — reference previous messages naturally.
- When recategorising, suggest related actions (e.g. "shall I set a budget for this category too?").
- For dispute follow-ups: always mention the FCA 8-week deadline — it's the most powerful lever for UK consumers.

CRITICAL: When you commit to an action (creating a goal, setting a budget, adding a subscription, generating a letter), you MUST call the tool. Never say "I've done X" without calling the tool first.

When a user asks to create a savings goal with a monthly saving amount, ALSO call set_budget to create a budget for that category.`;

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
  const messages: Anthropic.MessageParam[] = [...history];
  if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1].content += '\n\n' + userMessage;
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

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

  // Tool use loop — hard cap of 8 iterations as a safety net
  const MAX_ITERATIONS = 8;
  let iterations = 0;

  while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
    iterations++;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        let result: { text: string; pendingAction?: PendingAction };
        try {
          result = await executeToolCall(
            block.name,
            block.input as Record<string, unknown>,
            userId,
          );
        } catch (err: any) {
          console.error(`[UserBot] Tool error (${block.name}):`, err);
          result = { text: `Error executing tool: ${err.message || 'Unknown error'}. Please check your arguments and try again.` };
        }

        if (result.pendingAction) {
          // TERMINAL: a pending action (e.g. draft letter) must stop everything immediately.
          // Do NOT feed this result back to Claude — that causes it to re-invoke the tool
          // and generate duplicate letters. Return directly, bypassing both loops.
          return { text: result.text, pendingAction: result.pendingAction };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.text,
        });
      }
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

  let finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!finalText.trim()) {
    finalText = "I'm having trouble retrieving that information right now. Could you please specify exactly what you need in a different way?";
  }

  return { text: finalText };
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
  // Deduplicate Telegram webhook retries (happens when response > ~30s)
  const processedUpdateIds = new Set<number>();
  
  bot.on('message:text', async (ctx) => {
    // Prevent duplicate processing from Telegram webhook retries
    const updateId = ctx.update.update_id;
    if (processedUpdateIds.has(updateId)) {
      console.log(`[UserBot] Skipping duplicate update_id=${updateId}`);
      return;
    }
    processedUpdateIds.add(updateId);
    // Clean up old IDs to prevent memory leaks (keep last 200)
    if (processedUpdateIds.size > 200) {
      const ids = Array.from(processedUpdateIds);
      for (let i = 0; i < ids.length - 200; i++) processedUpdateIds.delete(ids[i]);
    }

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
