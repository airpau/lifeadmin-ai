import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { refreshAccessToken } from '@/lib/gmail';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const SUBSCRIPTION_QUERY = [
  'subject:("your subscription" OR "subscription renewed" OR "payment received" OR "thank you for your payment")',
  'subject:("your order" OR "receipt" OR "invoice" OR "billing" OR "auto-renew")',
  'from:(netflix OR spotify OR amazon OR apple OR google OR microsoft OR adobe OR dropbox OR sky OR virginmedia)',
].join(' OR ');

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tokenRow } = await admin
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!tokenRow) return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });

  let accessToken = tokenRow.access_token;
  if (tokenRow.token_expiry && new Date(tokenRow.token_expiry) < new Date()) {
    if (!tokenRow.refresh_token) return NextResponse.json({ error: 'Token expired' }, { status: 400 });
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    accessToken = refreshed.access_token;
    await admin.from('gmail_tokens').update({
      access_token: accessToken,
      token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('user_id', user.id);
  }

  // Fetch subscription-related emails
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(SUBSCRIPTION_QUERY)}&maxResults=25`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  const messages = listData.messages || [];
  if (!messages.length) return NextResponse.json({ subscriptions: [] });

  // Fetch email details in parallel
  const details = await Promise.allSettled(
    messages.slice(0, 15).map(async (m: { id: string }) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await res.json();
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || '';
      return { subject: get('Subject'), from: get('From'), date: get('Date'), snippet: msg.snippet || '' };
    })
  );

  const emails = details
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are a subscription detection assistant. Analyse these emails and identify recurring subscriptions.
Return a JSON array of detected subscriptions. Each must have:
- provider_name: company/service name (string)
- amount: monthly cost in GBP as a number (estimate from email; 0 if unknown)
- billing_cycle: "monthly" | "yearly" | "quarterly" (best guess)
- category: "streaming" | "software" | "fitness" | "news" | "shopping" | "gaming" | "other"
- confidence: 0-100 (how confident this is a recurring subscription)

Only include clear subscriptions (confidence >= 60). No duplicates. Return [] if none found.
Return ONLY the JSON array, no markdown.`,
    messages: [{
      role: 'user',
      content: `Detect subscriptions from these emails:\n\n${emails.map((e, i) =>
        `${i + 1}. From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nPreview: ${e.snippet}`
      ).join('\n\n')}`,
    }],
  });

  try {
    let raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = raw.match(/\[[\s\S]*\]/);
    const subscriptions = match ? JSON.parse(match[0]) : [];
    return NextResponse.json({ subscriptions });
  } catch {
    return NextResponse.json({ subscriptions: [] });
  }
}
