import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
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
  const isAdmin = user.email === 'aireypaul@googlemail.com';

  if (!isAdmin) {
    // Free users get one-time scan, Essential gets monthly, Pro gets unlimited
    if (!usageCheck.allowed) {
      const message = plan.tier === 'free'
        ? 'You have used your free scan. Upgrade to Essential for monthly re-scans.'
        : 'Monthly scan limit reached. Upgrade to Pro for unlimited scans.';
      return NextResponse.json(
        { error: message, upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
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
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  const { data: tokenRow, error: tokenErr } = await admin
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (tokenErr || !tokenRow) {
    console.error('[gmail-scan] No gmail_tokens row:', tokenErr?.message);
    return NextResponse.json({ error: 'Gmail not connected. Please connect Gmail first.', opportunities: [] }, { status: 400 });
  }

  // Always refresh token (they expire every hour)
  let accessToken = tokenRow.access_token;
  if (tokenRow.refresh_token) {
    try {
      console.log('[gmail-scan] Refreshing access token...');
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await admin.from('gmail_tokens').update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      await admin.from('email_connections').update({ access_token: accessToken, token_expiry: newExpiry }).eq('user_id', user.id).eq('provider_type', 'google');
      console.log('[gmail-scan] Token refreshed OK');
    } catch (refreshErr: any) {
      console.error('[gmail-scan] Token refresh failed:', refreshErr.message);
      return NextResponse.json({ error: 'Gmail token refresh failed. Please reconnect Gmail.', opportunities: [] }, { status: 401 });
    }
  }

  try {
    const queries = [
      'subject:(bill OR invoice OR statement OR renewal OR subscription OR "direct debit" OR "price increase") newer_than:90d',
      'from:(netflix OR spotify OR disney OR amazon OR sky OR bt OR virgin OR vodafone OR ee OR three OR "british gas" OR eon OR octopus OR ovo OR edf OR talktalk OR plusnet) newer_than:90d',
    ];

    const allMessageIds = new Set<string>();
    for (const q of queries) {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        console.error(`[gmail-scan] Gmail API ${res.status}: ${await res.text().catch(() => '')}`);
        continue; // Skip this query, try the next one
      }
      const data = await res.json();
      for (const m of data.messages || []) allMessageIds.add(m.id);
    }

    console.log(`[gmail-scan] Found ${allMessageIds.size} message IDs`);
    const emailsFound = allMessageIds.size;

    if (emailsFound === 0) {
      return NextResponse.json({ opportunities: [], emailsFound: 0, emailsScanned: 0, message: 'No matching emails found' });
    }

    // Fetch details for max 40 emails (keeps it fast)
    const idsToFetch = Array.from(allMessageIds).slice(0, 40);
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
      if (g.subjects.length < 5) g.subjects.push(e.subject);
      if (g.snippets.length < 2) g.snippets.push(e.snippet.substring(0, 200));
      g.count++;
    }

    const providerList = Array.from(senderMap.values())
      .map((g, i) => `${i + 1}. From: ${g.from} (${g.count} emails)\n   Subjects: ${g.subjects.join(' | ')}\n   Snippets: ${g.snippets.join(' | ')}`)
      .join('\n');

    // Call Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are a UK consumer finance analyst. Analyse the email providers below and return a JSON array of financial opportunities.

For EVERY provider you recognise as financially relevant, create an entry.

Each entry must have:
- id: "opp_1", "opp_2", etc
- emailId: use the first email ID from that provider
- type: one of "subscription" | "utility_bill" | "renewal" | "insurance" | "loan" | "credit_card" | "mortgage" | "flight_delay" | "debt_dispute" | "tax_rebate" | "overcharge" | "forgotten_subscription" | "admin_task" | "price_alert"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "business" | "other"
- title: short actionable title
- description: 2-3 sentences with specific advice. Include UK consumer rights where relevant.
- amount: GBP amount if visible in snippet, 0 if unknown
- confidence: 60-95
- provider: clean company name
- detected: "${new Date().toISOString().split('T')[0]}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_compensation" | "create_task" | "monitor"
- paymentAmount: amount if visible, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | null

CRITICAL CATEGORISATION RULES:
- Skyscanner, Google Flights, Kayak price alerts are "price_alert" type, NOT "flight_delay". Only classify as flight_delay if the email is about an ACTUAL flight booking that was delayed.
- Companies House, HMRC confirmation statements, annual returns are "admin_task" type with suggestedAction "create_task". These are business compliance deadlines, not subscriptions.
- Marketing emails, newsletters, and promotional offers should be EXCLUDED unless they contain billing/subscription information.
- Booking confirmations (hotels, flights, car hire) are NOT subscriptions unless they clearly involve recurring payments.
- Only use "claim_compensation" for actual flight delays (not price alerts) or genuine overcharges.
- Use "create_task" for anything that requires an action but is not a financial product (filing deadlines, compliance tasks, account verification).

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

      // Find JSON array (also match truncated arrays without closing bracket)
      let jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Try to recover truncated response by adding closing bracket
        const truncatedMatch = raw.match(/\[[\s\S]*/);
        if (truncatedMatch) {
          // Find last complete object (ends with })
          const lastBrace = truncatedMatch[0].lastIndexOf('}');
          if (lastBrace > 0) {
            jsonMatch = [truncatedMatch[0].substring(0, lastBrace + 1) + ']'];
            debugParseError = 'Response was truncated, recovered partial array';
          }
        }
      }
      if (jsonMatch) {
        // Clean common issues
        let cleaned = jsonMatch[0];
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1'); // trailing commas

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

    console.log(`[gmail-scan] Claude returned ${opportunities.length} opportunities from ${emailDetails.length} emails. Parse issues: ${debugParseError || 'none'}`);

    if (!isAdmin) {
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    // Save opportunities to database for persistence
    if (opportunities.length > 0) {
      // Get existing opportunity titles to avoid duplicates
      const { data: existing } = await admin
        .from('tasks')
        .select('title')
        .eq('user_id', user.id)
        .eq('type', 'opportunity')
        .in('status', ['pending_review', 'in_progress']);

      const existingTitles = new Set((existing || []).map((t: any) => t.title));

      const newOpps = opportunities.filter((o: any) => !existingTitles.has(o.title));

      if (newOpps.length > 0) {
        await admin.from('tasks').insert(
          newOpps.map((o: any) => ({
            user_id: user.id,
            type: 'opportunity',
            title: o.title,
            description: JSON.stringify(o),
            provider_name: o.provider,
            status: 'pending_review',
            priority: o.confidence >= 80 ? 'high' : o.confidence >= 60 ? 'medium' : 'low',
          }))
        );
      }
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
