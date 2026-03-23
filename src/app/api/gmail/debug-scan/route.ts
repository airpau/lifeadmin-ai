import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { refreshAccessToken } from '@/lib/gmail';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // Admin only
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get admin user's Gmail token
  const { data: tokenRow } = await admin
    .from('gmail_tokens')
    .select('*')
    .eq('email', 'aireypaul@googlemail.com')
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: 'No Gmail token found', step: 'token_lookup' });
  }

  // Refresh if expired
  let accessToken = tokenRow.access_token;
  if (tokenRow.token_expiry && new Date(tokenRow.token_expiry) < new Date()) {
    if (!tokenRow.refresh_token) {
      return NextResponse.json({ error: 'Token expired, no refresh token', step: 'token_refresh' });
    }
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    accessToken = refreshed.access_token;
  }

  // Step 1: Test Gmail API access
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:(bill OR invoice OR subscription) newer_than:730d&maxResults=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  if (!listRes.ok) {
    return NextResponse.json({ error: 'Gmail API failed', step: 'list_messages', detail: listData });
  }

  const messageCount = listData.resultSizeEstimate || 0;
  const messageIds = (listData.messages || []).slice(0, 3);

  // Step 2: Fetch first 3 email details
  const emailDetails = [];
  for (const msg of messageIds) {
    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const detail = await detailRes.json();
    const headers = detail.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    emailDetails.push({
      id: msg.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: detail.snippet?.substring(0, 200),
      hasBody: !!detail.payload?.body?.data || !!detail.payload?.parts,
    });
  }

  // Step 3: Test Claude with a simple prompt using the actual email data
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const testPrompt = emailDetails.map((e, i) =>
    `--- Email ${i + 1} ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}`
  ).join('\n\n');

  const claudeRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `Return a JSON array of financial opportunities found in these emails. Each entry: {"id":"opp_1","type":"subscription","title":"short title","provider":"company name","amount":0,"confidence":80}. If you find ANY email from a known company (Netflix, Sky, British Gas, etc), include it. Return at least one entry per unique sender. Return ONLY the JSON array.`,
    messages: [{ role: 'user', content: `Find financial opportunities:\n\n${testPrompt}` }],
  });

  const claudeText = claudeRes.content[0];
  const claudeOutput = claudeText.type === 'text' ? claudeText.text : 'non-text response';

  return NextResponse.json({
    step: 'complete',
    gmail_access: 'ok',
    total_matching_emails: messageCount,
    sample_emails: emailDetails,
    claude_raw_response: claudeOutput.substring(0, 2000),
    claude_model: 'claude-sonnet-4-6',
    token_status: tokenRow.token_expiry ? (new Date(tokenRow.token_expiry) > new Date() ? 'valid' : 'refreshed') : 'no_expiry',
  });
}
