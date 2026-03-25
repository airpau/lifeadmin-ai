import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const ALLOWED_CHAT_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(Number) || [];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function sendTelegram(chatId: number, text: string) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
  }
}

async function getConversationHistory(supabase: ReturnType<typeof getAdmin>, chatId: number) {
  const { data } = await supabase
    .from('telegram_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data || []).reverse().map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

async function saveMessage(supabase: ReturnType<typeof getAdmin>, chatId: number, role: string, content: string) {
  await supabase.from('telegram_messages').insert({ chat_id: chatId, role, content });
}

async function getFullBusinessContext(supabase: ReturnType<typeof getAdmin>): Promise<string> {
  const [profiles, tickets, reports, subs, agentMemories, recentTasks] = await Promise.all([
    supabase.from('profiles').select('id, email, subscription_tier, created_at, founding_member')
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('support_tickets').select('ticket_number, subject, status, created_at')
      .in('status', ['open', 'in_progress', 'awaiting_reply'])
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('executive_reports').select('title, content, recommendations, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('agent_memory').select('agent_role, key, value, created_at')
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('title, type, status, provider_name, created_at')
      .order('created_at', { ascending: false }).limit(10),
  ]);

  // User stats
  const allUsers = subs.data || [];
  const tiers: Record<string, number> = {};
  allUsers.forEach(u => { tiers[u.subscription_tier || 'free'] = (tiers[u.subscription_tier || 'free'] || 0) + 1; });
  let mrr = 0;
  allUsers.forEach(u => {
    if (u.subscription_tier === 'essential') mrr += 4.99;
    if (u.subscription_tier === 'pro') mrr += 9.99;
  });

  // Recent users
  const recentUsers = (profiles.data || []).slice(0, 10).map(p =>
    `  ${p.email} - ${p.subscription_tier}${p.founding_member ? ' (founding)' : ''} - joined ${new Date(p.created_at).toLocaleDateString('en-GB')}`
  ).join('\n');

  // Open tickets
  const ticketList = (tickets.data || []).map(t =>
    `  ${t.ticket_number}: ${t.subject} [${t.status}]`
  ).join('\n') || '  None';

  // Latest reports (summaries only)
  const reportList = (reports.data || []).map(r => {
    const recs = Array.isArray(r.recommendations) ? r.recommendations.slice(0, 3) : [];
    return `  ${r.title} (${new Date(r.created_at).toLocaleString('en-GB')})\n    ${recs.join('\n    ')}`;
  }).join('\n') || '  None';

  // Agent memories
  const memories = (agentMemories.data || []).map(m =>
    `  [${m.agent_role}] ${m.key}: ${typeof m.value === 'string' ? m.value.substring(0, 200) : JSON.stringify(m.value).substring(0, 200)}`
  ).join('\n') || '  None';

  // Recent tasks
  const taskList = (recentTasks.data || []).map(t =>
    `  ${t.type}: ${t.title}${t.provider_name ? ` (${t.provider_name})` : ''} [${t.status}]`
  ).join('\n') || '  None';

  return `BUSINESS DATA (live from database):

REVENUE:
  MRR: £${mrr.toFixed(2)} | ARR: £${(mrr * 12).toFixed(2)}
  Total users: ${allUsers.length}
  Breakdown: ${Object.entries(tiers).map(([t, c]) => `${t}: ${c}`).join(', ')}

RECENT USERS:
${recentUsers}

OPEN SUPPORT TICKETS:
${ticketList}

LATEST AGENT REPORTS:
${reportList}

AGENT MEMORIES (what agents have learned):
${memories}

RECENT TASKS:
${taskList}`;
}

const AGENT_NAMES: Record<string, string> = {
  alex: 'CFO', morgan: 'CTO', jamie: 'CAO', taylor: 'CMO',
  jordan: 'Head of Ads', casey: 'CCO', drew: 'CGO', pippa: 'CRO',
  leo: 'CLO', nico: 'CIO', bella: 'CXO', finn: 'CFraudO',
  sam: 'Support Lead', riley: 'Support Agent', charlie: 'Executive Assistant',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message?.text || !message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.from?.first_name || 'Paul';
    const supabase = getAdmin();

    console.log(`[telegram] chat_id: ${chatId} text: ${text.substring(0, 50)}`);

    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
      await sendTelegram(chatId, 'Sorry, this bot is restricted to the Paybacker team.');
      return NextResponse.json({ ok: true });
    }

    // Handle /start
    if (text === '/start') {
      await sendTelegram(chatId, `Hi ${firstName}! I'm Charlie, your Executive Assistant.\n\nI have full access to the business data and can talk to the other agents. Try:\n\n/status - Business snapshot\n/tickets - Open support tickets\n/reports - Latest agent reports\n/users - User stats\n/revenue - Revenue overview\n/agents - List all agents\n/ask [agent] [question] - Ask a specific agent\n/clear - Clear conversation history\n\nOr just chat naturally. I remember our conversation.`);
      console.log(`[telegram] SETUP: chat_id ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Handle /clear
    if (text === '/clear') {
      await supabase.from('telegram_messages').delete().eq('chat_id', chatId);
      await sendTelegram(chatId, 'Conversation history cleared.');
      return NextResponse.json({ ok: true });
    }

    // Handle /agents
    if (text === '/agents') {
      const list = Object.entries(AGENT_NAMES).map(([name, role]) => `  *${name}* - ${role}`).join('\n');
      await sendTelegram(chatId, `*AI Team*\n\n${list}\n\nUse /ask [name] [question] to talk to any agent.`);
      return NextResponse.json({ ok: true });
    }

    // Handle quick commands with data
    if (text === '/status' || text === '/tickets' || text === '/reports' || text === '/users' || text === '/revenue') {
      const context = await getFullBusinessContext(supabase);
      const section = {
        '/status': 'Give a brief business status summary',
        '/tickets': 'List the open support tickets',
        '/reports': 'Summarise the latest agent reports with key recommendations',
        '/users': 'Break down the user stats',
        '/revenue': 'Give the revenue breakdown',
      }[text] || 'Give a status update';

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `You are Charlie, Executive Assistant at Paybacker. Respond to Telegram commands concisely. Use Markdown formatting. Never use em dashes.\n\n${context}`,
        messages: [{ role: 'user', content: section }],
      });

      const reply = response.content.find(b => b.type === 'text');
      if (reply?.type === 'text') {
        await sendTelegram(chatId, reply.text);
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /ask [agent] [question]
    const askMatch = text.match(/^\/ask\s+(\w+)\s+(.+)$/i);
    if (askMatch) {
      const agentName = askMatch[1].toLowerCase();
      const question = askMatch[2];
      const agentRole = AGENT_NAMES[agentName];

      if (!agentRole) {
        await sendTelegram(chatId, `Unknown agent "${agentName}". Use /agents to see the list.`);
        return NextResponse.json({ ok: true });
      }

      // Get that agent's latest report and memories
      const [agentReports, agentMems] = await Promise.all([
        supabase.from('executive_reports').select('title, content, recommendations, created_at')
          .order('created_at', { ascending: false }).limit(3),
        supabase.from('agent_memory').select('key, value')
          .eq('agent_role', agentName === 'jordan' ? 'head_of_ads' : agentName === 'sam' ? 'support_lead' : agentName === 'riley' ? 'support_agent' : agentName === 'charlie' ? 'exec_assistant' : agentName)
          .order('created_at', { ascending: false }).limit(10),
      ]);

      const reportContext = (agentReports.data || []).map(r =>
        `Report: ${r.title}\n${r.content?.substring(0, 2000) || ''}\nRecommendations: ${Array.isArray(r.recommendations) ? r.recommendations.join('; ') : ''}`
      ).join('\n\n');

      const memContext = (agentMems.data || []).map(m =>
        `${m.key}: ${typeof m.value === 'string' ? m.value.substring(0, 300) : JSON.stringify(m.value).substring(0, 300)}`
      ).join('\n');

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `You are ${agentName.charAt(0).toUpperCase() + agentName.slice(1)}, the ${agentRole} at Paybacker LTD. The founder Paul is asking you a question via Telegram. Answer based on your knowledge and reports. Be concise, direct, and actionable. Never use em dashes.\n\nYour latest reports:\n${reportContext || 'No reports yet.'}\n\nYour memories:\n${memContext || 'No memories yet.'}`,
        messages: [{ role: 'user', content: question }],
      });

      const reply = response.content.find(b => b.type === 'text');
      if (reply?.type === 'text') {
        await saveMessage(supabase, chatId, 'user', `/ask ${agentName} ${question}`);
        await saveMessage(supabase, chatId, 'assistant', `[${agentName.toUpperCase()}] ${reply.text}`);
        await sendTelegram(chatId, `*${agentName.charAt(0).toUpperCase() + agentName.slice(1)} (${agentRole}):*\n\n${reply.text}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Free-form conversation with Charlie (with memory)
    const history = await getConversationHistory(supabase, chatId);
    const context = await getFullBusinessContext(supabase);

    // Save user message
    await saveMessage(supabase, chatId, 'user', text);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are Charlie, Executive Assistant at Paybacker LTD. You're chatting with Paul (the founder) via Telegram. You have persistent memory of the conversation and full access to business data.

Be concise and direct. Use Markdown for formatting. Never use em dashes.

You can reference what the other agents are doing based on their reports and memories. If Paul asks about a specific agent's work, use the data below. If he asks you to tell an agent something, note it as an action item.

The AI team: Alex (CFO), Morgan (CTO), Jamie (CAO), Taylor (CMO), Jordan (Head of Ads), Casey (CCO), Drew (CGO), Pippa (CRO), Leo (CLO), Nico (CIO), Bella (CXO), Finn (CFraudO), Sam (Support Lead), Riley (Support Agent).

Paul can use /ask [agent] [question] to talk directly to any agent.

${context}`,
      messages: [
        ...history,
        { role: 'user', content: text },
      ],
    });

    const reply = response.content.find(b => b.type === 'text');
    if (reply?.type === 'text') {
      await saveMessage(supabase, chatId, 'assistant', reply.text);
      await sendTelegram(chatId, reply.text);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[telegram] Error:', err.message);
    return NextResponse.json({ ok: true });
  }
}
