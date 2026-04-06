import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  scanEmailsViaImap,
  decryptPassword,
} from '@/lib/imap-scanner';
import { logClaudeCall } from '@/lib/claude-rate-limit';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin credentials not configured');
  return createAdmin(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { connectionId } = body as { connectionId?: string };
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    // Fetch connection (use admin to bypass RLS for encrypted_password)
    const admin = getAdminClient();
    const { data: conn, error: connErr } = await admin
      .from('email_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (connErr || !conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    if (conn.status !== 'active') {
      return NextResponse.json({ error: 'Connection is not active' }, { status: 400 });
    }

    // For OAuth connections (Google/Outlook), use their dedicated scan endpoints
    // These connections store plain-text OAuth tokens, not encrypted IMAP passwords
    if (conn.auth_method === 'oauth') {
      if (conn.provider_type === 'google') {
        // Proxy to Gmail scan which handles token refresh and Gmail API
        console.log('[email/scan] Redirecting Google OAuth connection to /api/gmail/scan');
        const gmailRes = await fetch(new URL('/api/gmail/scan', req.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '',
          },
        });
        const gmailData = await gmailRes.json();
        return NextResponse.json(gmailData, { status: gmailRes.status });
      }
      if (conn.provider_type === 'outlook') {
        console.log('[email/scan] Redirecting Outlook OAuth connection to /api/outlook/scan');
        const outlookRes = await fetch(new URL('/api/outlook/scan', req.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '',
          },
        });
        const outlookData = await outlookRes.json();
        return NextResponse.json(outlookData, { status: outlookRes.status });
      }
    }

    // IMAP connections — decrypt password
    let password: string;
    try {
      password = decryptPassword(conn.imap_password_encrypted);
    } catch (err: any) {
      console.error('[email/scan] Decryption error:', err.message);
      return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 });
    }

    // Scan emails via IMAP
    console.log(`[email/scan] Scanning ${conn.email_address} via ${conn.imap_host}:${conn.imap_port}`);
    const emails = await scanEmailsViaImap(
      conn.imap_host,
      conn.imap_port,
      conn.email_address,
      password,
      730,
    );

    console.log(`[email/scan] Found ${emails.length} financial emails`);

    if (emails.length === 0) {
      // Update last_scanned_at even if no results
      await admin
        .from('email_connections')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', connectionId);

      return NextResponse.json({ opportunities: [], emailsFound: 0, emailsScanned: 0 });
    }

    // Group emails by sender (same pattern as Gmail scanner)
    const senderMap = new Map<string, {
      from: string;
      subjects: string[];
      dates: string[];
      bodies: string[];
    }>();

    for (const e of emails) {
      const sender = (e.sender || '').toLowerCase().replace(/<[^>]+>/, '').trim();
      const key = sender.substring(0, 50);
      if (!senderMap.has(key)) {
        senderMap.set(key, { from: e.sender, subjects: [], dates: [], bodies: [] });
      }
      const group = senderMap.get(key)!;
      group.subjects.push(e.subject);
      group.dates.push(e.date);
      group.bodies.push((e.bodyPreview || '').substring(0, 200));
    }

    // Build compact summary grouped by sender
    const senderSummary = Array.from(senderMap.entries())
      .map(([, group], i) => {
        const recentSubjects = group.subjects.slice(0, 5).join(' | ');
        const recentBody = group.bodies[0] || '';
        return `--- Provider ${i + 1} (${group.subjects.length} emails) ---\nFrom: ${group.from}\nRecent subjects: ${recentSubjects}\nLatest body excerpt: ${recentBody}\nDate range: ${group.dates[group.dates.length - 1]} to ${group.dates[0]}`;
      })
      .join('\n\n');

    console.log(`[email/scan] Grouped ${emails.length} emails into ${senderMap.size} unique senders`);

    // Truncate if needed
    const truncatedSummary = senderSummary.length > 400000
      ? senderSummary.substring(0, 400000)
      : senderSummary;

    // Send to Claude for analysis (same prompt as Gmail scanner)
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const SCAN_MODEL = 'claude-sonnet-4-6';

    logClaudeCall({
      userId: user.id,
      route: '/api/email/scan',
      model: SCAN_MODEL,
      estimatedInputTokens: Math.round(truncatedSummary.length / 4) + 1000,
      estimatedOutputTokens: 4000,
    });

    const today = new Date().toISOString().split('T')[0];

    const message = await anthropic.messages.create({
      model: SCAN_MODEL,
      max_tokens: 4096,
      system: `You are a UK consumer finance analyst. Your job is to find EVERY financial opportunity in these emails. Be aggressive: if an email is from a known provider, that IS an opportunity.

CRITICAL: The sender email address and subject line are your primary signals. Even if the body is truncated, you can identify:
- Any email from Netflix, Spotify, Disney+, Amazon, Apple = active subscription (suggest tracking/cancelling if unused)
- Any email from BT, Sky, Virgin Media, Vodafone, EE, Three = broadband/mobile contract (suggest checking if overpaying)
- Any email from British Gas, EDF, Octopus, OVO, E.ON = energy bill (suggest switching if on standard variable tariff)
- Any email from an airline (Ryanair, easyJet, BA, Jet2, Wizz, TUI) = check for flight delay compensation under UK261 (up to £520 per person for delays over 3 hours)
- Any email from a debt collector or solicitor = suggest formal dispute response citing Consumer Credit Act 1974
- Any email mentioning "price increase", "new prices", "tariff change" = dispute opportunity
- Any email mentioning "renewal", "renewing", "contract end" = switching opportunity
- Any email from insurance companies = renewal comparison opportunity
- Any email from banks, loan companies, credit cards = track balances and suggest better rates
- Any email from councils = council tax band challenge opportunity
- Any email from HMRC = potential tax rebate opportunity

Return a JSON array. Each entry must have:
- id: unique string (e.g. "opp_1")
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase" | "loan" | "credit_card" | "insurance" | "utility_bill" | "refund_opportunity" | "flight_delay" | "debt_dispute" | "tax_rebate"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "gambling" | "other"
- title: short actionable title (max 80 chars)
- description: 2-3 sentences explaining what was found and what the user should do. Include specific UK consumer rights where relevant.
- amount: GBP amount if visible, 0 if unknown
- confidence: 0-100 (80+ = definitely from a known provider, 60-79 = likely financial, 40-59 = possible)
- provider: company name (clean format)
- detected: "${today}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_refund" | "claim_compensation" | "monitor"
- contractEndDate: ISO date if found, null otherwise
- paymentAmount: exact amount if found, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | "one-time" | null
- accountNumber: reference number if found, null otherwise

IMPORTANT:
- ONLY include genuine financial opportunities — subscriptions, bills, recurring payments, overcharges, compensation claims.
- DO NOT include personal emails, legal correspondence, court cases, solicitor letters, charity updates, newsletters, marketing emails, social media notifications, or anything that is NOT a financial product/service the user pays for.
- DO NOT include emails from: courts, tribunals, law firms, solicitors, police, crime services, charities, political organisations, schools, or community groups.
- Group emails by provider: if you see 5 emails from Netflix, create ONE opportunity for Netflix.
- For flight bookings, always suggest checking for delay compensation.
- For debt collection emails, always suggest a formal dispute response.
- For any subscription over 1 year old, suggest reviewing if still needed.
- Only include items with confidence >= 60. Quality over quantity — 5 accurate results beats 30 with false positives.
- Return ONLY the JSON array, no markdown, no explanation.`,
      messages: [
        { role: 'user', content: `Analyse these email providers and find financial opportunities:\n\n${truncatedSummary}` },
      ],
    });

    // Parse Claude response
    interface OpportunityResult {
      id: string;
      type: string;
      category?: string;
      title: string;
      description: string;
      amount: number;
      confidence: number;
      provider: string;
      detected: string;
      status: string;
      suggestedAction?: string;
      contractEndDate?: string | null;
      paymentAmount?: number | null;
      paymentFrequency?: string | null;
      accountNumber?: string | null;
      emailId?: string;
    }

    let opportunities: OpportunityResult[] = [];

    const content = message.content[0];
    if (content.type === 'text') {
      let raw = content.text.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
          opportunities = JSON.parse(cleaned);
          console.log(`[email/scan] Found ${opportunities.length} opportunities`);
        } catch (e) {
          console.error('[email/scan] JSON parse error:', e);
        }
      }
    }

    // Filter out opportunities that already exist in the database (even if dismissed)
    if (opportunities.length > 0) {
      const { data: existing } = await admin
        .from('tasks')
        .select('title')
        .eq('user_id', user.id)
        .eq('type', 'opportunity');
        
      const existingTitles = new Set((existing || []).map((t: any) => t.title));
      opportunities = opportunities.filter((o) => !existingTitles.has(o.title));

      if (opportunities.length > 0) {
        const rows = opportunities.map((opp) => ({
          user_id: user.id,
          type: 'opportunity',
          title: opp.title,
          description: JSON.stringify(opp),
          provider_name: opp.provider,
          priority: opp.confidence >= 80 ? 'high' : opp.confidence >= 60 ? 'medium' : 'low',
          status: 'pending_review',
          source: 'imap_scan',
        }));

        const { error: insertErr } = await admin.from('tasks').upsert(rows, {
          onConflict: 'user_id,title',
          ignoreDuplicates: true,
        });
        if (insertErr) {
          console.error('[email/scan] Task insert error:', insertErr);
        }
      }
    }

    // Update last_scanned_at
    await admin
      .from('email_connections')
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('id', connectionId);

    return NextResponse.json({
      opportunities: opportunities.map((o) => ({ ...o, status: 'new' })),
      emailsFound: emails.length,
      emailsScanned: senderMap.size,
    });
  } catch (err: any) {
    console.error('[email/scan] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}
