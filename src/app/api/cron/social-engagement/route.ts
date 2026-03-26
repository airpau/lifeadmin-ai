import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
        results.push({ platform: 'instagram', type: 'comment_reply', comment: comment.text?.substring(0, 50), reply: replyText.text.substring(0, 50), success: !replyData.error });
      }
    }
  } catch (err: any) {
    results.push({ platform: 'instagram', type: 'error', error: err.message });
  }

  // === FACEBOOK PAGE MESSAGES (DMs) ===
  try {
    const convsRes = await fetch(`${API}/${PAGE_ID}/conversations?fields=id,messages{message,from,created_time}&limit=5&access_token=${pageToken}`);
    const convsData = await convsRes.json();

    for (const conv of convsData.data || []) {
      const messages = conv.messages?.data || [];
      if (messages.length === 0) continue;

      const lastMsg = messages[0];
      // Skip if last message is from us
      if (lastMsg.from?.id === PAGE_ID) continue;

      // Check if message is recent (within 2 hours)
      const msgAge = Date.now() - new Date(lastMsg.created_time).getTime();
      if (msgAge > 2 * 60 * 60 * 1000) continue;

      // Generate AI reply
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: `You are Paybacker's support assistant responding to Facebook DMs. Be helpful, friendly, and professional. British English.

Rules:
- Help with questions about Paybacker features and pricing
- Direct complex issues to support@paybacker.co.uk
- Direct feature requests to features@paybacker.co.uk
- Never share internal business data, revenue, or technical details
- Never use em dashes
- If they need a complaint letter, tell them to sign up free at paybacker.co.uk
- Keep responses concise but thorough`,
        messages: [{
          role: 'user',
          content: `Facebook DM from a user: "${lastMsg.message}"\n\nWrite a helpful reply.`,
        }],
      });

      const replyText = aiRes.content.find(b => b.type === 'text');
      if (!replyText || replyText.type !== 'text') continue;

      // Send DM reply
      const replyRes = await fetch(`${API}/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText.text,
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
