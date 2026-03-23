import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { refreshAccessToken } from '@/lib/gmail';
import Anthropic from '@anthropic-ai/sdk';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';

export const maxDuration = 60;

// Two focused queries instead of one giant OR — Gmail handles shorter queries more reliably
const SUBJECT_QUERY =
  'subject:(subscription OR renewal OR "direct debit" OR "standing order" OR "recurring payment" OR invoice OR receipt OR membership OR "auto-renew" OR "payment received" OR "thank you for your payment" OR "plan renewed" OR "trial ended" OR "billing statement") newer_than:365d';

const PROVIDER_QUERY =
  'from:(netflix OR spotify OR amazon OR apple OR google OR microsoft OR adobe OR dropbox OR sky OR virginmedia OR bt.com OR talktalk OR vodafone OR o2.co.uk OR three.co.uk OR ee.co.uk OR davidlloyd OR puregym OR anytime OR nuffield OR disney OR britbox OR nowtv OR nordvpn OR expressvpn OR proton.me OR linkedin OR canva OR grammarly OR notion OR slack OR zoom OR britishgas OR edfenergy OR octopusenergy OR bulb OR shell OR hulu OR paramount OR peacock OR duolingo OR headspace OR calm OR audible OR kindle OR icloud OR onedrive OR dropbox OR lastpass OR dashlane OR mcafee OR norton OR avast OR github OR figma OR loom OR miro OR airtable OR hubspot OR mailchimp OR squarespace OR wix OR godaddy OR namecheap OR cloudflare OR heroku OR aws OR azure OR deliveroo OR hellofresh OR gousto OR mindful OR peloton OR classpass OR strava OR garmin OR myprotein) newer_than:365d';

async function fetchMessageIds(query: string, accessToken: string, maxResults = 50): Promise<string[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return (data.messages || []).map((m: { id: string }) => m.id);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check plan limit
  const usageCheck = await checkUsageLimit(user.id, 'scan_run');
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: 'Monthly scan limit reached', upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
      { status: 403 }
    );
  }

  // Check Claude rate limit
  const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
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

  // Run both queries in parallel and deduplicate by message ID
  const [subjectIds, providerIds] = await Promise.all([
    fetchMessageIds(SUBJECT_QUERY, accessToken, 200),
    fetchMessageIds(PROVIDER_QUERY, accessToken, 200),
  ]);

  const allIds = Array.from(new Set([...subjectIds, ...providerIds]));
  if (!allIds.length) return NextResponse.json({ subscriptions: [] });

  // Token optimisation: truncated to reduce API costs — max 15 emails
  const details = await Promise.allSettled(
    allIds.slice(0, 15).map(async (id: string) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await res.json();
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || '';
      // Token optimisation: truncated to reduce API costs
      return { subject: get('Subject'), from: get('From'), date: get('Date'), snippet: (msg.snippet || '').slice(0, 300) };
    })
  );

  const emails = details
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const DETECT_MODEL = 'claude-haiku-4-5-20251001';
  logClaudeCall({
    userId: user.id,
    route: '/api/gmail/detect-subscriptions',
    model: DETECT_MODEL,
    estimatedInputTokens: 3000,
    estimatedOutputTokens: 1000,
  });

  const message = await anthropic.messages.create({
    model: DETECT_MODEL,
    max_tokens: 2000,
    system: `You are a subscription detection assistant for UK consumers. Analyse these emails and identify recurring subscriptions.

Return a JSON array of detected subscriptions. Each object must have:
- provider_name: clean company/service name (e.g. "Netflix", "Spotify", "Adobe Creative Cloud")
- amount: cost in GBP as a number. Extract from snippet/subject if visible (e.g. "£9.99" → 9.99). For yearly plans divide by 12 for monthly equivalent. Use 0 if truly unknown.
- billing_cycle: "monthly" | "yearly" | "quarterly" — infer from context ("annual", "per year" → yearly; "per month", "monthly" → monthly)
- category: "streaming" | "software" | "fitness" | "news" | "shopping" | "gaming" | "utilities" | "other"
- confidence: 0-100

Rules:
- Include anything with confidence >= 35. Better to surface candidates the user can dismiss than to miss real subscriptions.
- Deduplicate: if multiple emails are from the same provider, list it once with the most recent/accurate amount.
- Infer provider from the "From" email domain if the subject doesn't name it (e.g. "noreply@netflix.com" → "Netflix").
- Common UK amounts to watch: Spotify £10.99, Netflix £4.99–17.99, Amazon Prime £8.99/mo, iCloud £0.99–6.99, Microsoft 365 £5.99–12.99, Adobe £54.98/mo or £599/yr, Sky £25+, broadband £20–50.
- Do NOT include one-off purchases (Amazon order confirmations for physical goods, etc.) unless there are clear subscription signals.

Return ONLY the JSON array, no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Detect subscriptions from these ${emails.length} emails:\n\n${emails.map((e, i) =>
        `${i + 1}. From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nPreview: ${e.snippet}`
      ).join('\n\n')}`,
    }],
  });

  await recordClaudeCall(user.id, usageCheck.tier);
  await incrementUsage(user.id, 'scan_run');

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
