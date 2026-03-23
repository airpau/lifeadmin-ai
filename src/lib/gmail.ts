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

async function fetchEmailList(accessToken: string, query: string, maxResults = 100): Promise<GmailMessage[]> {
  const allMessages: GmailMessage[] = [];
  let pageToken: string | undefined;

  // Paginate through results to get up to maxResults
  while (allMessages.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, maxResults - allMessages.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error('Failed to fetch email list');
    const data = await res.json();

    if (data.messages) allMessages.push(...data.messages);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allMessages.slice(0, maxResults);
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
    // Extract useful content — strip HTML, keep up to 800 chars for better data extraction
    body: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
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

// Multiple focused queries run in parallel for comprehensive scanning.
// Query A: subject/keyword based (catches billing emails from any provider)
const SCAN_QUERY_SUBJECT =
  'subject:(bill OR invoice OR statement OR renewal OR "price increase" OR "price change" OR overdue OR "direct debit" OR subscription OR "payment failed" OR "payment due" OR "payment received" OR charge OR receipt OR "notice of" OR "important update" OR "your account" OR "action required" OR "outstanding balance" OR refund OR overcharge OR "final notice" OR "increased" OR "tariff" OR "your plan" OR "your membership" OR "annual review" OR "policy renewal" OR "mortgage" OR "loan" OR "credit card" OR "minimum payment" OR "balance" OR "interest rate" OR "fixed rate" OR "contract end" OR "leaving" OR "switching" OR "cancellation" OR "cancelled" OR "flight" OR "booking confirmation" OR "delay" OR "compensation" OR "council tax") newer_than:730d';

// Query B: sender-based — energy, telecoms, streaming
const SCAN_QUERY_SENDERS_1 = [
  'from:(britishgas OR edfenergy OR octopusenergy OR eon OR npower OR shell OR bulb OR sse OR scottishpower OR utilita OR ovo OR ecotricity OR "good energy" OR greenstar)',
  'from:(sky OR virginmedia OR bt OR talktalk OR vodafone OR o2 OR three OR ee OR plusnet OR smarty OR giffgaff OR lebara OR idmobile OR tesco OR "community fibre" OR hyperoptic OR zen)',
  'from:(netflix OR spotify OR amazon OR disney OR apple OR adobe OR microsoft OR google OR dropbox OR youtube OR dazn OR "now tv" OR paramount OR crunchyroll OR audible)',
].join(' OR ') + ' newer_than:730d';

// Query C: sender-based — finance, insurance, government
const SCAN_QUERY_SENDERS_2 = [
  'from:(barclays OR lloyds OR hsbc OR natwest OR monzo OR starling OR revolut OR halifax OR santander OR tsb OR nationwide OR "first direct" OR metro OR chase OR klarna OR clearpay)',
  'from:(council OR gov.uk OR hmrc OR dvla OR nhs OR "valuation office")',
  'from:(admiral OR aviva OR directline OR comparethemarket OR gocompare OR confused OR moneysupermarket OR "legal and general" OR zurich OR axa OR "many pets" OR "pet plan" OR hastings)',
  'from:(mortgage OR "halifax mortgage" OR "nationwide mortgage" OR skipton OR lendinvest OR "accord mortgages")',
].join(' OR ') + ' newer_than:730d';

// Query D: sender-based — fitness, food, software, transport
const SCAN_QUERY_SENDERS_3 = [
  'from:(puregym OR "david lloyd" OR "the gym" OR nuffield OR "anytime fitness" OR whoop OR peloton OR strava OR fitbit)',
  'from:(deliveroo OR "just eat" OR ubereats OR gousto OR "hello fresh" OR "mindful chef")',
  'from:(experian OR equifax OR "credit karma" OR openai OR anthropic OR github OR notion OR slack OR zoom OR canva OR figma)',
  'from:(trainline OR tfl OR "national rail" OR uber OR bolt OR "parking eye" OR aa OR rac)',
  'from:(ryanair OR easyjet OR "british airways" OR jet2 OR wizz OR tui OR booking OR airbnb)',
].join(' OR ') + ' newer_than:730d';

export async function scanEmailsForOpportunities(
  accessToken: string
): Promise<{ opportunities: Opportunity[]; emailsFound: number; emailsScanned: number }> {
  // Run all queries in parallel for comprehensive scanning
  // Scan up to 250 emails per query for thorough coverage (2 years of history)
  const [subjectMessages, senderMessages1, senderMessages2, senderMessages3] = await Promise.all([
    fetchEmailList(accessToken, SCAN_QUERY_SUBJECT, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_1, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_2, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_3, 250),
  ]);

  const seen = new Set<string>();
  const allMessages = [...subjectMessages, ...senderMessages1, ...senderMessages2, ...senderMessages3].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  if (!allMessages.length) return { opportunities: [], emailsFound: 0, emailsScanned: 0 };

  // Scan emails for comprehensive financial intelligence
  // Process in batches of 25 to avoid Gmail rate limits
  const batchSize = 25;
  const emailsToScan = allMessages.slice(0, 200);
  const allDetails: PromiseSettledResult<EmailData>[] = [];

  for (let i = 0; i < emailsToScan.length; i += batchSize) {
    const batch = emailsToScan.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((m) => fetchEmailDetail(accessToken, m.id))
    );
    allDetails.push(...results);
  }

  const details = allDetails;

  const emails = details
    .filter((r): r is PromiseFulfilledResult<EmailData> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Use Claude Haiku to analyse the emails (cost-efficient for categorisation)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { logClaudeCall } = await import('@/lib/claude-rate-limit');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const SCAN_MODEL = 'claude-sonnet-4-6';
  const allOpportunities: Opportunity[] = [];

  // Group emails by sender for efficient analysis
  const senderMap = new Map<string, { from: string; subjects: string[]; snippets: string[]; dates: string[]; bodies: string[]; emailIds: string[] }>();
  for (const e of emails) {
    const sender = (e.from || '').toLowerCase().replace(/<[^>]+>/, '').trim();
    const key = sender.substring(0, 50);
    if (!senderMap.has(key)) {
      senderMap.set(key, { from: e.from, subjects: [], snippets: [], dates: [], bodies: [], emailIds: [] });
    }
    const group = senderMap.get(key)!;
    group.subjects.push(e.subject);
    group.snippets.push(e.snippet);
    group.dates.push(e.date);
    group.bodies.push((e.body || '').substring(0, 200));
    group.emailIds.push(e.id);
  }

  // Build compact summary grouped by sender
  const senderSummary = Array.from(senderMap.entries())
    .map(([, group], i) => {
      const recentSubjects = group.subjects.slice(0, 5).join(' | ');
      const recentSnippet = group.snippets[0] || '';
      const recentBody = group.bodies[0] || '';
      return `--- Provider ${i + 1} (${group.emailIds.length} emails) ---\nFrom: ${group.from}\nRecent subjects: ${recentSubjects}\nLatest snippet: ${recentSnippet}\nLatest body excerpt: ${recentBody}\nDate range: ${group.dates[group.dates.length - 1]} to ${group.dates[0]}\nEmail ID: ${group.emailIds[0]}`;
    })
    .join('\n\n');

  console.log(`[gmail] Grouped ${emails.length} emails into ${senderMap.size} unique senders. Summary: ${senderSummary.length} chars`);

  logClaudeCall({
    userId: 'gmail-scan',
    route: '/api/gmail/scan (lib/gmail)',
    model: SCAN_MODEL,
    estimatedInputTokens: Math.round(senderSummary.length / 4) + 1000,
    estimatedOutputTokens: 4000,
  });

  // Single Claude call with grouped sender data
  {
    const chunk = senderSummary;

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
- emailId: the email id
- type: "overcharge" | "renewal" | "forgotten_subscription" | "price_increase" | "loan" | "credit_card" | "insurance" | "utility_bill" | "refund_opportunity" | "flight_delay" | "debt_dispute" | "tax_rebate"
- category: "streaming" | "software" | "fitness" | "broadband" | "mobile" | "utility" | "insurance" | "loan" | "credit_card" | "mortgage" | "council_tax" | "transport" | "food" | "shopping" | "gambling" | "other"
- title: short actionable title (max 80 chars)
- description: 2-3 sentences explaining what was found and what the user should do. Include specific UK consumer rights where relevant.
- amount: GBP amount if visible, 0 if unknown
- confidence: 0-100 (80+ = definitely from a known provider, 60-79 = likely financial, 40-59 = possible)
- provider: company name (clean format)
- detected: "${new Date().toISOString().split('T')[0]}"
- status: "new"
- suggestedAction: "track" | "cancel" | "switch_deal" | "dispute" | "claim_refund" | "claim_compensation" | "monitor"
- contractEndDate: ISO date if found, null otherwise
- paymentAmount: exact amount if found, null otherwise
- paymentFrequency: "monthly" | "quarterly" | "yearly" | "one-time" | null
- accountNumber: reference number if found, null otherwise

IMPORTANT:
- You MUST return at least one entry for every unique provider/service you can identify from the emails. A normal inbox should have 10-50+ opportunities.
- Group emails by provider: if you see 5 emails from Netflix, create ONE opportunity for Netflix.
- For flight bookings, always suggest checking for delay compensation.
- For debt collection emails, always suggest a formal dispute response.
- For any subscription over 1 year old, suggest reviewing if still needed.
- Include confidence >= 40. When in doubt, include it.
- Return ONLY the JSON array, no markdown, no explanation.`,
    messages: [{ role: 'user', content: `Analyse these emails:\n\n${chunk}` }],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    const raw = content.text.trim();
    console.log(`[gmail] Claude response: ${raw.length} chars. First 300: ${raw.substring(0, 300)}`);
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
        const parsed: Opportunity[] = JSON.parse(cleaned);
        console.log(`[gmail] Found ${parsed.length} opportunities`);
        allOpportunities.push(...parsed.map((o) => ({ ...o, status: 'new' as const })));
      } else {
        console.error(`[gmail] No JSON array in response. Starts with: ${raw.substring(0, 200)}`);
      }
    } catch (e) {
      console.error(`[gmail] Parse error:`, e);
    }
    }
  } // end chunks loop

  return { opportunities: allOpportunities, emailsFound: allMessages.length, emailsScanned: emails.length };
}
