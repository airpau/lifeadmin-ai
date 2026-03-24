import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postViaLate } from '@/lib/content-apis';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  if (!token || !['approve', 'reject'].includes(action || '')) {
    return html('Invalid Link', 'This link is invalid.', 'error');
  }

  const supabase = getAdmin();
  const { data: draft } = await supabase.from('content_drafts').select('*').eq('approval_token', token).single();

  if (!draft) return html('Not Found', 'Content draft not found.', 'error');
  if (draft.status !== 'pending') return html('Already Processed', `This content was already ${draft.status}.`, 'info');

  if (action === 'reject') {
    await supabase.from('content_drafts').update({ status: 'rejected' }).eq('id', draft.id);
    return html('Rejected', `Content rejected.`, 'rejected');
  }

  // Approve and post via Late API
  let postResult = '';
  let platformPostId: string | null = null;

  const fullText = draft.hashtags ? `${draft.caption}\n\n${draft.hashtags}` : draft.caption;

  const result = await postViaLate({
    platform: draft.platform,
    text: fullText,
    mediaUrl: draft.asset_url || undefined,
  });

  if (result) {
    platformPostId = result.postId;
    postResult = `Posted to ${draft.platform} via Late API.`;
  } else {
    postResult = 'Late API not configured or posting failed. Content approved for manual posting.';
  }

  await supabase.from('content_drafts').update({
    status: platformPostId ? 'posted' : 'approved',
    posted_at: platformPostId ? new Date().toISOString() : null,
    platform_post_id: platformPostId,
  }).eq('id', draft.id);

  return html('Approved', `Content approved for ${draft.platform}.\n\n${postResult}`, 'approved');
}

function html(title: string, message: string, status: 'approved' | 'rejected' | 'error' | 'info') {
  const colors: Record<string, string> = { approved: '#22c55e', rejected: '#ef4444', error: '#ef4444', info: '#3b82f6' };
  const icons: Record<string, string> = { approved: '&#10003;', rejected: '&#10007;', error: '!', info: 'i' };
  return new NextResponse(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#020617;font-family:sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="max-width:500px;padding:32px;text-align:center;">
  <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:32px;">Pay<span style="color:#f59e0b;">backer</span></div>
  <div style="width:64px;height:64px;border-radius:50%;background:${colors[status]}20;border:2px solid ${colors[status]};display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px;color:${colors[status]};">${icons[status]}</div>
  <h1 style="color:#fff;font-size:24px;margin:0 0 12px;">${title}</h1>
  <p style="color:#94a3b8;font-size:14px;white-space:pre-wrap;">${message}</p>
  <a href="/dashboard/admin" style="display:inline-block;margin-top:24px;color:#f59e0b;">Admin Dashboard</a>
</div></body></html>`, { headers: { 'Content-Type': 'text/html' } });
}
