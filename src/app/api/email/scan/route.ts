import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  scanEmailsViaImap,
  decryptPassword,
} from '@/lib/imap-scanner';
import { logClaudeCall } from '@/lib/claude-rate-limit';

function getAdminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
      password = decryptPassword(conn.imap_password_encrypted || conn.encrypted_password);
    } catch (err: any) {
      console.error('[email/scan] Decryption error:', err.message);
      return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 });
    }

    // Scan emails via IMAP
    console.log(`[email/scan] Scanning ${conn.email_address} via ${conn.imap_host}:${conn.imap_port}`);
    const emails = await scanEmailsViaImap(
      conn.imap_host,
      conn.imap_port,
      conn.email,
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
      system: `You are a UK consumer finance analyst. Your job is to find genuine financial opportunities — active subscriptions, recurring bills, price increases, and actionable consumer rights claims. Focus on ACCURACY over volume. Only flag emails that represent real ongoing financial commitments or actionable opportunities.

INCLUDE (genuine financial opportunities):
- Billing emails with amounts, payment dates, or invoice/account numbers
- Subscription confirmation or renewal emails showing recurring charges
- Price increase or tariff change notifications
- Direct debit or standing order setup/change confirmations
- Energy/broadband/insurance/mobile bills (switching opportunity)
- Flight delay or cancellation notifications (UK261 compensation up to £520)
- Debt collection or solicitor letters (dispute opportunity under Consumer Credit Act 1974)
- Loan/mortgage/credit card statements (rate comparison)
- Contract end date or notice period notifications
- Council tax band notifications (challenge opportunity)
- HMRC correspondence (potential tax rebate)

EXCLUDE (do NOT flag these — they are not financial opportunities):
- Marketing emails, newsletters, promotional offers, sales announcements
- One-time purchase order confirmations or shipping/delivery notifications
- Password reset, security alerts, verification codes, login notifications
- Social media notifications (likes, comments, follows, connection requests)
- Survey or feedback requests
- Welcome or onboarding emails that do NOT mention a billing amount or subscription
- Unsubscribe confirmations
- App update or feature announcement emails
- Account activity summaries that do not show specific charges
- Event invitations, calendar reminders, or meeting notifications
- Reward points / loyalty programme marketing (unless showing a charge)
- Referral or "invite a friend" emails

CONFIDENCE CALIBRATION:
- 85-100: Billing email with a visible £ amount, payment date, or invoice number
- 70-84: From a known subscription/utility provider AND subject mentions billing, payment, renewal, statement, or direct debit
- 55-69: Likely financial but details unclear (known provider but vague subject)
- Below 55: Do NOT include — insufficient evidence of a financial commitment

Return a JSON array. Each entry must have:
- id: unique string (e.g. "opp_1")
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase" | "loan" | "credit_card" | "insurance" | "utility_bill" | "refund_opportunity" | "flight_delay" | "debt_dispute" | "tax_rebate"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "gambling" | "other"
- title: short actionable title (max 80 chars)
- description: 2-3 sentences explaining what was found and what the user should do. Include specific UK consumer rights where relevant.
- amount: GBP amount if visible, 0 if unknown
- confidence: 55-100 (see calibration above)
- provider: company name (clean format)
- detected: "${today}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_refund" | "claim_compensation" | "monitor"
- contractEndDate: ISO date if found, null otherwise
- paymentAmount: exact amount if found, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | "one-time" | null
- accountNumber: reference number if found, null otherwise

IMPORTANT:
- Group emails by provider: if you see 5 emails from Netflix, create ONE opportunity for Netflix.
- Only include opportunities where you have genuine evidence of a financial commitment or actionable consumer right.
- For flight emails, only flag as delay compensation if the email mentions a delay, cancellation, or disruption — not routine booking confirmations.
- For debt collection emails, suggest a formal dispute response.
- For subscriptions over 1 year old with no recent billing email, flag for review.
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
          const parsed: OpportunityResult[] = JSON.parse(cleaned);
          opportunities = parsed.filter((o) => (o.confidence ?? 0) >= 55);
          console.log(`[email/scan] Found ${parsed.length} opportunities, ${opportunities.length} above confidence threshold`);
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
      opportunities = opportunities.filter((o) => !existingTitles.has(o.title) && (o.confidence ?? 0) >= 55);

      if (opportunities.length > 0) {
        const rows = opportunities.map((opp) => ({
          user_id: user.id,
          type: 'opportunity',
          title: opp.title,
          description: JSON.stringify(opp),
          provider_name: opp.provider,
          priority: opp.confidence >= 85 ? 'high' : opp.confidence >= 70 ? 'medium' : 'low',
          status: opp.confidence < 70 ? 'suggested' : 'pending_review',
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
