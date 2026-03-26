import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const API = 'https://graph.facebook.com/v25.0';
const PAGE_ID = '1056645287525328';
const VERIFY_TOKEN = 'paybacker_meta_webhook_2026';

// GET - Meta webhook verification (one-time setup)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST - Incoming webhook events (comments, messages)
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Always return 200 immediately so Meta doesn't retry
  // Process in background
  processWebhook(body).catch(err => console.error('[meta-webhook]', err.message));

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: any) {
  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) return;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Get page token
  const ptRes = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const ptData = await ptRes.json();
  const pageToken = ptData.access_token || systemToken;

  for (const entry of body.entry || []) {
    // === PAGE COMMENTS ===
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value?.item === 'comment') {
        const commentId = change.value.comment_id;
        const message = change.value.message;
        const senderId = change.value.sender_id;

        // Skip our own comments
        if (senderId === PAGE_ID) continue;

        // Generate reply
        const reply = await generateReply(anthropic, 'facebook_comment', message);
        if (!reply) continue;

        await fetch(`${API}/${commentId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply, access_token: pageToken }),
        });
        console.log(`[meta-webhook] Replied to FB comment: ${message?.substring(0, 30)}...`);
      }
    }

    // === PAGE MESSAGES (DMs) ===
    for (const msg of entry.messaging || []) {
      if (msg.message?.text && msg.sender?.id !== PAGE_ID) {
        const reply = await generateReply(anthropic, 'facebook_dm', msg.message.text);
        if (!reply) continue;

        await fetch(`${API}/me/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: msg.sender.id },
            message: { text: reply },
            access_token: pageToken,
          }),
        });
        console.log(`[meta-webhook] Replied to FB DM: ${msg.message.text?.substring(0, 30)}...`);
      }
    }

    // === INSTAGRAM COMMENTS ===
    for (const change of entry.changes || []) {
      if (change.field === 'comments') {
        const commentId = change.value?.id;
        const text = change.value?.text;

        if (!commentId || !text) continue;

        const reply = await generateReply(anthropic, 'instagram_comment', text);
        if (!reply) continue;

        await fetch(`${API}/${commentId}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply, access_token: systemToken }),
        });
        console.log(`[meta-webhook] Replied to IG comment: ${text?.substring(0, 30)}...`);
      }
    }

    // === INSTAGRAM DMs ===
    for (const msg of entry.messaging || []) {
      if (msg.message?.text && msg.recipient?.id === '17841440175351137') {
        const reply = await generateReply(anthropic, 'instagram_dm', msg.message.text);
        if (!reply) continue;

        await fetch(`${API}/me/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: msg.sender.id },
            message: { text: reply },
            access_token: systemToken,
          }),
        });
        console.log(`[meta-webhook] Replied to IG DM: ${msg.message.text?.substring(0, 30)}...`);
      }
    }
  }
}

async function generateReply(anthropic: Anthropic, type: string, message: string): Promise<string | null> {
  const prompts: Record<string, string> = {
    facebook_comment: 'You reply to Facebook comments for Paybacker. Be friendly, brief (1-2 sentences). British English. Never share internal data.',
    facebook_dm: 'You reply to Facebook DMs for Paybacker. Be helpful and professional. Direct complex issues to support@paybacker.co.uk. British English. Never share internal data.',
    instagram_comment: 'You reply to Instagram comments for Paybacker. Brief, warm, use an emoji if natural. British English. Never share internal data.',
    instagram_dm: 'You reply to Instagram DMs for Paybacker. Be helpful. Direct complex issues to support@paybacker.co.uk. British English. Never share internal data.',
  };

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `${prompts[type] || prompts.facebook_comment}

Paybacker is a UK consumer rights platform. Free AI complaint letters citing UK law. Bank scanning. 59+ deals. Subscription tracking.

Rules: Never use em dashes. Never share revenue, user counts, or technical details. If spam, respond SKIP. Keep it natural, not corporate.`,
    messages: [{ role: 'user', content: `Message: "${message}"\n\nReply (or SKIP if spam):` }],
  });

  const text = res.content.find(b => b.type === 'text');
  if (!text || text.type !== 'text' || text.text.trim() === 'SKIP') return null;
  return text.text;
}
