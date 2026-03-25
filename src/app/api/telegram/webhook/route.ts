import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Only allow the founder's Telegram chat ID (set after first message)
const ALLOWED_CHAT_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(Number) || [];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function sendTelegram(chatId: number, text: string) {
  // Telegram max message length is 4096
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
  }
}

async function getBusinessContext(): Promise<string> {
  const supabase = getAdmin();

  const [profiles, tickets, reports, subs] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('support_tickets').select('id, status', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('executive_reports').select('agent_id, title, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('profiles').select('subscription_tier').not('subscription_tier', 'eq', 'free'),
  ]);

  const totalUsers = profiles.count || 0;
  const openTickets = tickets.count || 0;
  const paidUsers = (subs.data || []).length;
  const recentReports = (reports.data || []).map(r => `- ${r.title} (${new Date(r.created_at).toLocaleString('en-GB')})`).join('\n');

  return `Current business snapshot:
- Total users: ${totalUsers}
- Paid subscribers: ${paidUsers}
- Open support tickets: ${openTickets}
- Recent agent reports:
${recentReports || '  No recent reports'}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message?.text || !message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.from?.first_name || 'Boss';

    // Log chat ID for setup (remove after configuring ALLOWED_CHAT_IDS)
    console.log(`[telegram] Message from chat_id: ${chatId} user: ${firstName} text: ${text.substring(0, 50)}`);

    // If ALLOWED_CHAT_IDS is set, restrict access
    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
      await sendTelegram(chatId, 'Sorry, this bot is restricted to the Paybacker team.');
      return NextResponse.json({ ok: true });
    }

    // Handle commands
    if (text === '/start') {
      await sendTelegram(chatId, `Hi ${firstName}! I'm Charlie, your Paybacker Executive Assistant.\n\nI can help you with:\n- /status - Business snapshot\n- /tickets - Open support tickets\n- /reports - Latest agent reports\n- /users - User stats\n- /revenue - Revenue overview\n\nOr just ask me anything about the business.`);
      console.log(`[telegram] SETUP: Your chat_id is ${chatId} - add this to TELEGRAM_ALLOWED_CHAT_IDS env var`);
      return NextResponse.json({ ok: true });
    }

    if (text === '/status') {
      const context = await getBusinessContext();
      await sendTelegram(chatId, `*Paybacker Status*\n\n${context}`);
      return NextResponse.json({ ok: true });
    }

    if (text === '/tickets') {
      const supabase = getAdmin();
      const { data: tickets } = await supabase
        .from('support_tickets')
        .select('ticket_number, subject, status, created_at')
        .in('status', ['open', 'in_progress', 'awaiting_reply'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (!tickets?.length) {
        await sendTelegram(chatId, 'No open support tickets.');
      } else {
        const list = tickets.map(t =>
          `*${t.ticket_number}* - ${t.subject}\n  Status: ${t.status} | ${new Date(t.created_at).toLocaleDateString('en-GB')}`
        ).join('\n\n');
        await sendTelegram(chatId, `*Open Tickets*\n\n${list}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (text === '/reports') {
      const supabase = getAdmin();
      const { data: reports } = await supabase
        .from('executive_reports')
        .select('title, recommendations, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!reports?.length) {
        await sendTelegram(chatId, 'No recent agent reports.');
      } else {
        const list = reports.map(r => {
          const recs = Array.isArray(r.recommendations) ? r.recommendations.slice(0, 2).join('\n  - ') : '';
          return `*${r.title}*\n${new Date(r.created_at).toLocaleString('en-GB')}${recs ? `\n  - ${recs}` : ''}`;
        }).join('\n\n');
        await sendTelegram(chatId, `*Latest Reports*\n\n${list}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (text === '/users') {
      const supabase = getAdmin();
      const { data: users } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .order('created_at', { ascending: false });

      const tiers: Record<string, number> = {};
      (users || []).forEach(u => {
        tiers[u.subscription_tier || 'free'] = (tiers[u.subscription_tier || 'free'] || 0) + 1;
      });

      const total = users?.length || 0;
      const breakdown = Object.entries(tiers).map(([t, c]) => `  ${t}: ${c}`).join('\n');
      await sendTelegram(chatId, `*Users: ${total}*\n\n${breakdown}`);
      return NextResponse.json({ ok: true });
    }

    if (text === '/revenue') {
      const supabase = getAdmin();
      const { data: users } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .not('subscription_tier', 'eq', 'free');

      let mrr = 0;
      (users || []).forEach(u => {
        if (u.subscription_tier === 'essential') mrr += 4.99;
        if (u.subscription_tier === 'pro') mrr += 9.99;
      });

      await sendTelegram(chatId, `*Revenue*\n\nMRR: £${mrr.toFixed(2)}\nARR: £${(mrr * 12).toFixed(2)}\nPaid users: ${users?.length || 0}`);
      return NextResponse.json({ ok: true });
    }

    // Free-form question - use Claude to answer with business context
    const context = await getBusinessContext();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are Charlie, Executive Assistant at Paybacker LTD. You're chatting with Paul (the founder) via Telegram. Be concise, direct, and helpful. Use the business data provided to answer questions accurately. Never use em dashes.

${context}

Key facts:
- Paybacker is a UK consumer savings platform at paybacker.co.uk
- Pricing: Free (3 letters/mo), Essential (£4.99/mo), Pro (£9.99/mo)
- 15 AI agents running on Railway
- Awin affiliate integration live (59 deals)
- Google Ads running (campaign 23678309004)
- Founding member programme built (paused for Awin testing)`,
      messages: [{ role: 'user', content: text }],
    });

    const reply = response.content.find(b => b.type === 'text');
    if (reply && reply.type === 'text') {
      await sendTelegram(chatId, reply.text);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[telegram] Error:', err.message);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
