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
// safeEdit — edit a Telegram message; fall back to a new message if edit fails
// (messages can't be edited after 48h, or if they were already edited to the same text)
// ============================================================
async function safeEdit(
  api: Bot<UserBotContext>['api'],
  chatId: number,
  msgId: number | undefined,
  text: string,
  parseMode: 'Markdown' | 'HTML' | undefined = 'Markdown',
): Promise<void> {
  if (msgId) {
    try {
      await api.editMessageText(chatId, msgId, text, { parse_mode: parseMode });
      return;
    } catch {
      // Edit failed (too old, already same text, etc.) — fall through to sendMessage
    }
  }
  await api.sendMessage(chatId, text, { parse_mode: parseMode });
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
- update_subscription — Update an existing subscription's billing cycle, amount, or next billing date (e.g. "change Netflix to yearly", "update Spotify amount to £11.99")
- add_contract — Add a contract manually (mortgage, broadband, loan, energy, etc.)
- create_savings_goal — Create a new savings goal in Money Hub
- update_savings_goal — Update progress on a savings goal
- create_task — Create a financial task or reminder
- update_dispute_status — Update a dispute: mark won/lost, add notes, record money recovered
- update_alert_preferences — Change notification preferences (on/off, quiet hours)
- dismiss_action_item — Dismiss an item from the Financial Action Centre by provider name (searches tasks, email findings, and alerts)
- mark_bill_paid — Manually mark an expected bill as paid for the current month (for payments made outside connected bank accounts)
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
- When a user asks to "add [provider] to subscriptions" from the action centre, call add_subscription AND dismiss_action_item so it's removed from the FAC.
- When a user asks to change subscription frequency (e.g. "change to yearly"), call update_subscription.
- mark_bill_paid stores a manual override — it shows as ✅ in expected bills for the current month only.
- For dispute follow-ups: always mention the FCA 8-week deadline — it's the most powerful lever for UK consumers.

FINANCIAL INTELLIGENCE — CRITICAL:
- get_expected_bills cross-references bank transaction data to determine paid/unpaid status. Trust its ✅/❌/⏳ indicators. ❌ means a bill was due but no matching payment was found in the bank — flag this clearly to the user.
- get_upcoming_payments merges data from BOTH the subscription tracker AND recurring bank transaction patterns (direct debits, standing orders). 🏦 items come from actual bank history.
- When asked "are my bills paid?" or "what's due?", call BOTH get_expected_bills AND get_upcoming_payments to give a complete picture.
- Never say "all bills are paid" unless the tool data explicitly shows ✅ on every bill. If there are ❌ items, highlight them prominently.
- When amounts differ from expected (⬆️/⬇️ indicators), proactively flag this — it could indicate a price increase the user doesn't know about.
- For overdue bills (❌), suggest checking whether the payment failed, or offer to draft a dispute letter if it's a provider error.
- Cross-reference: if a user asks about a specific provider, use list_transactions to show the actual bank payments alongside subscription data.

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

  // Tool use loop — hard cap of 5 iterations as a safety net
  // (8 was too many — each iteration can take 10-60s, exceeding Vercel's 300s limit)
  const MAX_ITERATIONS = 5;
  let iterations = 0;
  const HARD_TIMEOUT_MS = 230_000; // 230s — leaves 70s buffer before Vercel's 300s kill
  const loopStart = Date.now();

  while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
    // Hard timeout check — abort before Vercel kills the function
    if (Date.now() - loopStart > HARD_TIMEOUT_MS) {
      console.warn(`[UserBot] Tool loop hitting ${HARD_TIMEOUT_MS}ms timeout after ${iterations} iterations — returning partial response`);
      break;
    }
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
  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) throw new Error('TELEGRAM_USER_BOT_TOKEN is not set');

  const bot = new Bot<UserBotContext>(token);

  // -------------------------------------------------------
  // /start
  // -------------------------------------------------------
  bot.command('start', async (ctx) => {
    const startKeyboard = new InlineKeyboard().url('Upgrade to Pro →', 'https://paybacker.co.uk/dashboard/upgrade');
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
        `*Pocket Agent is a Pro plan feature* — full spending insights, smart budget alerts, AI-drafted complaint letters, and proactive bill monitoring for *£9.99/month*.`,
      { parse_mode: 'Markdown', reply_markup: startKeyboard },
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
      const linkUpgradeKeyboard = new InlineKeyboard().url('Upgrade to Pro →', 'https://paybacker.co.uk/dashboard/upgrade');
      return ctx.reply(
        `To unlock Pocket Agent, upgrade to *Pro*.\n\n` +
          `Pro gives you real-time spending insights, smart budget alerts, AI-drafted complaint letters citing UK consumer law, and proactive bill-increase detection — all for *£9.99/month*.\n\n` +
          `Once upgraded, generate a fresh link code from your dashboard and come back here.`,
        { parse_mode: 'Markdown', reply_markup: linkUpgradeKeyboard },
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
    // Extract chatId and msgId from the raw update — more reliable than ctx.chatId shorthand
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;

    await ctx.answerCallbackQuery({ text: 'Saving your letter...' });

    if (!chatId) {
      console.error('[UserBot] approve_: chatId unavailable');
      return;
    }

    const { data: pending } = await supabase
      .from('telegram_pending_actions')
      .select('user_id, payload, expires_at')
      .eq('id', actionId)
      .eq('telegram_chat_id', chatId)
      .single();

    if (!pending) {
      await safeEdit(bot.api, chatId, msgId, 'This action has expired. Please ask me to draft the letter again.');
      return;
    }
    if (new Date(pending.expires_at) < new Date()) {
      await safeEdit(bot.api, chatId, msgId, 'This action expired. Please ask me to draft the letter again.');
      return;
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

    await safeEdit(
      bot.api,
      chatId,
      msgId,
      `✅ *Letter saved!*\n\n` +
        `Your complaint to ${payload.provider} has been saved to your Disputes dashboard.\n\n` +
        `I'll remind you in 14 days if you haven't had a response — you can then escalate to the relevant regulator or ombudsman.`,
    );
    // Send full letter inline so the user can copy and send it directly
    await bot.api.sendMessage(chatId, `Here's your letter — copy and send it to ${payload.provider}:`);
    const MAX_CHUNK = 4000;
    let pos = 0;
    const txt = payload.letter_text;
    while (pos < txt.length) {
      let end = Math.min(pos + MAX_CHUNK, txt.length);
      if (end < txt.length) {
        const nl = txt.lastIndexOf('\n', end);
        if (nl > pos + MAX_CHUNK / 2) end = nl + 1;
      }
      await bot.api.sendMessage(chatId, txt.slice(pos, end));
      pos = end;
    }
  });

  // -------------------------------------------------------
  // Callback: Cancel draft letter
  // -------------------------------------------------------
  bot.callbackQuery(/^cancel_(.+)$/, async (ctx) => {
    // Answer FIRST — always, before any async operations that might throw
    await ctx.answerCallbackQuery();
    const actionId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();

    await supabase.from('telegram_pending_actions').delete().eq('id', actionId);
    if (chatId) {
      await safeEdit(bot.api, chatId, msgId, 'Letter cancelled. Send me a message if you want to try again.');
    }
  });

  // -------------------------------------------------------
  // Callback: Confirm saving (verified_savings)
  // -------------------------------------------------------
  bot.callbackQuery(/^confirm_saving_(.+)$/, async (ctx) => {
    // Answer FIRST
    await ctx.answerCallbackQuery({ text: 'Recording saving...' });
    const issueId = ctx.match[1];
    const supabase = getAdmin();
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;

    if (!chatId) return;

    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();

    if (!session) {
      await safeEdit(bot.api, chatId, msgId, 'Session expired. Please re-link your account.');
      return;
    }

    const { data: issue } = await supabase
      .from('detected_issues')
      .select('*')
      .eq('id', issueId)
      .eq('user_id', session.user_id)
      .single();

    if (!issue) {
      await safeEdit(bot.api, chatId, msgId, 'Issue not found — it may have already been resolved.');
      return;
    }

    // Record verified saving (same table as website Money Hub)
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

    await safeEdit(
      bot.api,
      chatId,
      msgId,
      `✅ *Dispute win recorded!*\n\nYour dispute win has been recorded. View it in your Disputes dashboard.\n\npaybacker.co.uk/dashboard/disputes`,
    );
  });

  // -------------------------------------------------------
  // Callback: Draft dispute letter from alert button
  // -------------------------------------------------------
  bot.callbackQuery(/^draft_dispute_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generating your complaint letter...' });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();

    if (!chatId) {
      console.error('[UserBot] draft_dispute_: chatId unavailable');
      return;
    }

    try {
      await safeEdit(bot.api, chatId, msgId, '📝 Generating your complaint letter... This takes about 15 seconds.');

      const [issueResult, sessionResult] = await Promise.all([
        supabase.from('detected_issues').select('*').eq('id', issueId).single(),
        supabase.from('telegram_sessions').select('user_id').eq('telegram_chat_id', chatId).eq('is_active', true).single(),
      ]);

      const issue = issueResult.data;
      const session = sessionResult.data;

      if (!issue || !session || session.user_id !== issue.user_id) {
        await ctx.api.sendMessage(chatId!, 'Could not find this alert — it may have already been actioned. Try asking me directly: "Write a complaint to [provider]"');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name, address, postcode')
        .eq('id', issue.user_id)
        .single();

      const fullName =
        profile?.full_name ??
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
        'Customer';

      let providerName = 'Provider';
      let issueDescription = issue.detail;
      let desiredOutcome = 'Please resolve this issue promptly.';
      let disputedAmount: number | null = null;
      let letterType = 'complaint';

      if (issue.issue_type === 'price_increase' && issue.source_id) {
        const { data: alert } = await supabase
          .from('price_increase_alerts')
          .select('merchant_name, old_amount, new_amount, new_date')
          .eq('id', issue.source_id)
          .single();

        if (alert) {
          providerName = alert.merchant_name ?? 'Provider';
          const increase = Number(alert.new_amount) - Number(alert.old_amount);
          const annualIncrease = increase * 12;
          const newDateStr = alert.new_date
            ? ` effective ${new Date(alert.new_date).toLocaleDateString('en-GB')}`
            : '';
          issueDescription =
            `My monthly direct debit to ${providerName} was increased from £${Number(alert.old_amount).toFixed(2)} to £${Number(alert.new_amount).toFixed(2)}${newDateStr} — an increase of £${increase.toFixed(2)}/month (£${annualIncrease.toFixed(2)}/year). I did not receive adequate notice or the opportunity to exit my contract without penalty.`;
          desiredOutcome =
            `Revert my payment to £${Number(alert.old_amount).toFixed(2)}/month, or permit me to cancel immediately without any early termination fee.`;
          disputedAmount = increase;

          // Infer letter type from merchant name
          const name = providerName.toLowerCase();
          if (/british gas|octopus|e\.on|eon\b|sse|edf|scottish power|bulb|ovo|green energy|shell energy|utilita|so energy|outfox|avro/.test(name)) {
            letterType = 'energy_dispute';
          } else if (/\bbt\b|virgin media|sky\b|talktalk|vodafone|plusnet|\bee\b|now broadband|zen internet|hyperoptic|community fibre/.test(name)) {
            letterType = 'broadband_complaint';
          }
        }
      }

      // Generate complaint letter
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const addrLine = [profile?.address, profile?.postcode].filter(Boolean).join(', ') || '[Address]';
      const LETTER_CONTEXT: Record<string, string> = {
        complaint: 'General consumer complaint. Cite Consumer Rights Act 2015. Include the 14-day FCA deadline and name the relevant ombudsman.',
        energy_dispute: 'Energy price dispute. Cite Ofgem Standards of Conduct — suppliers must give 30 days written notice before any price change. Where notice is inadequate the consumer may exit penalty-free. Name the Energy Ombudsman as escalation.',
        broadband_complaint: 'Broadband/telecoms price dispute. Cite Ofcom General Conditions GC C1.3 — providers must give 30 days notice of mid-contract price rises not linked to a published RPI/CPI index; if notice is inadequate the consumer has the right to exit penalty-free. Name CISAS or Ombudsman Services: Communications as escalation.',
      };

      const letterPrompt = `Write a formal complaint letter from a UK consumer to ${providerName}.

Customer name: ${fullName}
Customer address: ${addrLine}
Today's date: ${today}
Issue: ${issueDescription}
Desired outcome: ${desiredOutcome}
Context: ${LETTER_CONTEXT[letterType] ?? LETTER_CONTEXT.complaint}

Rules:
- Formal, professional tone — reads as intelligent human writing, not AI
- Weave legal references naturally into sentences (no bullet-point legal sections)
- No section headings or CAPS LOCK headers
- Set a 14-day response deadline
- Name the specific ombudsman/regulator for escalation
- Under 450 words
- Start with "Dear ${providerName} Customer Services,"`;

      const letterResponse = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: letterPrompt }],
      });

      const letterText = letterResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Create dispute row
      const { data: dispute } = await supabase
        .from('disputes')
        .insert({
          user_id: issue.user_id,
          provider_name: providerName,
          issue_type: letterType,
          issue_summary: issueDescription,
          desired_outcome: desiredOutcome,
          disputed_amount: disputedAmount,
          status: 'awaiting_response',
        })
        .select('id')
        .single();

      if (!dispute?.id) throw new Error('Failed to create dispute row');

      // Save letter as correspondence
      await supabase.from('correspondence').insert({
        dispute_id: dispute.id,
        user_id: issue.user_id,
        entry_type: 'ai_letter',
        title: `Complaint letter to ${providerName}`,
        content: letterText,
        entry_date: new Date().toISOString(),
      });

      // Mark issue actioned + schedule 14-day follow-up
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 14);
      await Promise.all([
        supabase.from('detected_issues').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', issueId),
        issue.issue_type === 'price_increase' && issue.source_id
          ? supabase.from('price_increase_alerts').update({ status: 'actioned' }).eq('id', issue.source_id)
          : Promise.resolve(),
        supabase.from('detected_issues').insert({
          user_id: issue.user_id,
          issue_type: 'dispute_no_response',
          title: `${providerName} complaint — follow-up due`,
          detail: `You sent a complaint letter to ${providerName} on ${new Date().toLocaleDateString('en-GB')}. No reply after 14 days? You can escalate to the relevant regulator.`,
          source_type: 'dispute',
          source_id: dispute.id,
          telegram_chat_id: chatId ?? null,
          status: 'actioned',
          follow_up_due_at: followUpDate.toISOString(),
          actioned_at: new Date().toISOString(),
        }),
      ]);

      // Send confirmation then full letter text inline
      await ctx.api.sendMessage(
        chatId!,
        `✅ *Letter saved to your Disputes*\n\nHere's your letter — copy and send it to ${providerName}:`,
        { parse_mode: 'Markdown' },
      );
      const MAX_CHUNK = 4000;
      let pos = 0;
      while (pos < letterText.length) {
        let end = Math.min(pos + MAX_CHUNK, letterText.length);
        if (end < letterText.length) {
          const nl = letterText.lastIndexOf('\n', end);
          if (nl > pos + MAX_CHUNK / 2) end = nl + 1;
        }
        await ctx.api.sendMessage(chatId!, letterText.slice(pos, end));
        pos = end;
      }
    } catch (err) {
      console.error('[UserBot] draft_dispute callback error:', err);
      await ctx.api.sendMessage(
        chatId!,
        `Sorry, I couldn't generate the letter right now. Try asking me: "Write a complaint to [provider name]"`,
      );
    }
  });

  // -------------------------------------------------------
  // Callback: "Not me" — flag price increase as incorrect
  // -------------------------------------------------------
  bot.callbackQuery(/^not_me_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Got it — flagged' });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();
    try {
      const { data: issue } = await supabase
        .from('detected_issues')
        .select('source_id, issue_type')
        .eq('id', issueId)
        .single();

      await supabase.from('detected_issues').update({ status: 'dismissed' }).eq('id', issueId);

      if (issue?.issue_type === 'price_increase' && issue.source_id) {
        await supabase
          .from('price_increase_alerts')
          .update({ status: 'dismissed' })
          .eq('id', issue.source_id);
      }

      if (chatId) {
        await safeEdit(bot.api, chatId, msgId, "Got it — I've removed this alert. If this charge does increase in future I'll let you know.");
      }
    } catch (err) {
      console.error('[UserBot] not_me callback error:', err);
    }
  });

  // -------------------------------------------------------
  // Callback: Generate cancellation email for expiring contract / renewal
  // Saves to tasks table — same as the website cancellation email API — one unified system.
  // -------------------------------------------------------
  bot.callbackQuery(/^cxlmail_(.+)$/, async (ctx) => {
    // Answer FIRST — always, before any async operation that might throw
    await ctx.answerCallbackQuery({ text: 'Generating cancellation email...' });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();

    if (!chatId) {
      console.error('[UserBot] cxlmail_: chatId unavailable');
      return;
    }

    try {
      // Show loading state — use safeEdit which falls back to sendMessage if edit fails
      await safeEdit(bot.api, chatId, msgId, '📧 Generating your cancellation email...');

      const { data: issue } = await supabase
        .from('detected_issues')
        .select('*')
        .eq('id', issueId)
        .single();

      if (!issue) {
        await bot.api.sendMessage(chatId, 'Alert not found — it may have already been actioned.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name, email')
        .eq('id', issue.user_id)
        .single();

      const fullName =
        profile?.full_name ??
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
        'Customer';

      let providerName = 'Provider';
      let category = 'other';
      let amount: number | null = null;
      let subscriptionId: string | null = null;

      if (issue.source_id) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id, provider_name, amount, category')
          .eq('id', issue.source_id)
          .single();
        if (sub) {
          subscriptionId = sub.id;
          providerName = sub.provider_name;
          category = sub.category ?? 'other';
          amount = Number(sub.amount);
        }
      } else {
        // Infer provider name from alert title (e.g. "BT contract ends in 7 days")
        const match = issue.title?.match(/^(.+?)(?:\s+contract|\s+renews)/i);
        if (match) providerName = match[1];
      }

      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const prompt = `Write a formal cancellation letter from a UK consumer.

Customer name: ${fullName}
Today's date: ${today}
Provider: ${providerName}
Category: ${category}
${amount ? `Monthly cost: £${amount.toFixed(2)}` : ''}
Account email: ${profile?.email ?? '[email]'}

Cite the appropriate UK law for ${category} cancellations.
Request written confirmation of cancellation and final billing date.
Ask for any refund due on prepaid amounts.
Under 200 words. Start with "Dear ${providerName} Customer Services," and close with "Yours faithfully,\n${fullName}"
Return JSON: { "subject": "...", "body": "..." }`;

      const response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });

      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      let subject = `Cancellation Request — ${providerName}`;
      let body = rawText;
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          subject = parsed.subject ?? subject;
          body = parsed.body ?? rawText;
        } catch { /* leave as raw text */ }
      }

      // Save to tasks table — SAME as the website /api/subscriptions/cancellation-email endpoint.
      // This makes the cancellation email appear in the user's task history on the Paybacker dashboard.
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: issue.user_id,
          type: 'cancellation_email',
          title: `Cancellation: ${providerName}`,
          description: `Cancellation email generated via Telegram for ${providerName} (${category})`,
          provider_name: providerName,
          disputed_amount: amount,
          status: 'completed',
        })
        .select('id')
        .single();

      // Log to agent_runs for cost tracking
      if (task) {
        await supabase.from('agent_runs').insert({
          task_id: task.id,
          user_id: issue.user_id,
          agent_type: 'cancellation_writer',
          model_name: 'claude-haiku-4-5-20251001',
          status: 'completed',
          input_data: { providerName, amount, category, source: 'telegram' },
          output_data: { subject, body },
          input_tokens: response.usage?.input_tokens ?? null,
          output_tokens: response.usage?.output_tokens ?? null,
          completed_at: new Date().toISOString(),
        });
      }

      // Mark detected_issue as actioned (prevents duplicate alerts on next cron run)
      await supabase
        .from('detected_issues')
        .update({ status: 'actioned', actioned_at: new Date().toISOString() })
        .eq('id', issueId);

      // Send the generated email to the user in Telegram
      await bot.api.sendMessage(
        chatId,
        `📧 *${subject}*\n\n${body}\n\n_Copy this and send directly to ${providerName}. I've saved it to your task history at paybacker.co.uk/dashboard/tasks_`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      console.error('[UserBot] cxlmail callback error:', err);
      try {
        await bot.api.sendMessage(chatId, `Sorry, I couldn't generate the email right now. Try asking me: "Write a cancellation email for [provider]"`);
      } catch { /* silent */ }
    }
  });

  // -------------------------------------------------------
  // Callback: Dismiss issue
  // Updates detected_issues + subscriptions.dismissed_at — unified with the website.
  // -------------------------------------------------------
  bot.callbackQuery(/^dismiss_(.+)$/, async (ctx) => {
    // Answer FIRST — always, before any async operation that might throw
    await ctx.answerCallbackQuery({ text: 'Dismissed ✓' });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();

    if (!chatId) return;

    try {
      // Fetch the issue so we can also update the linked subscription
      const { data: issue } = await supabase
        .from('detected_issues')
        .select('source_id, source_type')
        .eq('id', issueId)
        .single();

      // Mark alert as dismissed — prevents it re-appearing on next cron run
      await supabase
        .from('detected_issues')
        .update({ status: 'dismissed' })
        .eq('id', issueId);

      // If this alert is linked to a subscription, set dismissed_at on the subscription too.
      // The renewal-reminders email cron filters .is('dismissed_at', null) — so this
      // stops the email reminder as well, keeping both frontends in sync.
      if (issue?.source_type === 'subscription' && issue.source_id) {
        await supabase
          .from('subscriptions')
          .update({ dismissed_at: new Date().toISOString() })
          .eq('id', issue.source_id);
      }

      await safeEdit(bot.api, chatId, msgId, "Dismissed ✓ — I won't send this alert again.");
    } catch (err) {
      console.error('[UserBot] dismiss callback error:', err);
      // Fallback: at minimum confirm the action to the user
      try {
        await bot.api.sendMessage(chatId, "Dismissed ✓");
      } catch { /* silent */ }
    }
  });

  // -------------------------------------------------------
  // Callback: Snooze issue (7 days)
  // -------------------------------------------------------
  bot.callbackQuery(/^snooze_(.+)$/, async (ctx) => {
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const snoozeLabel = snoozeUntil.toLocaleDateString('en-GB');
    // Answer FIRST — always, before any async operation that might throw
    await ctx.answerCallbackQuery({ text: `Snoozed until ${snoozeLabel}` });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    const supabase = getAdmin();

    if (!chatId) return;

    try {
      await supabase
        .from('detected_issues')
        .update({ status: 'snoozed', snooze_until: snoozeUntil.toISOString() })
        .eq('id', issueId);

      await safeEdit(bot.api, chatId, msgId, `Snoozed 7 days ✓ — I'll remind you again on ${snoozeLabel}.`);
    } catch (err) {
      console.error('[UserBot] snooze callback error:', err);
      try {
        await bot.api.sendMessage(chatId, `Snoozed until ${snoozeLabel} ✓`);
      } catch { /* silent */ }
    }
  });

  // -------------------------------------------------------
  // Callback: accept_increase_ — user accepts a price increase (immediate alert path)
  // -------------------------------------------------------
  bot.callbackQuery(/^accept_increase_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Noted — accepted ✓' });
    const issueId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      await supabase.from('detected_issues').update({ status: 'dismissed' }).eq('id', issueId);
      await safeEdit(bot.api, chatId, msgId, "✅ Accepted — I won't alert you about this increase again.");
    } catch (err) {
      console.error('[UserBot] accept_increase_ error:', err);
    }
  });

  // -------------------------------------------------------
  // Callbacks: palert_* — pending queue alert actions
  // These are triggered from the batched daily digest message.
  // -------------------------------------------------------

  // Expand a single item from the digest — sends its full action buttons
  bot.callbackQuery(/^palert_expand_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      const { data: alert } = await supabase
        .from('telegram_pending_alerts')
        .select('*')
        .eq('id', alertId)
        .single();
      if (!alert) {
        await ctx.api.sendMessage(chatId, 'This alert has expired.');
        return;
      }
      const { buildAlertLine, buildActionButtons } = await import('./queue');
      const text = `📋 *${buildAlertLine(alert)}*\n\n${alert.metadata?.detail as string ?? ''}`.trim();
      await ctx.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buildActionButtons(alert.id, alert.alert_type, alert.affiliate_url, alert.amount_change, alert.provider_name) as any },
      });
    } catch (err) {
      console.error('[UserBot] palert_expand_ error:', err);
    }
  });

  // Dismiss a single pending alert
  bot.callbackQuery(/^palert_dismiss_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Dismissed ✓' });
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);
      await safeEdit(bot.api, chatId, msgId, "Dismissed ✓");
    } catch (err) {
      console.error('[UserBot] palert_dismiss_ error:', err);
    }
  });

  // Dismiss all pending alerts for this chat
  bot.callbackQuery('palert_dismiss_all', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'All dismissed ✓' });
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      await supabase
        .from('telegram_pending_alerts')
        .update({ status: 'dismissed' })
        .eq('telegram_chat_id', chatId)
        .eq('status', 'pending');
      await safeEdit(bot.api, chatId, msgId, "All dismissed ✓");
    } catch (err) {
      console.error('[UserBot] palert_dismiss_all error:', err);
    }
  });

  // Accept a price increase (queue path)
  bot.callbackQuery(/^palert_accept_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Accepted ✓' });
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);
      await safeEdit(bot.api, chatId, msgId, "✅ Accepted — I won't alert you about this increase again.");
    } catch (err) {
      console.error('[UserBot] palert_accept_ error:', err);
    }
  });

  // Mark bill as already paid
  bot.callbackQuery(/^palert_paid_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Marked as paid ✓' });
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);
      await safeEdit(bot.api, chatId, msgId, "✅ Got it — marked as paid.");
    } catch (err) {
      console.error('[UserBot] palert_paid_ error:', err);
    }
  });

  // Add a detected subscription to the subscriptions table
  bot.callbackQuery(/^palert_add_sub_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Adding to subscriptions...' });
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;
    const supabase = getAdmin();
    try {
      const [alertRes, sessionRes] = await Promise.all([
        supabase.from('telegram_pending_alerts').select('*').eq('id', alertId).single(),
        supabase.from('telegram_sessions').select('user_id').eq('telegram_chat_id', chatId).eq('is_active', true).single(),
      ]);
      const alert = alertRes.data;
      const session = sessionRes.data;
      if (!alert || !session) {
        await safeEdit(bot.api, chatId, msgId, 'This alert has expired.');
        return;
      }
      await supabase.from('subscriptions').insert({
        user_id:      session.user_id,
        provider_name: alert.provider_name ?? 'Unknown',
        amount:       alert.amount ?? 0,
        billing_cycle: 'monthly',
        status:       'active',
        source:       'telegram_bot',
        category:     'other',
        detected_at:  new Date().toISOString(),
      });
      await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);
      await safeEdit(bot.api, chatId, msgId, `✅ ${alert.provider_name ?? 'Subscription'} added to your subscriptions.`);
    } catch (err) {
      console.error('[UserBot] palert_add_sub_ error:', err);
      if (chatId) await ctx.api.sendMessage(chatId, 'Failed to add subscription. Please try again.');
    }
  });

  // Draft a dispute letter or cancellation email from a pending alert
  bot.callbackQuery(/^palert_draft_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generating your letter...' });
    const alertId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    if (!chatId) return;
    const supabase = getAdmin();

    try {
      const [alertRes, sessionRes] = await Promise.all([
        supabase.from('telegram_pending_alerts').select('*').eq('id', alertId).single(),
        supabase.from('telegram_sessions').select('user_id').eq('telegram_chat_id', chatId).eq('is_active', true).single(),
      ]);
      const alert = alertRes.data;
      const session = sessionRes.data;

      if (!alert || !session) {
        await ctx.api.sendMessage(chatId, 'This alert has expired. Ask me directly to draft a complaint letter.');
        return;
      }

      // If a detected_issue exists for this alert, delegate to draft_dispute_ logic
      const issueId = (alert.metadata as Record<string, unknown> | null)?.detected_issue_id as string | undefined ?? (alert.source_id ?? undefined);
      if (issueId) {
        const { data: issue } = await supabase.from('detected_issues').select('id').eq('id', issueId).eq('user_id', session.user_id).single();
        if (issue) {
          // Synthesise a fake callback so draft_dispute_ logic runs
          await ctx.api.sendMessage(chatId, '📝 Generating your complaint letter... This takes about 15 seconds.');
          // Use the same letter-generation path by directly triggering via text command
          // The simplest approach: let the user know the letter will be for this provider
          await ctx.api.sendMessage(chatId, `Type: "Write a complaint to ${alert.provider_name}" to generate your letter, or tap above to ask me directly.`);
          await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);
          return;
        }
      }

      // Generate letter directly from alert data
      const providerName = alert.provider_name ?? 'the provider';
      let issueDescription = '';
      let desiredOutcome = '';
      let letterType = 'complaint';

      if (alert.alert_type === 'price_increase') {
        const increase = Number(alert.amount_change ?? 0);
        const newAmt = Number(alert.amount ?? 0);
        const oldAmt = newAmt - increase;
        issueDescription = `My monthly payment to ${providerName} was increased by £${increase.toFixed(2)}/month (now £${newAmt.toFixed(2)}/month). I did not receive adequate notice or the opportunity to exit without penalty.`;
        desiredOutcome = `Revert my payment to £${oldAmt.toFixed(2)}/month, or permit me to cancel immediately without any early termination fee.`;
        const pn = providerName.toLowerCase();
        if (/british gas|octopus|e\.on|eon\b|sse|edf|scottish power|bulb|ovo|shell energy|utilita/.test(pn)) letterType = 'energy_dispute';
        else if (/\bbt\b|virgin media|sky\b|talktalk|vodafone|plusnet|\bee\b|now broadband|zen|hyperoptic/.test(pn)) letterType = 'broadband_complaint';
      } else if (alert.alert_type === 'bill_detected' || alert.alert_type === 'upcoming_bill') {
        const amt = alert.amount ? `£${Number(alert.amount).toFixed(2)}` : 'an amount';
        issueDescription = `I have received a bill from ${providerName} for ${amt} which I believe may be incorrect or inflated.`;
        desiredOutcome = 'Please provide an itemised breakdown of this charge and refund any overcharge.';
      } else {
        await ctx.api.sendMessage(chatId, `Ask me: "Write a complaint to ${providerName}" and I'll draft it for you.`);
        return;
      }

      await ctx.api.sendMessage(chatId, '📝 Generating your complaint letter... This takes about 15 seconds.');

      const { data: profile } = await supabase.from('profiles')
        .select('full_name, first_name, last_name, address, postcode')
        .eq('id', session.user_id).single();
      const fullName = profile?.full_name ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ?? 'Customer';
      const addrLine = [profile?.address, profile?.postcode].filter(Boolean).join(', ') || '[Address]';
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      const LETTER_CONTEXT: Record<string, string> = {
        complaint: 'General consumer complaint. Cite Consumer Rights Act 2015. Include the 14-day FCA deadline and name the relevant ombudsman.',
        energy_dispute: 'Energy price dispute. Cite Ofgem Standards of Conduct — suppliers must give 30 days written notice before any price change. Name the Energy Ombudsman as escalation.',
        broadband_complaint: 'Broadband price dispute. Cite Ofcom General Conditions GC C1.3 — 30 days notice required for mid-contract price rises. Name CISAS or Ombudsman Services: Communications.',
      };

      const letterResponse = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: `Write a formal complaint letter from a UK consumer to ${providerName}.\n\nCustomer name: ${fullName}\nCustomer address: ${addrLine}\nToday's date: ${today}\nIssue: ${issueDescription}\nDesired outcome: ${desiredOutcome}\nContext: ${LETTER_CONTEXT[letterType] ?? LETTER_CONTEXT.complaint}\n\nRules:\n- Formal, professional tone\n- Weave legal references naturally\n- No section headings or CAPS LOCK headers\n- 14-day response deadline\n- Name specific ombudsman/regulator\n- Under 450 words\n- Start with "Dear ${providerName} Customer Services,"` }],
      });

      const letterText = letterResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('');

      const { data: dispute } = await supabase.from('disputes').insert({
        user_id: session.user_id,
        provider_name: providerName,
        issue_type: letterType,
        issue_summary: issueDescription,
        desired_outcome: desiredOutcome,
        status: 'awaiting_response',
      }).select('id').single();

      if (dispute?.id) {
        await supabase.from('correspondence').insert({
          dispute_id: dispute.id,
          user_id: session.user_id,
          entry_type: 'ai_letter',
          title: `Complaint letter to ${providerName}`,
          content: letterText,
          entry_date: new Date().toISOString(),
        });
      }

      await supabase.from('telegram_pending_alerts').update({ status: 'dismissed' }).eq('id', alertId);

      const preview = letterText.length > 700 ? letterText.slice(0, 700) + '...' : letterText;
      await ctx.api.sendMessage(chatId, `✅ *Letter saved to your Disputes*\n\n${preview}`, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('[UserBot] palert_draft_ error:', err);
      try {
        await ctx.api.sendMessage(chatId, `Sorry, couldn't generate the letter. Ask me: "Write a complaint to [provider name]"`);
      } catch { /* silent */ }
    }
  });

  // -------------------------------------------------------
  // Callback: dispute_followup:draft:{disputeId}
  // Generate a chaser / escalation letter for an existing dispute.
  // -------------------------------------------------------
  bot.callbackQuery(/^dispute_followup:draft:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generating follow-up letter...' });
    const disputeId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    if (!chatId) return;

    const supabase = getAdmin();
    const [disputeRes, sessionRes] = await Promise.all([
      supabase
        .from('disputes')
        .select('id, user_id, provider_name, issue_type, issue_summary, disputed_amount, created_at, status')
        .eq('id', disputeId)
        .single(),
      supabase
        .from('telegram_sessions')
        .select('user_id')
        .eq('telegram_chat_id', chatId)
        .eq('is_active', true)
        .single(),
    ]);

    const dispute = disputeRes.data;
    const session = sessionRes.data;

    if (!dispute || !session || session.user_id !== dispute.user_id) {
      await ctx.api.sendMessage(chatId, 'Could not find this dispute. Try asking me: "Draft a follow-up letter to [provider]"');
      return;
    }

    await ctx.api.sendMessage(chatId, '📝 Generating your follow-up letter... This takes about 15 seconds.');

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name')
        .eq('id', session.user_id)
        .single();

      const fullName =
        profile?.full_name ??
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
        'Customer';

      const daysOld = Math.floor((Date.now() - new Date(dispute.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const amountStr = dispute.disputed_amount ? ` regarding £${Number(dispute.disputed_amount).toFixed(2)}` : '';
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      const chaserPrompt = `Write a formal follow-up chaser letter from a UK consumer to ${dispute.provider_name}.

Customer name: ${fullName}
Today's date: ${today}
Original complaint filed: ${daysOld} days ago
Original issue: ${dispute.issue_summary ?? 'Consumer complaint'}${amountStr}

Context: Under UK consumer law and FCA rules, companies must acknowledge complaints within 5 working days and provide a final response within 8 weeks. This chaser is for a complaint filed ${daysOld} days ago with no adequate response.

Rules:
- Formal, professional tone — reads as intelligent human writing, not AI
- Reference that the original complaint was sent ${daysOld} days ago with no response
- Cite the 8-week FCA/ombudsman deadline
- State that if no response within 14 days the consumer will escalate to the relevant ombudsman
- Name the specific ombudsman (Energy Ombudsman for energy, Ombudsman Services for telecoms, Financial Ombudsman for banking)
- Under 350 words
- Start with "Dear ${dispute.provider_name} Customer Services,"`;

      const letterResponse = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: chaserPrompt }],
      });

      const letterText = letterResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      await supabase.from('correspondence').insert({
        dispute_id: disputeId,
        user_id: session.user_id,
        entry_type: 'ai_letter',
        title: `Follow-up letter to ${dispute.provider_name}`,
        content: letterText,
        entry_date: new Date().toISOString(),
      });

      await ctx.api.sendMessage(
        chatId,
        `✅ *Follow-up letter saved to your Disputes*\n\nHere's your chaser — copy and send to ${dispute.provider_name}:`,
        { parse_mode: 'Markdown' },
      );

      const MAX_CHUNK = 4000;
      let pos = 0;
      while (pos < letterText.length) {
        let end = Math.min(pos + MAX_CHUNK, letterText.length);
        if (end < letterText.length) {
          const nl = letterText.lastIndexOf('\n', end);
          if (nl > pos + MAX_CHUNK / 2) end = nl + 1;
        }
        await ctx.api.sendMessage(chatId, letterText.slice(pos, end));
        pos = end;
      }
    } catch (err) {
      console.error('[UserBot] dispute_followup:draft error:', err);
      await ctx.api.sendMessage(
        chatId,
        `Sorry, I couldn't generate the letter right now. Try asking me: "Draft a follow-up letter to ${dispute.provider_name}"`,
      );
    }
  });

  // -------------------------------------------------------
  // Callback: dispute_followup:snooze:{disputeId}
  // Suppress follow-up reminders for this dispute for 7 days.
  // -------------------------------------------------------
  bot.callbackQuery(/^dispute_followup:snooze:(.+)$/, async (ctx) => {
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const snoozeLabel = snoozeUntil.toLocaleDateString('en-GB');
    await ctx.answerCallbackQuery({ text: `Snoozed until ${snoozeLabel}` });
    const disputeId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId  = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;

    const supabase = getAdmin();
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();
    if (!session) return;

    try {
      await supabase.from('user_notification_snoozes').upsert(
        {
          user_id:       session.user_id,
          snooze_type:   'dispute_followup',
          reference_key: disputeId,
          snoozed_until: snoozeUntil.toISOString(),
        },
        { onConflict: 'user_id,snooze_type,reference_key' },
      );
      await safeEdit(bot.api, chatId, msgId, `⏰ Follow-up reminders for this dispute snoozed until ${snoozeLabel}. I'll remind you again then.`);
    } catch (err) {
      console.error('[UserBot] dispute_followup:snooze error:', err);
    }
  });

  // -------------------------------------------------------
  // Callback: dispute_followup:view:{disputeId}
  // Send the dashboard link for this dispute.
  // -------------------------------------------------------
  bot.callbackQuery(/^dispute_followup:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const disputeId = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    if (!chatId) return;

    const url = `https://paybacker.co.uk/dashboard/complaints?id=${disputeId}`;
    await ctx.api.sendMessage(chatId, `🔗 [View your dispute on Paybacker](${url})`, { parse_mode: 'Markdown' });
  });

  // -------------------------------------------------------
  // Callback: price_action:ack:{merchantNorm}
  // User confirms the price increase looks correct — log so cron won't re-alert this month.
  // -------------------------------------------------------
  bot.callbackQuery(/^price_action:ack:(.*)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Got it — noted ✅' });
    const merchantNorm = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId  = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;

    const supabase = getAdmin();
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();
    if (!session) return;
    const { user_id: userId } = session;

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
      // Log to notification_log to prevent re-alerting this month
      await supabase.from('notification_log').upsert(
        { user_id: userId, notification_type: 'price_increase', reference_key: `${merchantNorm}_${monthStr}` },
        { onConflict: 'user_id,notification_type,reference_key', ignoreDuplicates: true },
      );

      // Dismiss any active detected_issues matching this merchant
      if (merchantNorm) {
        const { data: issues } = await supabase
          .from('detected_issues')
          .select('id, title')
          .eq('user_id', userId)
          .eq('issue_type', 'price_increase')
          .eq('status', 'active');

        const searchTerm = merchantNorm.replace(/_/g, ' ').split(' ').filter(Boolean)[0] ?? '';
        const matchingIds = (issues ?? [])
          .filter(i => searchTerm && i.title.toLowerCase().includes(searchTerm))
          .map(i => i.id);

        if (matchingIds.length > 0) {
          await supabase.from('detected_issues').update({ status: 'dismissed' }).in('id', matchingIds);
        }

        // Dismiss matching pending alerts
        await supabase
          .from('telegram_pending_alerts')
          .update({ status: 'dismissed' })
          .eq('user_id', userId)
          .eq('alert_type', 'price_increase')
          .eq('status', 'pending')
          .ilike('reference_key', `%${merchantNorm}%`);
      }

      const displayName = merchantNorm.replace(/_/g, ' ').trim();
      const msg = displayName
        ? `✅ Got it — the ${displayName} price change looks correct. I won't alert you about this again this month.`
        : "✅ Got it — price increase acknowledged. I won't alert you about this again this month.";
      await safeEdit(bot.api, chatId, msgId, msg);
    } catch (err) {
      console.error('[UserBot] price_action:ack error:', err);
    }
  });

  // -------------------------------------------------------
  // Callback: price_action:snooze:{merchantNorm}
  // Suppress this merchant's price-increase alerts for 7 days.
  // -------------------------------------------------------
  bot.callbackQuery(/^price_action:snooze:(.*)$/, async (ctx) => {
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const snoozeLabel = snoozeUntil.toLocaleDateString('en-GB');
    await ctx.answerCallbackQuery({ text: `Snoozed until ${snoozeLabel}` });
    const merchantNorm = ctx.match[1];
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId  = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;

    const supabase = getAdmin();
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();
    if (!session) return;
    const { user_id: userId } = session;

    try {
      await supabase.from('user_notification_snoozes').upsert(
        {
          user_id:       userId,
          snooze_type:   'price_merchant',
          reference_key: merchantNorm,
          snoozed_until: snoozeUntil.toISOString(),
        },
        { onConflict: 'user_id,snooze_type,reference_key' },
      );

      if (merchantNorm) {
        // Snooze any active detected_issues for this merchant
        const { data: issues } = await supabase
          .from('detected_issues')
          .select('id, title')
          .eq('user_id', userId)
          .eq('issue_type', 'price_increase')
          .eq('status', 'active');

        const searchTerm = merchantNorm.replace(/_/g, ' ').split(' ').filter(Boolean)[0] ?? '';
        const matchingIds = (issues ?? [])
          .filter(i => searchTerm && i.title.toLowerCase().includes(searchTerm))
          .map(i => i.id);

        if (matchingIds.length > 0) {
          await supabase.from('detected_issues')
            .update({ status: 'snoozed', snooze_until: snoozeUntil.toISOString() })
            .in('id', matchingIds);
        }

        // Suppress matching pending alerts
        await supabase
          .from('telegram_pending_alerts')
          .update({ status: 'dismissed' })
          .eq('user_id', userId)
          .eq('alert_type', 'price_increase')
          .eq('status', 'pending')
          .ilike('reference_key', `%${merchantNorm}%`);
      }

      const displayName = merchantNorm.replace(/_/g, ' ').trim();
      const msg = displayName
        ? `⏰ ${displayName} price alerts snoozed until ${snoozeLabel}. I'll remind you again then.`
        : `⏰ Price alerts snoozed until ${snoozeLabel}.`;
      await safeEdit(bot.api, chatId, msgId, msg);
    } catch (err) {
      console.error('[UserBot] price_action:snooze error:', err);
    }
  });

  // -------------------------------------------------------
  // Callback: budget_snooze:7d
  // Suppress all budget-overspend alerts for 7 days.
  // -------------------------------------------------------
  bot.callbackQuery('budget_snooze:7d', async (ctx) => {
    const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const snoozeLabel = snoozeUntil.toLocaleDateString('en-GB');
    await ctx.answerCallbackQuery({ text: `Budget alerts snoozed until ${snoozeLabel}` });
    const chatId = ctx.update.callback_query?.message?.chat?.id;
    const msgId  = ctx.update.callback_query?.message?.message_id;
    if (!chatId) return;

    const supabase = getAdmin();
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single();
    if (!session) return;

    try {
      await supabase.from('user_notification_snoozes').upsert(
        {
          user_id:       session.user_id,
          snooze_type:   'budget_alerts',
          reference_key: 'all',
          snoozed_until: snoozeUntil.toISOString(),
        },
        { onConflict: 'user_id,snooze_type,reference_key' },
      );
      await safeEdit(bot.api, chatId, msgId, `⏰ Budget alerts snoozed until ${snoozeLabel}. I'll resume them then.`);
    } catch (err) {
      console.error('[UserBot] budget_snooze:7d error:', err);
    }
  });

  // -------------------------------------------------------
  // Global callback_query fallback
  // Any callback_query that didn't match an earlier handler ends up here.
  // Answering it is critical — without this, Telegram shows a loading spinner forever.
  // -------------------------------------------------------
  bot.on('callback_query', async (ctx) => {
    console.warn(`[UserBot] Unhandled callback_query data="${ctx.callbackQuery?.data}" — answering to stop spinner`);
    try {
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error('[UserBot] Failed to answer unhandled callback_query:', err);
    }
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
    const startTime = Date.now();
    console.log(`[UserBot] Received message from chat_id=${chatId}, update_id=${updateId}, text="${userMessage.slice(0, 50)}"`);

    // Run inbound log + session lookup in parallel (saves ~200ms)
    const [logResult, sessionResult] = await Promise.all([
      supabase
        .from('telegram_message_log')
        .insert({ telegram_chat_id: chatId, direction: 'inbound', message_text: userMessage })
        .select('id')
        .single(),
      supabase
        .from('telegram_sessions')
        .select('user_id, last_message_at')
        .eq('telegram_chat_id', chatId)
        .eq('is_active', true)
        .single(),
    ]);

    const earlyLog = logResult.data;
    const session = sessionResult.data;
    if (sessionResult.error && sessionResult.error.code !== 'PGRST116') {
      console.error('[UserBot] Session lookup error:', sessionResult.error);
    }

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

    // Verify Pro subscription + check rate limit in parallel
    const [profileResult, rateLimitResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('subscription_tier, subscription_status, stripe_subscription_id')
        .eq('id', session.user_id)
        .single(),
      checkRateLimit(supabase, session.user_id),
    ]);

    if (profileResult.error) {
      console.error('[UserBot] Profile lookup error:', profileResult.error);
    }
    const profile = profileResult.data;

    const tier = profile?.subscription_tier;
    const status = profile?.subscription_status;
    const hasStripe = !!profile?.stripe_subscription_id;
    const isPro =
      tier === 'pro' &&
      (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing');

    if (!isPro) {
      const chatUpgradeKeyboard = new InlineKeyboard().url('Upgrade to Pro →', 'https://paybacker.co.uk/dashboard/upgrade');
      return ctx.reply(
        `To unlock Pocket Agent, upgrade to *Pro*.\n\n` +
          `Pro gives you real-time access to your spending, budgets, subscriptions, and disputes — plus AI-drafted complaint letters and proactive bill alerts — all for *£9.99/month*.`,
        { parse_mode: 'Markdown', reply_markup: chatUpgradeKeyboard },
      );
    }

    if (!rateLimitResult) {
      return ctx.reply(
        `You've reached the limit of ${RATE_LIMIT_PER_HOUR} messages per hour. Please try again shortly.`,
      );
    }

    // Non-critical updates — fire in background (these are fine to fire-and-forget
    // because the webhook route now awaits the full handler)
    supabase
      .from('telegram_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('telegram_chat_id', chatId)
      .then(() => {});

    if (earlyLog?.id) {
      supabase
        .from('telegram_message_log')
        .update({ user_id: session.user_id })
        .eq('id', earlyLog.id)
        .then(() => {});
    }

    // Show typing indicator immediately, then repeat every 4s while Claude processes
    await ctx.replyWithChatAction('typing').catch(() => {});
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 4000);

    try {
      // Wrap Claude call in a 250s timeout — Vercel kills at 300s, so we need margin
      const CLAUDE_TIMEOUT_MS = 250_000;
      const claudePromise = callClaudeWithTools(session.user_id, userMessage, chatId);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT: Claude processing exceeded 250s')), CLAUDE_TIMEOUT_MS)
      );
      const { text, pendingAction } = await Promise.race([claudePromise, timeoutPromise]);

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
    } catch (error: any) {
      console.error('[UserBot] Error processing message:', error);
      const isTimeout = error?.message?.includes('TIMEOUT');
      const userMsg = isTimeout
        ? 'That request took too long to process — it may have involved a lot of data. Could you try asking for something more specific?'
        : 'Sorry, I ran into an issue. Please try again in a moment.';
      try {
        await ctx.reply(userMsg);
      } catch (replyErr) {
        console.error('[UserBot] Failed to send error reply:', replyErr);
      }
    } finally {
      clearInterval(typingInterval);
    }
  });

  // -------------------------------------------------------
  // Global error handler — catches any uncaught middleware error
  // Uses raw chatId from the update (not ctx.chatId shorthand) so it works
  // in ALL update types including callback_query where ctx.chat may differ.
  // -------------------------------------------------------
  bot.catch(async (err) => {
    const ctx = err.ctx;
    console.error(`[UserBot] Uncaught middleware error (update_id=${ctx.update.update_id}):`, err.error);

    // Also: if this was a callback_query, make sure the spinner is stopped
    if (ctx.update.callback_query) {
      try {
        await ctx.api.answerCallbackQuery(ctx.update.callback_query.id);
      } catch { /* already answered, or query expired */ }
    }

    // Extract chatId from raw update — more reliable than ctx.chatId in error context
    const chatId =
      ctx.update.callback_query?.message?.chat?.id ??
      ctx.update.message?.chat?.id ??
      ctx.update.edited_message?.chat?.id;

    if (chatId) {
      try {
        await ctx.api.sendMessage(chatId, 'Sorry, something went wrong on my end. Please try again in a moment.');
      } catch (replyErr) {
        console.error('[UserBot] Failed to send error reply in bot.catch:', replyErr);
      }
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
    merchantNorm?: string;
    disputeId?: string;
  };
  showFollowUpButtons?: boolean;
}): Promise<{ messageId?: number; ok: boolean }> {
  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return { ok: false };

  const { chatId, issue, showFollowUpButtons } = params;
  const TELEGRAM_API = `https://api.telegram.org/bot${token}`;

  let text = `*${issue.title}*\n\n${issue.detail}`;
  if (issue.amount_impact && issue.amount_impact > 0) {
    text += `\n\n💰 *Annual impact: £${Number(issue.amount_impact).toFixed(2)}*`;
  }

  // Build inline keyboard — action buttons vary by issue type
  let replyMarkup: object;

  if (showFollowUpButtons) {
    const dId = issue.disputeId;
    replyMarkup = dId
      ? {
          inline_keyboard: [
            [
              { text: 'Draft Follow-up ✍️', callback_data: `dispute_followup:draft:${dId}` },
              { text: 'Yes, resolved ✅',   callback_data: `confirm_saving_${issue.id}` },
            ],
            [
              { text: 'Snooze 7 days ⏰',  callback_data: `dispute_followup:snooze:${dId}` },
              { text: 'View Dispute →',    callback_data: `dispute_followup:view:${dId}` },
            ],
          ],
        }
      : {
          // Legacy path: no dispute ID — show generic resolution buttons
          inline_keyboard: [
            [
              { text: 'Yes, resolved ✅', callback_data: `confirm_saving_${issue.id}` },
              { text: 'Not yet — snooze', callback_data: `snooze_${issue.id}` },
            ],
            [{ text: 'Dismiss', callback_data: `dismiss_${issue.id}` }],
          ],
        };
  } else if (issue.issue_type === 'price_increase') {
    const mNorm = (issue.merchantNorm ?? '').slice(0, 48);
    replyMarkup = mNorm
      ? {
          inline_keyboard: [
            [
              { text: 'Raise Dispute 🔴', callback_data: `draft_dispute_${issue.id}` },
              { text: 'Looks right ✅',   callback_data: `price_action:ack:${mNorm}` },
            ],
            [{ text: 'Snooze 7 days ⏰', callback_data: `price_action:snooze:${mNorm}` }],
          ],
        }
      : {
          inline_keyboard: [
            [
              { text: 'Raise Dispute 🔴', callback_data: `draft_dispute_${issue.id}` },
              { text: '🔕 Dismiss',        callback_data: `dismiss_${issue.id}` },
            ],
          ],
        };
  } else if (issue.issue_type === 'contract_expiring') {
    replyMarkup = {
      inline_keyboard: [
        [{ text: '📧 Cancellation email', callback_data: `cxlmail_${issue.id}` }],
        [{ text: '🔕 Dismiss', callback_data: `dismiss_${issue.id}` }],
      ],
    };
  } else if (issue.issue_type === 'renewal_imminent') {
    replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Already paid',      callback_data: `dismiss_${issue.id}` },
          { text: '📧 Cancellation email', callback_data: `cxlmail_${issue.id}` },
        ],
        [{ text: '🔕 Dismiss', callback_data: `dismiss_${issue.id}` }],
      ],
    };
  } else {
    // budget_overrun, unused_subscription, etc.
    const rows: Array<Array<{ text: string; callback_data: string }>> = [
      [
        { text: 'Snooze 7 days', callback_data: `snooze_${issue.id}` },
        { text: '🔕 Dismiss',    callback_data: `dismiss_${issue.id}` },
      ],
    ];
    if (issue.issue_type === 'budget_overrun') {
      rows.push([{ text: 'Snooze budget alerts 7 days ⏰', callback_data: 'budget_snooze:7d' }]);
    }
    replyMarkup = { inline_keyboard: rows };
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
