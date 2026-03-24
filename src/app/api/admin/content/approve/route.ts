import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postToFacebook } from '@/lib/meta-social';
import { postToTwitter, postToLinkedIn } from '@/lib/content-apis';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  if (!token || !['approve', 'reject'].includes(action || '')) {
    return new NextResponse(renderHtml('Invalid Link', 'This link is invalid or has expired.', 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = getAdmin();

  const { data: draft, error } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('approval_token', token)
    .single();

  if (error || !draft) {
    return new NextResponse(renderHtml('Not Found', 'This content draft was not found.', 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (draft.status !== 'pending') {
    return new NextResponse(renderHtml('Already Processed', `This content was already ${draft.status}.`, 'info'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (action === 'reject') {
    await supabase.from('content_drafts').update({ status: 'rejected' }).eq('id', draft.id);
    return new NextResponse(renderHtml('Rejected', `"${draft.caption.substring(0, 60)}..." has been rejected.`, 'rejected'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Approve and attempt to post
  let postResult = '';
  let platformPostId: string | null = null;

  try {
    const fullText = draft.hashtags
      ? `${draft.caption}\n\n${draft.hashtags}`
      : draft.caption;

    switch (draft.platform) {
      case 'instagram':
      case 'facebook': {
        if (process.env.META_ACCESS_TOKEN) {
          const result = await postToFacebook(draft.caption, draft.hashtags || '', draft.asset_url || undefined, 'image/png');
          platformPostId = result.postId;
          postResult = `Posted to Facebook: ${result.postId}`;
        } else {
          postResult = 'Meta API not configured. Content approved but not posted.';
        }
        break;
      }
      case 'twitter': {
        const result = await postToTwitter(fullText);
        if (result) {
          platformPostId = result.postId;
          postResult = `Posted to Twitter: ${result.postId}`;
        } else {
          postResult = 'Twitter API not configured. Content approved but not posted.';
        }
        break;
      }
      case 'linkedin': {
        const result = await postToLinkedIn(fullText);
        if (result) {
          platformPostId = result.postId;
          postResult = `Posted to LinkedIn: ${result.postId}`;
        } else {
          postResult = 'LinkedIn API not configured. Content approved but not posted.';
        }
        break;
      }
      case 'tiktok': {
        postResult = 'TikTok posting requires manual upload. Content approved.';
        break;
      }
      default:
        postResult = 'Unknown platform. Content approved but not posted.';
    }
  } catch (err: any) {
    postResult = `Posting failed: ${err.message}. Content approved but not posted.`;
  }

  await supabase.from('content_drafts').update({
    status: platformPostId ? 'posted' : 'approved',
    posted_at: platformPostId ? new Date().toISOString() : null,
    platform_post_id: platformPostId,
  }).eq('id', draft.id);

  return new NextResponse(
    renderHtml('Approved', `Content approved for ${draft.platform}.\n\n${postResult}`, 'approved'),
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function renderHtml(title: string, message: string, status: 'approved' | 'rejected' | 'error' | 'info'): string {
  const colors = {
    approved: { bg: '#22c55e', icon: '&#10003;' },
    rejected: { bg: '#ef4444', icon: '&#10007;' },
    error: { bg: '#ef4444', icon: '!' },
    info: { bg: '#3b82f6', icon: 'i' },
  };
  const c = colors[status];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="max-width:500px;margin:0 auto;padding:32px;text-align:center;">
  <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:32px;">Pay<span style="color:#f59e0b;">backer</span></div>
  <div style="width:64px;height:64px;border-radius:50%;background:${c.bg}20;border:2px solid ${c.bg};display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px;color:${c.bg};">${c.icon}</div>
  <h1 style="color:#fff;font-size:24px;margin:0 0 12px;">${title}</h1>
  <p style="color:#94a3b8;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
  <a href="/dashboard/admin" style="display:inline-block;margin-top:24px;color:#f59e0b;font-size:14px;text-decoration:none;">Go to Admin Dashboard</a>
</div></body></html>`;
}
