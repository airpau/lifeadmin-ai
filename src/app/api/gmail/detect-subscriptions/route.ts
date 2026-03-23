import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { refreshAccessToken } from '@/lib/gmail';
import Anthropic from '@anthropic-ai/sdk';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';

export const maxDuration = 300;

const SUBJECT_QUERY =
  'subject:(subscription OR renewal OR "direct debit" OR "standing order" OR "recurring payment" OR invoice OR receipt OR membership OR "auto-renew" OR "payment received" OR "plan renewed" OR "trial ended" OR "billing statement" OR "your bill" OR "payment due" OR "price change" OR "contract end" OR "notice period") newer_than:730d';

const PROVIDER_QUERY =
  'from:(netflix OR spotify OR amazon OR apple OR google OR microsoft OR adobe OR sky OR virginmedia OR bt.com OR talktalk OR vodafone OR o2.co.uk OR three.co.uk OR ee.co.uk OR davidlloyd OR puregym OR disney OR britbox OR nowtv OR nordvpn OR linkedin OR canva OR notion OR slack OR zoom OR britishgas OR edfenergy OR octopusenergy OR ovo OR shell OR deliveroo OR hellofresh OR gousto OR peloton OR strava OR audible OR icloud OR dropbox OR github OR figma OR openai OR anthropic OR vercel OR communityfibre OR plusnet OR hyperoptic) newer_than:730d';

async function fetchMessageIds(query: string, accessToken: string, maxResults = 200): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken = '';
  for (let page = 0; page < 3 && allIds.length < maxResults; page++) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break;
    const data = await res.json();
    for (const m of data.messages || []) allIds.push(m.id);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return allIds.slice(0, maxResults);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = user.email === 'aireypaul@googlemail.com';

  if (!isAdmin) {
    const usageCheck = await checkUsageLimit(user.id, 'scan_run');
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: 'Monthly scan limit reached', upgradeRequired: true }, { status: 403 });
    }
    const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }
  }

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

  // Fetch emails from both queries
  const [subjectIds, providerIds] = await Promise.all([
    fetchMessageIds(SUBJECT_QUERY, accessToken),
    fetchMessageIds(PROVIDER_QUERY, accessToken),
  ]);

  const allIds = Array.from(new Set([...subjectIds, ...providerIds]));
  if (!allIds.length) return NextResponse.json({ subscriptions: [] });

  // Fetch metadata for up to 100 emails
  const idsToFetch = allIds.slice(0, 100);
  const emailDetails: Array<{ from: string; subject: string; date: string; snippet: string }> = [];

  for (let i = 0; i < idsToFetch.length; i += 25) {
    const batch = idsToFetch.slice(i, i + 25);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const msg = await res.json();
        const headers = msg.payload?.headers || [];
        const get = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        return { from: get('From'), subject: get('Subject'), date: get('Date'), snippet: (msg.snippet || '').substring(0, 200) };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) emailDetails.push(r.value);
    }
  }

  // Group by sender
  const senderMap = new Map<string, { from: string; subjects: string[]; snippet: string; count: number }>();
  for (const e of emailDetails) {
    const key = e.from.substring(0, 50).toLowerCase();
    if (!senderMap.has(key)) {
      senderMap.set(key, { from: e.from, subjects: [], snippet: e.snippet, count: 0 });
    }
    const g = senderMap.get(key)!;
    if (g.subjects.length < 3) g.subjects.push(e.subject);
    g.count++;
  }

  const providerList = Array.from(senderMap.values())
    .map((g, i) => `${i + 1}. From: ${g.from} (${g.count} emails)\n   Subjects: ${g.subjects.join(' | ')}\n   Snippet: ${g.snippet}`)
    .join('\n');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: `You are a subscription and contract detection assistant for UK consumers. Analyse these email providers and identify every recurring payment, subscription, and contract.

Return a JSON array. Each subscription must have:
- provider_name: clean company name (e.g. "Netflix", "Spotify", "Community Fibre")
- amount: monthly cost in GBP. Extract from snippet if visible. For yearly plans divide by 12. Use 0 if unknown.
- billing_cycle: "monthly" | "yearly" | "quarterly"
- category: "streaming" | "software" | "fitness" | "news" | "broadband" | "mobile" | "utility" | "insurance" | "mortgage" | "loan" | "food" | "shopping" | "other"
- confidence: 60-95
- contract_end_date: ISO date string if any email mentions contract end, renewal date, or notice period. null if unknown.
- is_ending_soon: true if contract appears to be ending within 90 days based on email content. false otherwise.
- cancel_suggestion: true if the subscription looks unused, expensive relative to alternatives, or is a free trial about to convert. false otherwise.
- notes: brief note about what was found (e.g. "Price increase notification in Feb", "Contract ends April 2026", "Multiple receipts suggest active use")

Rules:
- Include EVERY provider that looks like a recurring payment. A normal inbox should have 10-30+ subscriptions.
- If you see multiple emails from a company, it's likely a subscription.
- Look for price increase notifications, these are important for the user to know about.
- Look for contract end dates, renewal notices, and "your contract is ending" emails.
- Deduplicate: one entry per provider.
- Return ONLY the JSON array. No markdown fences. No explanation.`,
      messages: [{
        role: 'user',
        content: `Detect all subscriptions and contracts from these ${senderMap.size} email providers:\n\n${providerList}`,
      }],
    });

    if (!isAdmin) {
      const usageCheck = await checkUsageLimit(user.id, 'scan_run');
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    let subscriptions: any[] = [];
    const text = message.content[0];
    if (text.type === 'text') {
      let raw = text.text.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      let jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        const truncated = raw.match(/\[[\s\S]*/);
        if (truncated) {
          const lastBrace = truncated[0].lastIndexOf('}');
          if (lastBrace > 0) jsonMatch = [truncated[0].substring(0, lastBrace + 1) + ']'];
        }
      }
      if (jsonMatch) {
        const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
        subscriptions = JSON.parse(cleaned);
      }
    }

    return NextResponse.json({
      subscriptions,
      emailsFound: allIds.length,
      emailsScanned: emailDetails.length,
      providersFound: senderMap.size,
    });
  } catch (err: any) {
    console.error('Detect subscriptions error:', err.message);
    return NextResponse.json({ error: err.message, subscriptions: [] }, { status: 500 });
  }
}
