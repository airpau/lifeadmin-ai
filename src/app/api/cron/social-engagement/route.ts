import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { PRODUCT_CONTEXT, SOCIAL_RULES } from '@/lib/product-context';

function getDb() {
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export const runtime = 'nodejs';
export const maxDuration = 60;

const API = 'https://graph.facebook.com/v25.0';
const PAGE_ID = '1056645287525328';
const IG_ID = '17841440175351137';

/**
 * Social engagement cron - checks for new comments and DMs on Facebook/Instagram
 * and responds with helpful, on-brand replies using AI.
 *
 * Schedule: Every 4 hours
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.MANAGED_AGENTS_ENABLED !== 'true') {
    console.log('[social-engagement] Managed agents disabled (MANAGED_AGENTS_ENABLED != true)');
    return NextResponse.json({ ok: true, message: 'Managed agents disabled' });
  }

  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  // Get page token for Facebook
  const pageTokenRes = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const pageTokenData = await pageTokenRes.json();
  const pageToken = pageTokenData.access_token || systemToken;

  const results: any[] = [];

  // Types for pre-collected work items
  type FbComment = { postMessage: string | undefined; comment: any };
  type IgComment = { mediaId: string; comment: any };
  type FbDm = { sender: any; lastMsg: any; chatHistory: { role: 'user' | 'assistant'; content: string }[] };

  const fbComments: FbComment[] = [];
  const igComments: IgComment[] = [];
  const fbDms: FbDm[] = [];

  // === COLLECT FACEBOOK COMMENTS ===
  try {
    const postsRes = await fetch(`${API}/${PAGE_ID}/posts?fields=id,message,created_time&limit=5&access_token=${pageToken}`);
    const postsData = await postsRes.json();

    for (const post of postsData.data || []) {
      const commentsRes = await fetch(`${API}/${post.id}/comments?fields=id,message,from,created_time,can_reply_privately&limit=10&access_token=${pageToken}`);
      const commentsData = await commentsRes.json();

      for (const comment of commentsData.data || []) {
        if (comment.from?.id === PAGE_ID) continue;

        const repliesRes = await fetch(`${API}/${comment.id}/comments?fields=from&limit=5&access_token=${pageToken}`);
        const repliesData = await repliesRes.json();
        const alreadyReplied = (repliesData.data || []).some((r: any) => r.from?.id === PAGE_ID);
        if (alreadyReplied) continue;

        fbComments.push({ postMessage: post.message, comment });
      }
    }
  } catch (err: any) {
    results.push({ platform: 'facebook', type: 'error', error: err.message });
  }

  // === COLLECT INSTAGRAM COMMENTS ===
  try {
    const mediaRes = await fetch(`${API}/${IG_ID}/media?fields=id,caption,timestamp&limit=5&access_token=${systemToken}`);
    const mediaData = await mediaRes.json();

    for (const media of mediaData.data || []) {
      const commentsRes = await fetch(`${API}/${media.id}/comments?fields=id,text,username,timestamp&limit=10&access_token=${systemToken}`);
      const commentsData = await commentsRes.json();

      for (const comment of commentsData.data || []) {
        const repliesRes = await fetch(`${API}/${comment.id}/replies?fields=username&limit=5&access_token=${systemToken}`);
        const repliesData = await repliesRes.json();
        const alreadyReplied = (repliesData.data || []).length > 0;
        if (alreadyReplied) continue;

        igComments.push({ mediaId: media.id, comment });
      }
    }
  } catch (err: any) {
    results.push({ platform: 'instagram', type: 'error', error: err.message });
  }

  // === COLLECT FACEBOOK DMs ===
  try {
    const convsRes = await fetch(`${API}/me/conversations?fields=participants,updated_time&platform=messenger&limit=5&access_token=${pageToken}`);
    const convsData = await convsRes.json();

    for (const conv of convsData.data || []) {
      const convAge = Date.now() - new Date(conv.updated_time).getTime();
      if (convAge > 60 * 60 * 1000) continue;

      const participants = conv.participants?.data || [];
      const sender = participants.find((p: any) => p.id !== PAGE_ID);
      if (!sender) continue;

      const msgsRes = await fetch(`${API}/${conv.id}/messages?fields=message,from,created_time&limit=10&access_token=${pageToken}`);
      const msgsData = await msgsRes.json();
      const messages = (msgsData.data || []).reverse();
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];
      if (lastMsg.from?.id === PAGE_ID) continue;

      const msgAge = Date.now() - new Date(lastMsg.created_time).getTime();
      if (msgAge > 15 * 60 * 1000) continue;

      const chatHistory = messages.map((m: any) => ({
        role: m.from?.id === PAGE_ID ? 'assistant' as const : 'user' as const,
        content: m.message || '',
      })).filter((m: any) => m.content);

      fbDms.push({ sender, lastMsg, chatHistory });
    }
  } catch (err: any) {
    results.push({ platform: 'facebook_dm', type: 'error', error: err.message });
  }

  // Nothing to process — skip Anthropic entirely
  if (fbComments.length === 0 && igComments.length === 0 && fbDms.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // === REPLY TO FACEBOOK COMMENTS ===
  for (const { postMessage, comment } of fbComments) {
    try {
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You are Paybacker's social media manager responding to comments on Facebook. Be friendly, helpful, and professional. Keep replies short (1-3 sentences). British English.

Rules:
- Be warm and genuine, not corporate
- If they ask about features, briefly explain what Paybacker does
- If they have a complaint or issue, direct them to support@paybacker.co.uk
- If they ask about pricing, mention free tier (3 letters/month) and Pro (£9.99/month)
- Never share internal business info, revenue, user counts, or technical details
- Never use em dashes
- Always end with something helpful or encouraging
- If the comment is spam or irrelevant, do not reply (respond with SKIP)`,
        messages: [{
          role: 'user',
          content: `Comment on our post "${postMessage?.substring(0, 100)}...":\n\n"${comment.message}"\n\nWrite a brief, friendly reply. If the comment doesn't warrant a reply, respond with just SKIP.`,
        }],
      });

      const replyText = aiRes.content.find(b => b.type === 'text');
      if (!replyText || replyText.type !== 'text' || replyText.text.trim() === 'SKIP') continue;

      const replyRes = await fetch(`${API}/${comment.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.text, access_token: pageToken }),
      });
      const replyData = await replyRes.json();
      results.push({ platform: 'facebook', type: 'comment_reply', comment: comment.message?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
    } catch (err: any) {
      results.push({ platform: 'facebook', type: 'error', error: err.message });
    }
  }

  // === REPLY TO INSTAGRAM COMMENTS ===
  for (const { mediaId, comment } of igComments) {
    try {
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `You are Paybacker's Instagram manager. Reply to comments briefly and warmly. 1-2 sentences max. Use emojis sparingly. British English. Never share internal info. If spam, respond SKIP. Never use em dashes.`,
        messages: [{
          role: 'user',
          content: `Comment by @${comment.username} on our post: "${comment.text}"\n\nWrite a brief reply or SKIP.`,
        }],
      });

      const replyText = aiRes.content.find(b => b.type === 'text');
      if (!replyText || replyText.type !== 'text' || replyText.text.trim() === 'SKIP') continue;

      const replyRes = await fetch(`${API}/${comment.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.text, access_token: systemToken }),
      });
      const replyData = await replyRes.json();

      await getDb().from('leads').upsert({
        platform: 'instagram_comment',
        platform_user_id: comment.username,
        name: comment.username,
        first_message: comment.text?.substring(0, 500) || '',
        source_post_id: mediaId,
        status: 'new',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'platform_user_id' });

      results.push({ platform: 'instagram', type: 'comment_reply', comment: comment.text?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
    } catch (err: any) {
      results.push({ platform: 'instagram', type: 'error', error: err.message });
    }
  }

  // === REPLY TO FACEBOOK DMs ===
  for (const { sender, lastMsg, chatHistory } of fbDms) {
    try {
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You are a friendly support person at Paybacker, chatting with someone on Facebook Messenger. This is a real conversation, not a support ticket. Be natural, warm, and helpful. You can give detailed consumer law advice when asked.

${PRODUCT_CONTEXT}

${SOCIAL_RULES}`,
        messages: chatHistory,
      });

      const replyText = aiRes.content.find(b => b.type === 'text');
      if (!replyText || replyText.type !== 'text') continue;

      const replyRes = await fetch(`${API}/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: sender.id },
          message: { text: replyText.text },
          messaging_type: 'RESPONSE',
          access_token: pageToken,
        }),
      });
      const replyData = await replyRes.json();
      results.push({ platform: 'facebook', type: 'dm_reply', message: lastMsg.message?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
    } catch (err: any) {
      results.push({ platform: 'facebook_dm', type: 'error', error: err.message });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
