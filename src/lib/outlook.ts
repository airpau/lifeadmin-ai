const OUTLOOK_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
].join(' ');

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/microsoft`;
const TENANT = 'common'; // supports personal + work accounts

export function getMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: OUTLOOK_SCOPES,
    response_mode: 'query',
    state,
  });
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  email: string;
}> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    }
  );
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
  const tokens = await res.json();

  // Get user's email address
  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = await meRes.json();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    email: me.mail || me.userPrincipalName,
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        scope: OUTLOOK_SCOPES,
      }),
    }
  );
  if (!res.ok) throw new Error('Failed to refresh Microsoft token');
  return res.json();
}

interface OutlookMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
}

export async function scanOutlookForOpportunities(accessToken: string) {
  // Search for billing/subscription emails
  const filter = [
    "contains(subject,'bill')",
    "contains(subject,'invoice')",
    "contains(subject,'renewal')",
    "contains(subject,'subscription')",
    "contains(subject,'price increase')",
    "contains(subject,'statement')",
    "contains(subject,'overdue')",
    "contains(subject,'direct debit')",
  ].join(' or ');

  const params = new URLSearchParams({
    '$filter': filter,
    '$select': 'id,subject,from,receivedDateTime,bodyPreview,body',
    '$top': '30',
    '$orderby': 'receivedDateTime desc',
  });

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch Outlook messages');
  const data = await res.json();
  const messages: OutlookMessage[] = data.value || [];

  if (!messages.length) return [];

  // Use Claude Haiku to analyse (cost-efficient for categorisation)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { logClaudeCall } = await import('@/lib/claude-rate-limit');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const OUTLOOK_MODEL = 'claude-haiku-4-5-20251001';
  const emailSummaries = messages
    .slice(0, 15)
    .map(
      (m, i) =>
        // Token optimisation: truncated to reduce API costs
        `--- Email ${i + 1} (id: ${m.id}) ---\nFrom: ${m.from?.emailAddress?.address}\nSubject: ${m.subject}\nDate: ${m.receivedDateTime}\nPreview: ${m.bodyPreview}\nBody: ${m.body?.content?.replace(/<[^>]+>/g, ' ').slice(0, 300)}`
    )
    .join('\n\n');

  logClaudeCall({
    userId: 'outlook-scan',
    route: '/api/outlook/scan (lib/outlook)',
    model: OUTLOOK_MODEL,
    estimatedInputTokens: Math.round(emailSummaries.length / 4) + 500,
    estimatedOutputTokens: 1500,
  });

  const message = await anthropic.messages.create({
    model: OUTLOOK_MODEL,
    max_tokens: 2048,
    system: `You are a UK consumer finance assistant. Analyse emails and identify money-saving opportunities.
Return a JSON array of opportunities. Each must have:
- id: unique string
- emailId: the email id it came from
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase"
- title: short title (max 60 chars)
- description: 1-2 sentences explaining the opportunity
- amount: estimated GBP amount at risk or saveable (number, 0 if unknown)
- confidence: 0-100
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
    return JSON.parse(jsonMatch[0]).map((o: any) => ({ ...o, status: 'new' as const }));
  } catch {
    return [];
  }
}
