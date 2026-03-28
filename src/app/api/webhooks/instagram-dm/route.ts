import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { INSTAGRAM_KNOWLEDGE } from '@/lib/instagram-knowledge';

export const maxDuration = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * POST /api/webhooks/instagram-dm
 * Receives incoming DM data from ManyChat webhook.
 * Classifies intent, generates reply via Claude.
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = request.headers.get('x-webhook-secret') || request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const supabase = getAdmin();
  const body = await request.json();

  const messageText = body.message || body.text || body.last_input_text || '';
  const senderIgId = body.sender_id || body.ig_id || body.user_id || '';
  const senderName = body.name || body.first_name || body.username || '';

  if (!messageText) {
    return NextResponse.json({ error: 'No message text' }, { status: 400 });
  }

  // Rate limit: max 1 reply per sender per minute
  if (senderIgId) {
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const { count } = await supabase
      .from('instagram_dm_log')
      .select('id', { count: 'exact', head: true })
      .eq('sender_ig_id', senderIgId)
      .gte('created_at', oneMinAgo);

    if ((count || 0) > 0) {
      return NextResponse.json({ reply: '', skipped: true, reason: 'rate_limited' });
    }
  }

  // Generate reply via Claude
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `You are Paybacker's friendly Instagram assistant. Reply to DMs helpfully and conversationally. Keep replies under 200 words. Always end with a call to action pointing to paybacker.co.uk.

${INSTAGRAM_KNOWLEDGE}

Classify the user's intent as one of: pricing, support, feature_question, complaint, general.
Include the intent in your response as a hidden tag at the very start: [intent:pricing]

Do NOT use markdown formatting. Plain text only. Use line breaks for readability.`,
    messages: [{
      role: 'user',
      content: `Instagram DM from ${senderName || 'someone'}: "${messageText}"`,
    }],
  });

  const content = message.content[0];
  let reply = content.type === 'text' ? content.text : 'Thanks for your message! Check out paybacker.co.uk to learn more.';

  // Extract intent
  const intentMatch = reply.match(/\[intent:(\w+)\]/);
  const intent = intentMatch ? intentMatch[1] : 'general';
  reply = reply.replace(/\[intent:\w+\]\s*/g, '').trim();

  const responseTimeMs = Date.now() - startTime;

  // Log to database
  await supabase.from('instagram_dm_log').insert({
    sender_ig_id: senderIgId || null,
    sender_name: senderName || null,
    message_text: messageText,
    reply_text: reply,
    intent_detected: intent,
    response_time_ms: responseTimeMs,
  });

  return NextResponse.json({
    reply,
    intent,
    response_time_ms: responseTimeMs,
  });
}
