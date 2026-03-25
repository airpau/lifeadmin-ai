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

async function getLiveAgentData(supabase: ReturnType<typeof getAdmin>, agentName: string): Promise<string> {
  const now = new Date().toISOString();

  // Common data every agent needs
  const [profiles, tickets, reports, dealClicks, tasks] = await Promise.all([
    supabase.from('profiles').select('id, email, subscription_tier, created_at, founding_member, signup_source, onboarded_at, updated_at').order('created_at', { ascending: false }).limit(30),
    supabase.from('support_tickets').select('ticket_number, subject, status, priority, source, created_at, first_response_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('executive_reports').select('title, content, recommendations, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('deal_clicks').select('provider, category, clicked_at').order('clicked_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('title, type, status, provider_name, created_at').order('created_at', { ascending: false }).limit(15),
  ]);

  const allUsers = profiles.data || [];
  const tiers: Record<string, number> = {};
  allUsers.forEach(u => { tiers[u.subscription_tier || 'free'] = (tiers[u.subscription_tier || 'free'] || 0) + 1; });
  let mrr = 0;
  allUsers.forEach(u => {
    if (u.subscription_tier === 'essential') mrr += 4.99;
    if (u.subscription_tier === 'pro') mrr += 9.99;
  });

  let base = `LIVE DATA (queried ${now}):
Users: ${allUsers.length} total | ${Object.entries(tiers).map(([t, c]) => `${t}: ${c}`).join(', ')}
MRR: £${mrr.toFixed(2)} | ARR: £${(mrr * 12).toFixed(2)}
Open tickets: ${(tickets.data || []).filter(t => ['open', 'in_progress'].includes(t.status)).length}
Deal clicks (recent): ${(dealClicks.data || []).length}
Recent tasks: ${(tasks.data || []).length}\n\n`;

  // Agent-specific live data
  switch (agentName) {
    case 'alex': // CFO
      const foundingMembers = allUsers.filter(u => u.founding_member).length;
      const paidUsers = allUsers.filter(u => u.subscription_tier !== 'free');
      base += `FINANCIAL DATA:
Paid users: ${paidUsers.length}
Founding members (free Pro): ${foundingMembers}
Revenue per tier: Essential (${tiers['essential'] || 0} x £4.99 = £${((tiers['essential'] || 0) * 4.99).toFixed(2)}/mo), Pro (${tiers['pro'] || 0} x £9.99 = £${((tiers['pro'] || 0) * 9.99).toFixed(2)}/mo)
Recent signups:\n${allUsers.slice(0, 10).map(u => `  ${u.email} - ${u.subscription_tier} - ${new Date(u.created_at).toLocaleDateString('en-GB')} - source: ${u.signup_source || 'unknown'}`).join('\n')}`;
      break;

    case 'morgan': // CTO
      const { data: agentRuns } = await supabase.from('agent_run_audit').select('agent_role, tool_name, created_at').order('created_at', { ascending: false }).limit(30);
      base += `TECH DATA:
Recent agent runs: ${(agentRuns || []).length}
Agent activity: ${[...new Set((agentRuns || []).map(r => r.agent_role))].join(', ') || 'none'}
Recent reports:\n${(reports.data || []).map(r => `  ${r.title}`).join('\n')}`;
      break;

    case 'jamie': // CAO
      base += `OPERATIONS DATA:
Onboarding rate: ${allUsers.filter(u => u.onboarded_at).length}/${allUsers.length} users onboarded
Signup sources: ${[...new Set(allUsers.map(u => u.signup_source).filter(Boolean))].join(', ') || 'unknown'}
Recent users:\n${allUsers.slice(0, 10).map(u => `  ${u.email} - ${u.subscription_tier} - source: ${u.signup_source || 'organic'} - ${new Date(u.created_at).toLocaleDateString('en-GB')}`).join('\n')}`;
      break;

    case 'taylor': // CMO
      base += `MARKETING DATA:
Signup sources: ${allUsers.reduce((acc: Record<string, number>, u) => { acc[u.signup_source || 'organic'] = (acc[u.signup_source || 'organic'] || 0) + 1; return acc; }, {} as Record<string, number>)}
Deal clicks by category: ${(dealClicks.data || []).reduce((acc: Record<string, number>, d) => { acc[d.category || 'unknown'] = (acc[d.category || 'unknown'] || 0) + 1; return acc; }, {} as Record<string, number>)}
Blog posts published: check blog_posts table`;
      // Fix the objects to strings
      const sources = allUsers.reduce((acc: Record<string, number>, u) => { acc[u.signup_source || 'organic'] = (acc[u.signup_source || 'organic'] || 0) + 1; return acc; }, {});
      const clickCats = (dealClicks.data || []).reduce((acc: Record<string, number>, d) => { acc[d.category || 'unknown'] = (acc[d.category || 'unknown'] || 0) + 1; return acc; }, {});
      base = base.replace(/Signup sources: \[object Object\]/, `Signup sources: ${Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      base = base.replace(/Deal clicks by category: \[object Object\]/, `Deal clicks by category: ${Object.entries(clickCats).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      break;

    case 'jordan': // Head of Ads
      base += `ADVERTISING DATA:
Google Ads campaign: 23678309004 (running)
Deal clicks:\n${(dealClicks.data || []).map(d => `  ${d.provider} (${d.category}) - ${new Date(d.clicked_at).toLocaleDateString('en-GB')}`).join('\n') || '  None'}
Signups from ads: ${allUsers.filter(u => u.signup_source === 'google_ads').length}
Signups from awin: ${allUsers.filter(u => u.signup_source === 'awin').length}`;
      break;

    case 'sam': // Support Lead
    case 'riley': // Support Agent
      base += `SUPPORT DATA:
All tickets:\n${(tickets.data || []).map(t => `  ${t.ticket_number}: ${t.subject} [${t.status}] (${t.source}) - ${new Date(t.created_at).toLocaleDateString('en-GB')}${t.first_response_at ? ' - responded' : ' - NO RESPONSE'}`).join('\n') || '  None'}`;
      break;

    default:
      base += `GENERAL DATA:
Recent reports:\n${(reports.data || []).map(r => `  ${r.title} (${new Date(r.created_at).toLocaleString('en-GB')})\n  Recs: ${Array.isArray(r.recommendations) ? r.recommendations.slice(0, 3).join('; ') : 'none'}`).join('\n')}
Recent tasks:\n${(tasks.data || []).map(t => `  ${t.type}: ${t.title} [${t.status}]`).join('\n')}`;
  }

  return base;
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
      const sectionMap: Record<string, string> = {
        '/status': 'Give a brief business status summary',
        '/tickets': 'List the open support tickets',
        '/reports': 'Summarise the latest agent reports with key recommendations',
        '/users': 'Break down the user stats',
        '/revenue': 'Give the revenue breakdown',
      };
      const section = sectionMap[text] || 'Give a status update';

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

    // Handle /ask [agent] [question] - runs a LIVE agent query
    const askMatch = text.match(/^\/ask\s+(\w+)\s+(.+)$/i);
    if (askMatch) {
      const agentName = askMatch[1].toLowerCase();
      const question = askMatch[2];
      const agentRole = AGENT_NAMES[agentName];

      if (!agentRole) {
        await sendTelegram(chatId, `Unknown agent "${agentName}". Use /agents to see the list.`);
        return NextResponse.json({ ok: true });
      }

      await sendTelegram(chatId, `_Asking ${agentName.charAt(0).toUpperCase() + agentName.slice(1)}..._`);

      const liveData = await getLiveAgentData(supabase, agentName);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `You are ${agentName.charAt(0).toUpperCase() + agentName.slice(1)}, the ${agentRole} at Paybacker LTD. The founder Paul is asking you a direct question via Telegram.

IMPORTANT: You have LIVE data from the database below. Analyse it and give a fresh, specific answer. Do not say you need to check anything. You have everything you need right now. Be concise, use numbers, and be actionable. Never use em dashes.

${liveData}`,
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

    // Detect if asking about agents or wanting a team update
    const lowerText = text.toLowerCase();
    const wantsTeamUpdate = lowerText.includes('all agents') || lowerText.includes('team update') || lowerText.includes('the agents') || lowerText.includes('everyone') || lowerText.includes('full update');
    const mentionedAgents = wantsTeamUpdate
      ? [['alex'], ['morgan'], ['jamie'], ['taylor'], ['jordan'], ['sam']] // Key agents for team update
      : Object.entries(AGENT_NAMES).filter(([name]) => lowerText.includes(name));

    let agentContext = '';
    if (mentionedAgents.length > 0) {
      // Load data for mentioned agents (or key agents for team update)
      const agentDataPromises = mentionedAgents.map(([name]) => getLiveAgentData(supabase, name));
      const agentDataResults = await Promise.all(agentDataPromises);
      agentContext = agentDataResults.map(d => `\n\n${d}`).join('');
    }

    // Save user message
    await saveMessage(supabase, chatId, 'user', text);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are Charlie, Executive Assistant at Paybacker LTD. You're chatting with Paul (the founder) via Telegram. You have persistent memory of the conversation and full access to business data.

CRITICAL RULES:
- You have LIVE data from the database loaded below. This is real-time, not cached.
- NEVER say "I'll check with them", "let me ask them", "waiting for responses", or "pulling updates now". You already HAVE the data. Just answer.
- NEVER write /ask commands in your responses. You cannot execute commands. Just use the data below.
- NEVER pretend to be contacting other agents. You ARE the central hub with all the data already loaded.
- If Paul asks "what does Alex think" or "ask the agents", just analyse the financial/marketing/support data below and give the answer AS IF you are that agent. You have their data.
- Be concise and direct. Use Markdown for formatting. Never use em dashes.
- When asked for a team update, go through each relevant agent's domain and summarise based on the live data, not by pretending to message them.

The AI team: Alex (CFO), Morgan (CTO), Jamie (CAO), Taylor (CMO), Jordan (Head of Ads), Casey (CCO), Drew (CGO), Pippa (CRO), Leo (CLO), Nico (CIO), Bella (CXO), Finn (CFraudO), Sam (Support Lead), Riley (Support Agent).

${context}${agentContext}`,
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
