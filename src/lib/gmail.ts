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
    body: body.slice(0, 2000), // cap to keep prompts manageable
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

// UK bill/subscription providers to scan for
const SCAN_QUERY = [
  'from:(britishgas OR edf OR octopus OR eon OR npower OR bulb OR shell)',
  'from:(sky OR virginmedia OR bt.com OR talktalk OR vodafone OR ee.com OR o2.com OR three)',
  'from:(netflix OR spotify OR amazon OR adobe OR microsoft OR apple)',
  'subject:(bill OR invoice OR statement OR renewal OR "price increase" OR overdue OR "direct debit")',
].join(' OR ');

export async function scanEmailsForOpportunities(accessToken: string): Promise<Opportunity[]> {
  const messages = await fetchEmailList(accessToken, SCAN_QUERY, 30);
  if (!messages.length) return [];

  // Fetch up to 15 in parallel (rate limit friendly)
  const details = await Promise.allSettled(
    messages.slice(0, 15).map((m) => fetchEmailDetail(accessToken, m.id))
  );

  const emails = details
    .filter((r): r is PromiseFulfilledResult<EmailData> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Use Claude to analyse the emails
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const emailSummaries = emails
    .map((e, i) => `--- Email ${i + 1} (id: ${e.id}) ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}\nBody: ${e.body}`)
    .join('\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a UK consumer finance assistant. Analyse emails and identify money-saving opportunities.
Return a JSON array of opportunities. Each must have:
- id: unique string
- emailId: the email id it came from
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase"
- title: short title (max 60 chars)
- description: 1-2 sentences explaining the opportunity
- amount: estimated GBP amount at risk or saveable (number, 0 if unknown)
- confidence: 0-100 (how confident you are this is a real opportunity)
- provider: company name
- detected: today's date ${new Date().toISOString().split('T')[0]}
- status: "new"

Only include genuine opportunities with confidence >= 50. Return [] if none found.
Return ONLY the JSON array, no markdown.`,
    messages: [{ role: 'user', content: `Analyse these emails:\n\n${emailSummaries}` }],
  });

  const content = message.content[0];
  if (content.type !== 'text') return [];

  try {
    const raw = content.text.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed: Opportunity[] = JSON.parse(jsonMatch[0]);
    return parsed.map((o) => ({ ...o, status: 'new' as const }));
  } catch {
    return [];
  }
}
