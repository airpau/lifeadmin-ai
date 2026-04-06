import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

/**
 * Called after Railway agents finish running.
 * Pulls their fresh reports, consolidates via Claude, sends to Telegram.
 *
 * POST body: { chatId, question, agentRoles }
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { chatId, question, agentRoles } = await request.json();
  if (!chatId || !agentRoles?.length) {
    return NextResponse.json({ error: 'chatId and agentRoles required' }, { status: 400 });
  }

  const supabase = getAdmin();

  // Wait for Railway agents to finish their runs
  await new Promise(resolve => setTimeout(resolve, 25000));

  // Pull latest reports from the agents that just ran
  const { data: reports } = await supabase
    .from('executive_reports')
    .select('title, content, recommendations, created_at')
    .order('created_at', { ascending: false })
    .limit(agentRoles.length * 2);

  const reportContext = (reports || []).map(r =>
    `${r.title} (${new Date(r.created_at).toLocaleString('en-GB')}):\n${r.content?.substring(0, 2000) || ''}\nRecommendations: ${Array.isArray(r.recommendations) ? r.recommendations.slice(0, 5).join('; ') : ''}`
  ).join('\n\n---\n\n');

  // Also get business log for context
  const { data: businessLog } = await supabase
    .from('business_log')
    .select('category, title, content')
    .order('created_at', { ascending: false })
    .limit(15);

  const logContext = (businessLog || []).map((l: any) => `[${l.category}] ${l.title}: ${l.content}`).join('\n');

  // Consolidate via Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: `You are Charlie, Executive Assistant at Paybacker. You just triggered the AI agents to run fresh analyses. Consolidate their reports into a clear, actionable briefing for Paul (the founder).

Rules:
- Be concise but thorough. Use specific numbers.
- Group by domain (Revenue, Marketing, Support, etc.)
- End with a clear prioritised action list
- Never use em dashes
- Use Markdown formatting

Business log (current state):
${logContext}`,
    messages: [{
      role: 'user',
      content: `${question || 'Give me a full team update.'}\n\nHere are the fresh agent reports:\n\n${reportContext || 'No reports available yet.'}`,
    }],
  });

  const reply = response.content.find(b => b.type === 'text');
  if (reply?.type === 'text') {
    // Save to conversation history
    await supabase.from('telegram_messages').insert({ chat_id: chatId, role: 'assistant', content: reply.text });
    await sendTelegram(chatId, reply.text);
  }

  return NextResponse.json({ ok: true });
}
