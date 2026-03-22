const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// GOOGLE_REDIRECT_URI takes precedence — set this in Vercel when domain changes.
// Fallback: NEXT_PUBLIC_APP_URL (embedded at build time).
// Both must match an authorised redirect URI in Google Cloud Console.
function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  email: string;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = await res.json();

  // Get user's Gmail address
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userRes.json();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    email: userInfo.email,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw new Error('Failed to refresh token');
  return res.json();
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface EmailData {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}

async function fetchEmailList(accessToken: string, query: string, maxResults = 20): Promise<GmailMessage[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch email list');
  const data = await res.json();
  return data.messages || [];
}

async function fetchEmailDetail(accessToken: string, messageId: string): Promise<EmailData> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch message ${messageId}`);
  const msg = await res.json();

  const headers = msg.payload?.headers || [];
  const get = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  // Extract plain text body
  let body = '';
  const extractBody = (part: any): string => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.parts) {
      for (const p of part.parts) {
        const text = extractBody(p);
        if (text) return text;
      }
    }
    return '';
  };
  body = extractBody(msg.payload);

  return {
    id: msg.id,
    subject: get('Subject'),
    from: get('From'),
    date: get('Date'),
    snippet: msg.snippet || '',
    // Token optimisation: truncated to reduce API costs
    body: body.replace(/<[^>]+>/g, ' ').slice(0, 300),
  };
}

export interface Opportunity {
  id: string;
  type: 'overcharge' | 'renewal' | 'forgotten_subscription' | 'price_increase';
  title: string;
  description: string;
  amount: number;
  confidence: number;
  provider: string;
  detected: string;
  status: 'new';
  emailId: string;
}

// Two focused queries run in parallel — Gmail handles shorter queries more reliably than one giant OR.
// Query A: subject/keyword based (catches billing emails from any provider)
const SCAN_QUERY_SUBJECT =
  'subject:(bill OR invoice OR statement OR renewal OR "price increase" OR "price change" OR overdue OR "direct debit" OR subscription OR "payment failed" OR "payment due" OR "payment received" OR charge OR receipt OR "notice of" OR "important update" OR "your account" OR "action required" OR "outstanding balance" OR refund OR overcharge OR "final notice" OR "increased" OR "tariff") newer_than:730d';

// Query B: sender-based (catches emails from known billing domains)
const SCAN_QUERY_SENDERS = [
  'from:(britishgas OR edfenergy OR octopusenergy OR eon OR npower OR shell OR bulb OR sse OR scottishpower OR utilita)',
  'from:(sky OR virginmedia OR bt OR talktalk OR vodafone OR o2 OR three OR ee OR plusnet OR smarty)',
  'from:(netflix OR spotify OR amazon OR disney OR apple OR adobe OR microsoft OR google OR dropbox)',
  'from:(barclays OR lloyds OR hsbc OR natwest OR monzo OR starling OR revolut OR halifax OR santander OR tsb)',
  'from:(council OR gov.uk OR hmrc OR dvla OR nhs)',
  'from:(insurethebox OR admiral OR aviva OR directline OR comparethemarket OR gocompare OR confused)',
  'from:(aa OR rac OR greenflag OR breakdown)',
].join(' OR ') + ' newer_than:730d';

export async function scanEmailsForOpportunities(
  accessToken: string
): Promise<{ opportunities: Opportunity[]; emailsFound: number; emailsScanned: number }> {
  // Run both queries in parallel, deduplicate by message ID
  const [subjectMessages, senderMessages] = await Promise.all([
    fetchEmailList(accessToken, SCAN_QUERY_SUBJECT, 50),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS, 50),
  ]);

  const seen = new Set<string>();
  const allMessages = [...subjectMessages, ...senderMessages].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  if (!allMessages.length) return { opportunities: [], emailsFound: 0, emailsScanned: 0 };

  // Scan up to 50 emails for comprehensive financial intelligence
  const details = await Promise.allSettled(
    allMessages.slice(0, 50).map((m) => fetchEmailDetail(accessToken, m.id))
  );

  const emails = details
    .filter((r): r is PromiseFulfilledResult<EmailData> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Use Claude Haiku to analyse the emails (cost-efficient for categorisation)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { logClaudeCall } = await import('@/lib/claude-rate-limit');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const SCAN_MODEL = 'claude-haiku-4-5-20251001';
  const emailSummaries = emails
    .map((e, i) => `--- Email ${i + 1} (id: ${e.id}) ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}\nBody: ${e.body}`)
    .join('\n\n');

  logClaudeCall({
    userId: 'gmail-scan',
    route: '/api/gmail/scan (lib/gmail)',
    model: SCAN_MODEL,
    estimatedInputTokens: Math.round(emailSummaries.length / 4) + 500,
    estimatedOutputTokens: 1500,
  });

  const message = await anthropic.messages.create({
    model: SCAN_MODEL,
    max_tokens: 4096,
    system: `You are a UK consumer finance intelligence analyst. Your job is to extract EVERY piece of financial information from these emails to help the user save money.

Return a JSON array of opportunities. Each must have:
- id: unique string (e.g. "opp_1")
- emailId: the email id it came from
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase" | "loan" | "credit_card" | "insurance" | "utility_bill" | "refund_opportunity" | "flight_delay"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "gambling" | "other"
- title: short actionable title (max 80 chars)
- description: 2-3 sentences explaining what was found and what the user can do about it
- amount: GBP amount (number, 0 if unknown) — extract exact amounts from emails
- confidence: 0-100
- provider: company name (clean format, e.g. "British Gas" not "britishgas@email.britishgas.co.uk")
- detected: "${new Date().toISOString().split('T')[0]}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_refund" | "monitor"
- contractEndDate: ISO date string if found in email, null otherwise
- paymentAmount: exact payment amount if found, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | "one-time" | null
- accountNumber: account/reference number if found, null otherwise

Extract EVERYTHING from these emails:
- Active subscriptions (streaming, software, gym, SaaS) with exact amounts
- Utility bills (energy, water, broadband) with amounts and any price changes
- Loan statements, credit card statements with balances and payment amounts
- Insurance policies with renewal dates and premium amounts
- Flight bookings (check for delays — EU261/UK261 compensation up to £520)
- Price increase notifications — these are dispute opportunities
- Renewal reminders — chance to switch to a better deal
- Refund confirmations or outstanding refund requests
- Contract end date notifications
- Direct debit setup/change confirmations with amounts
- Any mention of account numbers, reference numbers, or contract terms

Confidence guide: 80+ = definite financial item, 60-79 = likely, 40-59 = possible.
Include everything with confidence >= 40.
Multiple entries per provider are fine if they represent different products/accounts.
Return ONLY the JSON array, no markdown.`,
    messages: [{ role: 'user', content: `Analyse these emails:\n\n${emailSummaries}` }],
  });

  const content = message.content[0];
  if (content.type !== 'text') return { opportunities: [], emailsFound: allMessages.length, emailsScanned: emails.length };

  try {
    const raw = content.text.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { opportunities: [], emailsFound: allMessages.length, emailsScanned: emails.length };
    const parsed: Opportunity[] = JSON.parse(jsonMatch[0]);
    const opportunities = parsed.map((o) => ({ ...o, status: 'new' as const }));
    return { opportunities, emailsFound: allMessages.length, emailsScanned: emails.length };
  } catch {
    return { opportunities: [], emailsFound: allMessages.length, emailsScanned: emails.length };
  }
}
