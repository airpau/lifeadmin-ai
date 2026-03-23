import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Plan and rate limit checks
  const plan = await getUserPlan(user.id);
  const usageCheck = await checkUsageLimit(user.id, 'scan_run');

  // Allow admin to always scan for testing
  const isAdmin = user.email === 'aireypaul@googlemail.com';

  if (!isAdmin) {
    if (plan.tier === 'free') {
      return NextResponse.json(
        { error: 'Upgrade to Essential to use this feature', upgradeRequired: true },
        { status: 403 }
      );
    }
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: 'Monthly scan limit reached', upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
        { status: 403 }
      );
    }
    const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
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

  if (!tokenRow) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  // Refresh token if expired
  let accessToken = tokenRow.access_token;
  if (tokenRow.token_expiry && new Date(tokenRow.token_expiry) < new Date()) {
    if (!tokenRow.refresh_token) {
      return NextResponse.json({ error: 'Token expired, please reconnect Gmail' }, { status: 400 });
    }
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin.from('gmail_tokens').update({
      access_token: accessToken,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
  }

  try {
    // Fetch email list using Gmail API directly
    const queries = [
      'subject:(bill OR invoice OR statement OR renewal OR subscription OR receipt OR "direct debit" OR "price increase" OR mortgage OR loan OR "credit card" OR flight OR compensation OR "council tax") newer_than:730d',
      'from:(netflix OR spotify OR disney OR amazon OR apple OR sky OR bt OR virgin OR vodafone OR ee OR three OR "british gas" OR eon OR octopus OR ovo OR edf) newer_than:730d',
    ];

    const allMessageIds = new Set<string>();
    for (const q of queries) {
      let pageToken = '';
      for (let page = 0; page < 5; page++) {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) break;
        const data = await res.json();
        for (const m of data.messages || []) allMessageIds.add(m.id);
        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }
    }

    const emailsFound = allMessageIds.size;

    // Fetch details for up to 100 emails in batches
    const idsToFetch = Array.from(allMessageIds).slice(0, 100);
    const emailDetails: Array<{ id: string; from: string; subject: string; date: string; snippet: string }> = [];

    for (let i = 0; i < idsToFetch.length; i += 20) {
      const batch = idsToFetch.slice(i, i + 20);
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
          return { id: msg.id, from: get('From'), subject: get('Subject'), date: get('Date'), snippet: msg.snippet || '' };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) emailDetails.push(r.value);
      }
    }

    // Group by sender
    const senderMap = new Map<string, { from: string; subjects: string[]; snippets: string[]; emailId: string; count: number }>();
    for (const e of emailDetails) {
      const key = e.from.substring(0, 50).toLowerCase();
      if (!senderMap.has(key)) {
        senderMap.set(key, { from: e.from, subjects: [], snippets: [], emailId: e.id, count: 0 });
      }
      const g = senderMap.get(key)!;
      if (g.subjects.length < 3) g.subjects.push(e.subject);
      if (g.snippets.length < 1) g.snippets.push(e.snippet.substring(0, 150));
      g.count++;
    }

    const providerList = Array.from(senderMap.values())
      .map((g, i) => `${i + 1}. From: ${g.from} (${g.count} emails)\n   Subjects: ${g.subjects.join(' | ')}\n   Snippet: ${g.snippets[0] || ''}`)
      .join('\n');

    // Call Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are a UK consumer finance analyst. Analyse the email providers below and return a JSON array of financial opportunities.

For EVERY provider you recognise, create an entry. A normal inbox should have 10-50+ opportunities.

Each entry must have:
- id: "opp_1", "opp_2", etc
- emailId: use the first email ID from that provider
- type: "subscription" | "utility_bill" | "renewal" | "insurance" | "loan" | "credit_card" | "mortgage" | "flight_delay" | "debt_dispute" | "tax_rebate" | "overcharge" | "forgotten_subscription"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "other"
- title: short actionable title
- description: 2-3 sentences with specific UK consumer rights advice
- amount: GBP amount if visible in snippet, 0 if unknown
- confidence: 60-95
- provider: clean company name
- detected: "${new Date().toISOString().split('T')[0]}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_compensation" | "monitor"
- paymentAmount: amount if visible, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | null

Return ONLY the JSON array. No markdown fences. No explanation.`,
      messages: [{ role: 'user', content: `Find every financial opportunity from these ${senderMap.size} email providers:\n\n${providerList}` }],
    });

    let opportunities: any[] = [];
    let debugClaudeResponse = '';
    let debugParseError = '';
    const text = claudeRes.content[0];
    if (text.type === 'text') {
      let raw = text.text.trim();
      debugClaudeResponse = raw.substring(0, 1000);

      // Strip code fences
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

      // Find JSON array
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        // Clean common issues
        let cleaned = jsonMatch[0];
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1'); // trailing commas
        cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' '); // control characters
        cleaned = cleaned.replace(/\n/g, '\\n'); // unescape newlines in strings

        // Try parsing, if it fails try a more aggressive cleanup
        try {
          opportunities = JSON.parse(cleaned).map((o: any) => ({ ...o, status: 'new' }));
        } catch (e1) {
          // Try replacing problematic unicode
          try {
            cleaned = cleaned.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
            // Try to find each object individually
            const objects = cleaned.match(/\{[^{}]*\}/g) || [];
            for (const obj of objects) {
              try {
                const parsed = JSON.parse(obj.replace(/\\n/g, ' '));
                opportunities.push({ ...parsed, status: 'new' });
              } catch {
                // Skip malformed individual objects
              }
            }
            debugParseError = `Full parse failed, recovered ${opportunities.length} of ${objects.length} objects. Error: ${(e1 as Error).message}`;
          } catch (e2) {
            debugParseError = `Parse failed: ${(e1 as Error).message}`;
          }
        }
      } else {
        debugParseError = 'No JSON array found in response';
      }
    }

    if (!isAdmin) {
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    return NextResponse.json({
      opportunities,
      emailsFound,
      emailsScanned: emailDetails.length,
      opportunityCount: opportunities.length,
      providersFound: senderMap.size,
      debugClaudeResponse: isAdmin ? debugClaudeResponse : undefined,
      debugParseError: isAdmin ? debugParseError : undefined,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Gmail scan error:', err.message);
    return NextResponse.json({
      error: err.message || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
    }, { status: 500 });
  }
}
