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
 * Schedule: Every 2 hours
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  // Get page token for Facebook
  const pageTokenRes = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const pageTokenData = await pageTokenRes.json();
  const pageToken = pageTokenData.access_token || systemToken;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: any[] = [];

  // === FACEBOOK COMMENTS ===
  try {
    // Get recent posts
    const postsRes = await fetch(`${API}/${PAGE_ID}/posts?fields=id,message,created_time&limit=5&access_token=${pageToken}`);
    const postsData = await postsRes.json();

    for (const post of postsData.data || []) {
      // Get comments on each post
      const commentsRes = await fetch(`${API}/${post.id}/comments?fields=id,message,from,created_time,can_reply_privately&limit=10&access_token=${pageToken}`);
      const commentsData = await commentsRes.json();

      for (const comment of commentsData.data || []) {
        // Check if we already replied (check for our page's reply)
        const repliesRes = await fetch(`${API}/${comment.id}/comments?fields=from&limit=5&access_token=${pageToken}`);
        const repliesData = await repliesRes.json();
        const alreadyReplied = (repliesData.data || []).some((r: any) => r.from?.id === PAGE_ID);

        if (alreadyReplied) continue;

        // Skip our own comments
        if (comment.from?.id === PAGE_ID) continue;

        // Generate AI reply
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
            content: `Comment on our post "${post.message?.substring(0, 100)}...":\n\n"${comment.message}"\n\nWrite a brief, friendly reply. If the comment doesn't warrant a reply, respond with just SKIP.`,
          }],
        });

        const replyText = aiRes.content.find(b => b.type === 'text');
        if (!replyText || replyText.type !== 'text' || replyText.text.trim() === 'SKIP') continue;

        // Post reply
        const replyRes = await fetch(`${API}/${comment.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: replyText.text,
            access_token: pageToken,
          }),
        });
        const replyData = await replyRes.json();
        results.push({ platform: 'facebook', type: 'comment_reply', comment: comment.message?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
      }
    }
  } catch (err: any) {
    results.push({ platform: 'facebook', type: 'error', error: err.message });
  }

  // === INSTAGRAM COMMENTS ===
  try {
    // Get recent IG media
    const mediaRes = await fetch(`${API}/${IG_ID}/media?fields=id,caption,timestamp&limit=5&access_token=${systemToken}`);
    const mediaData = await mediaRes.json();

    for (const media of mediaData.data || []) {
      // Get comments
      const commentsRes = await fetch(`${API}/${media.id}/comments?fields=id,text,username,timestamp&limit=10&access_token=${systemToken}`);
      const commentsData = await commentsRes.json();

      for (const comment of commentsData.data || []) {
        // Check if already replied
        const repliesRes = await fetch(`${API}/${comment.id}/replies?fields=username&limit=5&access_token=${systemToken}`);
        const repliesData = await repliesRes.json();
        const alreadyReplied = (repliesData.data || []).length > 0;

        if (alreadyReplied) continue;

        // Generate AI reply
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

        // Reply to IG comment
        const replyRes = await fetch(`${API}/${comment.id}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: replyText.text,
            access_token: systemToken,
          }),
        });
        const replyData = await replyRes.json();
        // Capture as lead
        await getDb().from('leads').upsert({
          platform: 'instagram_comment',
          platform_user_id: comment.username,
          name: comment.username,
          first_message: comment.text?.substring(0, 500) || '',
          source_post_id: media.id,
          status: 'new',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'platform_user_id' }).catch(() => {});

        results.push({ platform: 'instagram', type: 'comment_reply', comment: comment.text?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
      }
    }
  } catch (err: any) {
    results.push({ platform: 'instagram', type: 'error', error: err.message });
  }

  // === FACEBOOK PAGE MESSAGES (DMs) ===
  try {
    // Get conversations with participants to find PSIDs
    const convsRes = await fetch(`${API}/me/conversations?fields=participants,updated_time&platform=messenger&limit=5&access_token=${pageToken}`);
    const convsData = await convsRes.json();

    for (const conv of convsData.data || []) {
      // Check if conversation was updated recently (within 1 hour)
      const convAge = Date.now() - new Date(conv.updated_time).getTime();
      if (convAge > 60 * 60 * 1000) continue;

      // Get the sender's PSID (not the page)
      const participants = conv.participants?.data || [];
      const sender = participants.find((p: any) => p.id !== PAGE_ID);
      if (!sender) continue;

      // Get full conversation history for context
      const msgsRes = await fetch(`${API}/${conv.id}/messages?fields=message,from,created_time&limit=10&access_token=${pageToken}`);
      const msgsData = await msgsRes.json();
      const messages = (msgsData.data || []).reverse(); // oldest first
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];
      // Skip if last message is from us (we already replied)
      if (lastMsg.from?.id === PAGE_ID) continue;

      // Check if message is recent (within 10 minutes for responsive feel)
      const msgAge = Date.now() - new Date(lastMsg.created_time).getTime();
      if (msgAge > 15 * 60 * 1000) continue;

      // Build conversation history for Claude
      const chatHistory = messages.map((m: any) => ({
        role: m.from?.id === PAGE_ID ? 'assistant' as const : 'user' as const,
        content: m.message || '',
      })).filter((m: any) => m.content);

      // Generate AI reply with full product context and conversation history
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

      // Send DM reply using PSID
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
    }
  } catch (err: any) {
    results.push({ platform: 'facebook_dm', type: 'error', error: err.message });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
