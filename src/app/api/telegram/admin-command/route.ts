import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const FOUNDER_CHAT_ID = Number(process.env.TELEGRAM_FOUNDER_CHAT_ID || '1003645878');

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_AGENTS_API_KEY });
}

async function sendTelegram(chatId: number, text: string): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    if (!res.ok) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      });
    }
  }
}

async function logToBusinessLog(
  supabase: ReturnType<typeof getAdmin>,
  title: string,
  content: string,
): Promise<void> {
  await supabase.from('business_log').insert({
    category: 'founder-command',
    title,
    content,
    created_by: 'founder-command',
  });
}

// Fetch support ticket data
async function getSupportData(supabase: ReturnType<typeof getAdmin>, query: string): Promise<string> {
  const [openTickets, recentTickets] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('ticket_number, subject, status, priority, created_at, first_response_at')
      .in('status', ['open', 'in_progress', 'awaiting_reply'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('support_tickets')
      .select('ticket_number, subject, status, priority, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const open = openTickets.data || [];
  const recent = recentTickets.data || [];

  const urgentTickets = open.filter(t => t.priority === 'urgent' || t.priority === 'high');

  // Try to match a specific ticket number if mentioned
  const ticketMatch = query.match(/TKT-\d+/i);
  let specificTicket = '';
  if (ticketMatch) {
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('*')
      .ilike('ticket_number', ticketMatch[0])
      .single();
    if (ticket) {
      specificTicket = `\nSPECIFIC TICKET ${ticket.ticket_number}:\n  Subject: ${ticket.subject}\n  Status: ${ticket.status}\n  Priority: ${ticket.priority || 'normal'}\n  Created: ${new Date(ticket.created_at).toLocaleString('en-GB')}\n  First response: ${ticket.first_response_at ? new Date(ticket.first_response_at).toLocaleString('en-GB') : 'none yet'}\n`;
    }
  }

  return `SUPPORT DATA:
Open tickets: ${open.length}
Urgent/High priority: ${urgentTickets.length}
${urgentTickets.length > 0 ? 'URGENT:\n' + urgentTickets.map(t => `  ${t.ticket_number}: ${t.subject} [${t.status}]`).join('\n') : ''}

ALL OPEN TICKETS:
${open.map(t => `  ${t.ticket_number}: ${t.subject} [${t.status}] (${t.priority || 'normal'})`).join('\n') || '  None'}

RECENT TICKETS (all statuses):
${recent.map(t => `  ${t.ticket_number}: ${t.subject} [${t.status}]`).join('\n') || '  None'}
${specificTicket}`;
}

// Fetch sprint/dev data
async function getSprintData(supabase: ReturnType<typeof getAdmin>): Promise<string> {
  const [tasks, businessLog, proposals] = await Promise.all([
    supabase
      .from('tasks')
      .select('title, type, status, provider_name, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('business_log')
      .select('category, title, content, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('improvement_proposals')
      .select('title, description, status, priority, created_at')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return `DEV/SPRINT DATA:
CURRENT TASKS:
${(tasks.data || []).map(t => `  [${t.status}] ${t.type}: ${t.title}${t.provider_name ? ` (${t.provider_name})` : ''}`).join('\n') || '  None'}

RECENT BUSINESS LOG:
${(businessLog.data || []).slice(0, 10).map(l => `  [${l.category.toUpperCase()}] ${l.title}: ${l.content.substring(0, 150)}`).join('\n') || '  None'}

PENDING PROPOSALS:
${(proposals.data || []).map(p => `  [${p.status}] ${p.title}: ${p.description?.substring(0, 100)}`).join('\n') || '  None'}`;
}

const PAPERCLIP_AGENTS = [
  { id: 'riley-support-agent', name: 'Riley (support-agent)', schedule: 'every 15 mins' },
  { id: 'heartbeat-monitor', name: 'Heartbeat Monitor', schedule: 'every 30 mins' },
  { id: 'dev-sprint-runner', name: 'Dev Sprint Runner', schedule: 'daily 10am' },
  { id: 'ceo-briefing', name: 'CEO Briefing', schedule: 'daily 7:30am' },
  { id: 'paperclip-business-monitor', name: 'Business Monitor', schedule: '3x daily (8am/1pm/6pm)' },
  { id: 'daily-social-media-post', name: 'Social Media Post', schedule: 'daily 9am' },
  { id: 'daily-morning-briefing', name: 'Morning Briefing', schedule: 'daily 8:30am' },
  { id: 'daily-ceo-report', name: 'CEO Report', schedule: 'daily 8am' },
  { id: 'obsidian-ideas-monitor', name: 'Obsidian Ideas Monitor', schedule: 'daily 9am' },
  { id: 'daily-receipt-scanner', name: 'Receipt Scanner', schedule: 'daily 8pm' },
];

// Fetch team status data
async function getTeamData(supabase: ReturnType<typeof getAdmin>): Promise<string> {
  const agentIds = PAPERCLIP_AGENTS.map(a => a.id);

  const [agentActivity, businessLog] = await Promise.all([
    supabase
      .from('business_log')
      .select('category, title, created_by, created_at')
      .in('created_by', agentIds)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('business_log')
      .select('category, title, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const activity = agentActivity.data || [];
  const now = Date.now();

  // Find last run time for each agent
  const statusLines = PAPERCLIP_AGENTS.map(agent => {
    const lastEntry = activity.find(l => l.created_by === agent.id);
    if (!lastEntry) return `  ${agent.name} [${agent.schedule}]: no recent activity`;
    const minsAgo = Math.round((now - new Date(lastEntry.created_at).getTime()) / 60000);
    const freshness = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;
    return `  ${agent.name} [${agent.schedule}]: last active ${freshness} — ${lastEntry.title}`;
  });

  return `PAPERCLIP TEAM STATUS:
ACTIVE AGENTS (${PAPERCLIP_AGENTS.length} total):
${statusLines.join('\n')}

RECENT ACTIVITY LOG:
${(businessLog.data || []).map(l => `  [${l.created_by || 'system'}] ${l.title}`).join('\n') || '  None'}`;
}

// Fetch general report data
async function getReportData(supabase: ReturnType<typeof getAdmin>): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  const [profiles, tickets, reports, businessLog, tasks] = await Promise.all([
    supabase.from('profiles').select('subscription_tier, created_at, founding_member'),
    supabase
      .from('support_tickets')
      .select('status, priority, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('executive_reports')
      .select('title, content, recommendations, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('business_log')
      .select('category, title, content, created_by, created_at')
      .gte('created_at', `${today}T00:00:00Z`)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('tasks')
      .select('type, status')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const allUsers = profiles.data || [];
  const tiers: Record<string, number> = {};
  allUsers.forEach(u => { tiers[u.subscription_tier || 'free'] = (tiers[u.subscription_tier || 'free'] || 0) + 1; });
  let mrr = 0;
  allUsers.forEach(u => {
    if (u.subscription_tier === 'essential') mrr += 4.99;
    if (u.subscription_tier === 'pro') mrr += 9.99;
  });
  const foundingMembers = allUsers.filter(u => u.founding_member).length;
  const allTickets = tickets.data || [];
  const openTickets = allTickets.filter(t => ['open', 'in_progress', 'awaiting_reply'].includes(t.status));
  const allTasks = tasks.data || [];
  const pendingTasks = allTasks.filter(t => t.status === 'pending');
  const doneTasks = allTasks.filter(t => t.status === 'completed' || t.status === 'done');

  return `REPORT DATA (as of ${new Date().toLocaleString('en-GB')}):

REVENUE:
  MRR: £${mrr.toFixed(2)} | ARR: £${(mrr * 12).toFixed(2)}
  Total users: ${allUsers.length}
  Tier breakdown: ${Object.entries(tiers).map(([t, c]) => `${t}: ${c}`).join(', ')}
  Founding members (free Pro): ${foundingMembers}

SUPPORT:
  Open tickets: ${openTickets.length}
  Urgent/high: ${openTickets.filter(t => t.priority === 'urgent' || t.priority === 'high').length}
  Total tickets today: ${allTickets.filter(t => t.created_at >= `${today}T00:00:00Z`).length}

TASKS:
  Pending: ${pendingTasks.length} | Completed: ${doneTasks.length}

TODAY'S ACTIVITY:
${(businessLog.data || []).map(l => `  [${l.category}] ${l.title}: ${l.content.substring(0, 120)}`).join('\n') || '  No activity logged today'}

LATEST AGENT REPORTS:
${(reports.data || []).map(r => {
    const recs = Array.isArray(r.recommendations) ? r.recommendations.slice(0, 2) : [];
    return `  ${r.title}\n${recs.map((rec: string) => `    - ${rec}`).join('\n')}`;
  }).join('\n') || '  None'}`;
}

// Route command to the right data fetcher and generate a Claude response
async function handleCommand(
  supabase: ReturnType<typeof getAdmin>,
  prefix: string,
  commandBody: string,
  rawText: string,
): Promise<string> {
  const anthropic = getAnthropic();

  let contextData = '';
  let systemRole = '';

  if (prefix === 'support') {
    contextData = await getSupportData(supabase, commandBody);
    systemRole = 'You are the Paybacker Support Command Centre. Riley (support-agent) runs every 15 mins to handle tickets automatically. Answer concisely about support tickets and operations using the live data. Use bullet points. Keep responses under 400 words.';
  } else if (prefix === 'sprint') {
    contextData = await getSprintData(supabase);
    systemRole = 'You are the Paybacker Dev Command Centre. The dev-sprint-runner agent picks up the highest-priority task daily at 10am and creates PRs. Answer concisely about development tasks, sprint progress, and tech status using the live data. Use bullet points. Keep responses under 400 words.';
  } else if (prefix === 'team') {
    contextData = await getTeamData(supabase);
    systemRole = 'You are the Paybacker Team Status Centre. Active Paperclip agents: Riley/support-agent (every 15m), heartbeat-monitor (every 30m), dev-sprint-runner (daily 10am), ceo-briefing (daily 7:30am), paperclip-business-monitor (3x daily), daily-social-media-post (9am), daily-morning-briefing (8:30am), daily-ceo-report (8am), obsidian-ideas-monitor (9am), daily-receipt-scanner (8pm). Answer concisely about agent status and recent activity using the live data. Use bullet points. Keep responses under 400 words.';
  } else if (prefix === 'report') {
    contextData = await getReportData(supabase);
    systemRole = 'You are the Paybacker Business Intelligence Centre. The ceo-briefing agent compiles overnight activity each morning and daily-ceo-report covers sprint burndown and deployment status. Answer concisely about business metrics, revenue, and daily reports using the live data. Use bullet points. Keep responses under 400 words.';
  } else {
    // General command — pull all contexts and let Claude figure it out
    const [support, sprint, team, report] = await Promise.all([
      getSupportData(supabase, rawText),
      getSprintData(supabase),
      getTeamData(supabase),
      getReportData(supabase),
    ]);
    contextData = [support, sprint, team, report].join('\n\n---\n\n');
    systemRole = 'You are the Paybacker AI Command Centre. Active Paperclip agents handle all autonomous operations: Riley/support-agent (tickets), heartbeat-monitor (platform health), dev-sprint-runner (code PRs), ceo-briefing (founder digest), paperclip-business-monitor (cross-agent checks), daily-social-media-post, daily-morning-briefing, daily-ceo-report, obsidian-ideas-monitor, daily-receipt-scanner. The founder has sent a command via Telegram. Understand the intent and answer using the live data provided. Be concise and actionable. Use bullet points. Keep responses under 500 words.';
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemRole,
    messages: [
      {
        role: 'user',
        content: `Founder command: "${rawText}"\n\nLive data:\n${contextData}`,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : 'No response generated.';
  return responseText;
}

function detectPrefix(text: string): { prefix: string; commandBody: string } {
  const normalised = text.trim().toLowerCase();

  if (normalised.startsWith('support:')) {
    return { prefix: 'support', commandBody: text.slice(text.indexOf(':') + 1).trim() };
  }
  if (normalised.startsWith('sprint:')) {
    return { prefix: 'sprint', commandBody: text.slice(text.indexOf(':') + 1).trim() };
  }
  if (normalised.startsWith('team:')) {
    return { prefix: 'team', commandBody: text.slice(text.indexOf(':') + 1).trim() };
  }
  if (normalised.startsWith('report:')) {
    return { prefix: 'report', commandBody: text.slice(text.indexOf(':') + 1).trim() };
  }

  return { prefix: 'general', commandBody: text.trim() };
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Extract message from Telegram update
  const message = body?.message || body?.edited_message;
  if (!message) {
    // Not a message update (could be callback query etc.) — ignore silently
    return NextResponse.json({ ok: true });
  }

  const chatId: number = message.chat?.id;
  const text: string = message.text || '';

  // Security: only process messages from the founder
  if (chatId !== FOUNDER_CHAT_ID) {
    return NextResponse.json({ ok: true }); // Silently reject
  }

  if (!text.trim()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getAdmin();
  const { prefix, commandBody } = detectPrefix(text);

  try {
    const response = await handleCommand(supabase, prefix, commandBody, text);

    // Format header based on prefix
    const prefixLabels: Record<string, string> = {
      support: '🎫 *Support Command*',
      sprint: '⚙️ *Sprint Command*',
      team: '👥 *Team Status*',
      report: '📊 *Report*',
      general: '🤖 *Paybacker Command Centre*',
    };
    const header = prefixLabels[prefix] || '🤖 *Paybacker Command Centre*';
    const fullResponse = `${header}\n\n${response}`;

    await Promise.all([
      sendTelegram(FOUNDER_CHAT_ID, fullResponse),
      logToBusinessLog(
        supabase,
        `Founder command [${prefix}]: ${commandBody.substring(0, 80)}`,
        `Command: "${text}"\nResponse: ${response.substring(0, 500)}`,
      ),
    ]);
  } catch (err) {
    console.error('[AdminCommand] Error processing command:', err);
    await sendTelegram(
      FOUNDER_CHAT_ID,
      `❌ Error processing command. Please try again or check the logs.`,
    );
  }

  // Always return 200 to Telegram so it doesn't retry
  return NextResponse.json({ ok: true });
}
