import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PRODUCT_CONTEXT, SOCIAL_RULES } from '@/lib/product-context';

export const runtime = 'nodejs';
export const maxDuration = 30;

const API = 'https://graph.facebook.com/v25.0';
const PAGE_ID = '1056645287525328';

/**
 * Fast DM responder - runs every minute, ONLY checks for unanswered DMs.
 * Separate from the full social-engagement cron for speed.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) return NextResponse.json({ ok: true, skipped: 'no token' });

  // Get page token
  const ptRes = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const ptData = await ptRes.json();
  const pageToken = ptData.access_token || systemToken;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: any[] = [];

  try {
    // Get recent conversations
    const convsRes = await fetch(`${API}/me/conversations?fields=participants,updated_time&platform=messenger&limit=3&access_token=${pageToken}`);
    const convsData = await convsRes.json();

    for (const conv of convsData.data || []) {
      // Only check conversations updated in last 5 minutes
      const age = Date.now() - new Date(conv.updated_time).getTime();
      if (age > 5 * 60 * 1000) continue;

      // Get sender PSID
      const sender = (conv.participants?.data || []).find((p: any) => p.id !== PAGE_ID);
      if (!sender) continue;

      // Get messages
      const msgsRes = await fetch(`${API}/${conv.id}/messages?fields=message,from,created_time&limit=10&access_token=${pageToken}`);
      const msgsData = await msgsRes.json();
      const messages = (msgsData.data || []).reverse();
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];
      // Skip if we already replied
      if (lastMsg.from?.id === PAGE_ID) continue;

      // Build conversation history
      const chatHistory = messages
        .filter((m: any) => m.message)
        .map((m: any) => ({
          role: m.from?.id === PAGE_ID ? 'assistant' as const : 'user' as const,
          content: m.message,
        }));

      // Generate reply
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You are chatting with someone on Facebook Messenger for Paybacker. Be natural, friendly, and helpful. This is a real conversation.

${PRODUCT_CONTEXT}

${SOCIAL_RULES}`,
        messages: chatHistory,
      });

      const reply = aiRes.content.find(b => b.type === 'text');
      if (!reply || reply.type !== 'text' || reply.text.trim() === 'SKIP') continue;

      // Send reply
      const sendRes = await fetch(`${API}/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: sender.id },
          message: { text: reply.text },
          messaging_type: 'RESPONSE',
          access_token: pageToken,
        }),
      });
      const sendData = await sendRes.json();
      results.push({
        to: sender.name,
        reply: reply.text.substring(0, 50),
        success: !sendData.error,
      });
    }
  } catch (err: any) {
    results.push({ error: err.message });
  }

  return NextResponse.json({ ok: true, replied: results.length, results });
}
