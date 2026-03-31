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
    if (plan.tier === 'free') {
      return NextResponse.json(
        { error: 'Inbox scanning is available on Essential and Pro plans. Upgrade to automatically find hidden subscriptions and savings.', upgradeRequired: true },
        { status: 403 }
      );
    }

    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: 'Monthly scan limit reached. Upgrade to Pro for unlimited scans.', upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
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
    const allMessageIds = new Set<string>();

    // Broad query — let Claude filter the relevant ones
    // We explicitly hunt for typical subscription receipts and flight delay keywords
    const queries = [
      'newer_than:1y',
      'flight delayed OR EU261 OR UK261 OR compensation OR easyjet OR ryanair OR british airways OR wizz air',
    ];

    const listResults = await Promise.allSettled(
      queries.map(async (q) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=80`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          console.error(`[gmail-scan] Gmail API ${res.status} for query: ${q.substring(0, 40)}...`);
          return [];
        }
        const data = await res.json();
        return data.messages || [];
      })
    );

    for (const r of listResults) {
      if (r.status === 'fulfilled') {
        for (const m of r.value) allMessageIds.add(m.id);
      }
    }

    console.log(`[gmail-scan] Found ${allMessageIds.size} message IDs`);
    const emailsFound = allMessageIds.size;

    if (emailsFound === 0) {
      return NextResponse.json({ opportunities: [], emailsFound: 0, emailsScanned: 0, message: 'No matching emails found' });
    }

    // Fetch details for max 15 emails in one parallel batch
    const idsToFetch = Array.from(allMessageIds).slice(0, 40);
    const emailDetails: Array<{ id: string; from: string; subject: string; date: string; snippet: string }> = [];

    const detailResults = await Promise.allSettled(
      idsToFetch.map(async (id) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const msg = await res.json();
        const hdrs = msg.payload?.headers || [];
        const get = (n: string) => hdrs.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
        return { id: msg.id, from: get('From'), subject: get('Subject'), date: get('Date'), snippet: msg.snippet || '' };
      })
    );
    for (const r of detailResults) {
      if (r.status === 'fulfilled' && r.value) emailDetails.push(r.value);
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
      .slice(0, 50) // Max 50 providers
      .map((g, i) => `${i + 1}. ${g.from} (${g.count}x): ${g.subjects.slice(0, 3).join(' | ')}`)
      .join('\n');

    // Call Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log(`[gmail-scan] Sending ${senderMap.size} providers to Claude Haiku for analysis`);

    const claudeRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: `You are a UK consumer finance analyst. Your job is to find EVERY financial opportunity in these emails. Be extremely aggressive — if an email is from ANY company or service, it is likely an opportunity.

IDENTIFY BY PATTERN:
- ANY email mentioning subscription, membership, plan, recurring payment = subscription opportunity
- ANY email mentioning bill, invoice, statement, balance, amount due, payment = bill tracking
- ANY email mentioning renewal, auto-renewal, contract end, "your plan" = renewal/switching opportunity
- ANY email mentioning price increase, tariff change, rate change, "new prices" = dispute opportunity
- ANY email mentioning direct debit, standing order, regular payment = financial tracking
- ANY email mentioning insurance, policy, cover, premium, excess = insurance comparison
- ANY email mentioning "flight delayed", "EU261", "UK261", "compensation", or airline names (EasyJet, Ryanair, British Airways, Wizz) = flight delay compensation opportunity (up to £520)
- ANY email mentioning loan, credit card, APR, interest rate = better rate opportunity
- ANY email mentioning council tax, HMRC, tax code = tax challenge opportunity
- ANY email from a gym, fitness, wellness provider = subscription review
- ANY email from streaming, software, cloud storage, app store, gaming = subscription review
- ANY email from utility company (gas, electricity, water, broadband, mobile, TV) = switching opportunity
- ANY email from bank, building society, lender = rate monitoring
- ANY email from retailer about warranty, guarantee, protection plan = consumer rights opportunity

RULES:
- Return at least one entry for EVERY unique company/service identified
- A normal UK inbox should produce 10-30+ opportunities. If fewer than 10, you are being too conservative
- Include anything with confidence >= 40
- Group by provider: multiple emails from same company = ONE opportunity

Each entry: {"id":"opp_1", "type":"subscription|utility_bill|renewal|insurance|loan|overcharge|refund_opportunity|flight_delay|debt_dispute|tax_rebate|price_increase|forgotten_subscription", "category":"streaming|software|fitness|broadband|mobile|utility|insurance|loan|credit_card|mortgage|council_tax|transport|food|shopping|other", "title":"short actionable title max 80 chars", "description":"2-3 sentences with UK consumer rights where relevant", "amount":0, "confidence":70, "provider":"Company Name", "status":"new", "suggestedAction":"track|cancel|switch_deal|dispute|monitor|claim_compensation|claim_refund", "paymentFrequency":"monthly|quarterly|yearly|one-time|null"}

Return ONLY the JSON array.`,
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
            status: o.confidence < 70 ? 'suggested' : 'pending_review',
            priority: o.confidence >= 80 ? 'high' : o.confidence >= 60 ? 'medium' : 'low',
          }))
        );
      }

      // Also save to scanned_receipts for the Scanner UI
      const today = new Date().toISOString().split('T')[0];
      await admin.from('scanned_receipts').insert(
        opportunities.map((o: any) => ({
          user_id: user.id,
          provider_name: o.provider || 'Unknown',
          receipt_type: o.category || o.type || 'other',
          amount: o.amount || 0,
          receipt_date: today,
          image_url: o.provider || 'scan',
          extracted_data: o,
        }))
      ).then(({ error: e }) => { if (e) console.error('[gmail-scan] scanned_receipts insert:', e.message); });
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
