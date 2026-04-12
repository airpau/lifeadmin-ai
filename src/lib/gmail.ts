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

  if (!res.ok) {
    let body: Record<string, string> = {};
    try { body = await res.json(); } catch { /* ignore */ }
    // access_denied / invalid_grant = token revoked or app was unverified
    const code = body.error ?? '';
    if (code === 'invalid_grant' || code === 'access_denied') {
      throw new Error('Gmail access revoked — please reconnect Gmail in the Scanner settings. This can happen if our app verification recently changed.');
    }
    throw new Error(`Failed to refresh Gmail token (${res.status}): ${body.error_description ?? body.error ?? 'unknown error'}`);
  }
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
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Gmail access denied (${res.status}) — token may be expired or revoked. Please reconnect Gmail.`);
      }
      throw new Error(`Failed to fetch email list (${res.status})`);
    }
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
    // Extract useful content — strip HTML, keep up to 1500 chars for better date/amount extraction
    body: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500),
  };
}

export interface Opportunity {
  id: string;
  emailId: string;
  type: 'subscription' | 'utility_bill' | 'renewal' | 'insurance' | 'loan' | 'overcharge' | 'refund_opportunity' | 'flight_delay' | 'debt_dispute' | 'tax_rebate' | 'price_increase' | 'forgotten_subscription' | 'upcoming_payment' | 'deal_expiry' | 'credit_card';
  category: 'streaming' | 'software' | 'fitness' | 'broadband' | 'mobile' | 'utility' | 'insurance' | 'loan' | 'credit_card' | 'mortgage' | 'council_tax' | 'transport' | 'food' | 'shopping' | 'gambling' | 'other';
  title: string;
  description: string;
  amount: number;
  confidence: number;
  provider: string;
  detected: string;
  status: 'new';
  suggestedAction: 'track' | 'cancel' | 'switch_deal' | 'dispute' | 'claim_refund' | 'claim_compensation' | 'monitor';
  contractEndDate: string | null;
  nextPaymentDate: string | null;
  paymentAmount: number | null;
  previousAmount: number | null;
  priceChangeDate: string | null;
  paymentFrequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time' | null;
  accountNumber: string | null;
  urgency: 'immediate' | 'soon' | 'routine';
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

// Query E: deal expirations, contract endings, renewal notices (HIGH PRIORITY)
const SCAN_QUERY_EXPIRATIONS =
  'subject:("contract end" OR "deal ending" OR "deal expires" OR "coming to an end" OR "out of contract" OR "minimum term" OR "fixed term" OR "renewal date" OR "auto-renew" OR "will renew" OR "renewing soon" OR "expires on" OR "expiring" OR "end date" OR "notice period" OR "30 days notice" OR "your tariff" OR "switching" OR "leaving us" OR "final month" OR "last chance") newer_than:365d';

// Query F: upcoming payments and payment reminders
const SCAN_QUERY_PAYMENTS =
  'subject:("payment due" OR "payment reminder" OR "upcoming payment" OR "next payment" OR "direct debit" OR "amount due" OR "will be charged" OR "will be debited" OR "scheduled payment" OR "payment date" OR "billing date" OR "your bill is ready" OR "new bill" OR "monthly bill" OR "quarterly bill" OR "annual payment") newer_than:180d';

// Query G: price increases and tariff changes
const SCAN_QUERY_PRICE_CHANGES =
  'subject:("price increase" OR "price change" OR "new prices" OR "price update" OR "tariff change" OR "rate increase" OR "going up" OR "increasing" OR "new rate" OR "updated price" OR "cost increase" OR "premium increase" OR "fee increase" OR "charges changing" OR "April price" OR "annual increase" OR "CPI" OR "RPI" OR "inflation") newer_than:365d';

export async function scanEmailsForOpportunities(
  accessToken: string
): Promise<{ opportunities: Opportunity[]; emailsFound: number; emailsScanned: number }> {
  // Run all queries in parallel for comprehensive scanning
  // Scan up to 250 emails per query for thorough coverage (2 years of history)
  const [subjectMessages, senderMessages1, senderMessages2, senderMessages3, expirationMessages, paymentMessages, priceChangeMessages] = await Promise.all([
    fetchEmailList(accessToken, SCAN_QUERY_SUBJECT, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_1, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_2, 250),
    fetchEmailList(accessToken, SCAN_QUERY_SENDERS_3, 250),
    fetchEmailList(accessToken, SCAN_QUERY_EXPIRATIONS, 100),
    fetchEmailList(accessToken, SCAN_QUERY_PAYMENTS, 100),
    fetchEmailList(accessToken, SCAN_QUERY_PRICE_CHANGES, 100),
  ]);

  const seen = new Set<string>();
  const allMessages = [...subjectMessages, ...senderMessages1, ...senderMessages2, ...senderMessages3, ...expirationMessages, ...paymentMessages, ...priceChangeMessages].filter((m) => {
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
    group.bodies.push((e.body || '').substring(0, 500));
    group.emailIds.push(e.id);
  }

  // Build compact summary grouped by sender — include multiple body excerpts for date/amount extraction
  const senderSummary = Array.from(senderMap.entries())
    .map(([, group], i) => {
      const recentSubjects = group.subjects.slice(0, 8).join(' | ');
      const recentSnippets = group.snippets.slice(0, 3).join('\n  ');
      const recentBodies = group.bodies.slice(0, 3).join('\n  ');
      return `--- Provider ${i + 1} (${group.emailIds.length} emails) ---\nFrom: ${group.from}\nRecent subjects: ${recentSubjects}\nSnippets:\n  ${recentSnippets}\nBody excerpts:\n  ${recentBodies}\nDates: ${group.dates.slice(0, 5).join(', ')}\nEmail ID: ${group.emailIds[0]}`;
    })
    .join('\n\n');

  console.log(`[gmail] Grouped ${emails.length} emails into ${senderMap.size} unique senders. Summary: ${senderSummary.length} chars`);

  // If summary is too long, truncate to fit within token limits
  const truncatedSummary = senderSummary.length > 400000 ? senderSummary.substring(0, 400000) : senderSummary;

  logClaudeCall({
    userId: 'gmail-scan',
    route: '/api/gmail/scan (lib/gmail)',
    model: SCAN_MODEL,
    estimatedInputTokens: Math.round(truncatedSummary.length / 4) + 1000,
    estimatedOutputTokens: 4000,
  });

  try {
    const today = new Date().toISOString().split('T')[0];
    const message = await anthropic.messages.create({
      model: SCAN_MODEL,
      max_tokens: 8192,
    system: `You are a UK consumer finance analyst scanning a user's inbox. Your job is to find EVERY financial opportunity. Today's date: ${today}.

## PRIORITY DETECTION CATEGORIES (extract dates and amounts wherever possible)

### 1. DEAL EXPIRATIONS & CONTRACT ENDINGS (highest value)
Look for: "contract end", "deal ending", "out of contract", "minimum term ending", "fixed rate ending", "renewal date", "expires", "auto-renew", "your deal", "tariff ending"
- Extract the EXACT END DATE if mentioned (e.g. "your deal ends on 15 March 2026" → contractEndDate: "2026-03-15")
- If already expired or ending within 30 days → confidence: 95, suggestedAction: "switch_deal"
- If ending within 90 days → confidence: 85, suggestedAction: "switch_deal"
- Common patterns: broadband contracts (18/24 month), energy fixed tariffs, mobile contracts, insurance policies

### 2. UPCOMING PAYMENTS & BILLS
Look for: "payment due", "amount due", "will be charged", "direct debit", "next payment", "your bill", "billing date", amounts like "£XX.XX"
- Extract EXACT AMOUNT (e.g. "Your next bill is £45.99" → paymentAmount: 45.99)
- Extract PAYMENT DATE if mentioned (e.g. "due on 1st April" → nextPaymentDate: "2026-04-01")
- Extract FREQUENCY from context (monthly direct debit → "monthly", annual renewal → "yearly")

### 3. PRICE INCREASES (dispute opportunity)
Look for: "price increase", "new prices from", "going up", "increasing by", "tariff change", "April price rise", "CPI", "RPI + 3.9%"
- Extract OLD and NEW amounts if both mentioned (e.g. "from £30 to £34" → previousAmount: 30, paymentAmount: 34)
- Extract INCREASE DATE (e.g. "from 1 April 2026" → priceChangeDate: "2026-04-01")
- These are HIGH VALUE — users can often negotiate or switch. UK Consumer Rights Act 2015 s.62 on unfair terms.

### 4. UNKNOWN SUBSCRIPTIONS (not caught by bank scans)
Look for: recurring emails from services that charge (newsletters with premium tiers, apps, cloud storage, gaming, SaaS tools, meal kits, beauty boxes)
- If same sender appears regularly with billing/receipt/payment subjects → likely active subscription
- Extract amount if visible in any email body

### 5. STANDARD DETECTION (as before)
- Streaming/software/fitness subscriptions → review if still needed
- Energy/broadband/mobile from known providers → switching opportunity
- Insurance emails → renewal comparison
- Airline emails → flight delay compensation (UK261, up to £520)
- Bank/lender emails → rate monitoring
- Council/HMRC emails → tax challenge opportunity
- Debt collector emails → dispute citing Consumer Credit Act 1974

## DATA EXTRACTION RULES
- ALWAYS try to extract amounts: look for £ signs, "GBP", numbers near "payment", "bill", "charge", "price", "cost", "fee", "premium"
- ALWAYS try to extract dates: look for DD/MM/YYYY, "1st January", "March 2026", "next month", relative dates
- For relative dates, calculate from today (${today})
- If a subject says "Your March 2026 bill - £45.99" → paymentAmount: 45.99, paymentFrequency: "monthly"
- If body mentions "£9.99/month" → paymentAmount: 9.99, paymentFrequency: "monthly"

## OUTPUT FORMAT
Return a JSON array. Each entry:
{
  "id": "opp_1",
  "emailId": "the_email_id",
  "type": "subscription|utility_bill|renewal|insurance|loan|overcharge|refund_opportunity|flight_delay|debt_dispute|tax_rebate|price_increase|forgotten_subscription|upcoming_payment|deal_expiry",
  "category": "streaming|software|fitness|broadband|mobile|utility|insurance|loan|credit_card|mortgage|council_tax|transport|food|shopping|gambling|other",
  "title": "short actionable title max 80 chars",
  "description": "2-3 sentences: what was found, exact dates/amounts, what user should do, UK consumer rights if relevant",
  "amount": 0,
  "confidence": 70,
  "provider": "Clean Company Name",
  "detected": "${today}",
  "status": "new",
  "suggestedAction": "track|cancel|switch_deal|dispute|claim_refund|claim_compensation|monitor",
  "contractEndDate": "YYYY-MM-DD or null",
  "nextPaymentDate": "YYYY-MM-DD or null",
  "paymentAmount": 45.99,
  "previousAmount": null,
  "priceChangeDate": "YYYY-MM-DD or null",
  "paymentFrequency": "monthly|quarterly|yearly|one-time|null",
  "accountNumber": "reference if found or null",
  "urgency": "immediate|soon|routine"
}

urgency values:
- "immediate": deal expired, payment overdue, price increase imminent (within 14 days)
- "soon": contract ending within 90 days, payment due within 30 days
- "routine": ongoing monitoring, subscription review

## RULES
- ONLY include genuine financial opportunities — subscriptions, bills, recurring payments, overcharges, compensation claims
- DO NOT include personal emails, legal correspondence, court cases, solicitor letters, charity updates, newsletters, marketing emails, social media notifications, or anything that is NOT a financial product/service the user pays for
- DO NOT include emails from: courts, tribunals, law firms, solicitors, barristers, police, crime services, dispute resolution services, charities, political organisations, schools, churches, community groups
- Group by provider: multiple emails from same company = ONE opportunity (use the most recent/relevant email data)
- Only include items with confidence >= 60. If you are not reasonably confident this is a genuine financial opportunity, exclude it.
- Quality over quantity — it is far better to return 5 accurate results than 30 results with false positives. Users lose trust when they see personal/irrelevant items.
- For deal expirations and price increases, ALWAYS include the extracted date even if approximate (e.g. "April 2026" → "2026-04-01")
- Return ONLY the JSON array, no markdown, no explanation.`,
    messages: [{ role: 'user', content: `Analyse these ${senderMap.size} email providers and find every financial opportunity. Extract all dates, amounts, and frequencies you can find:\n\n${truncatedSummary}` }],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    let raw = content.text.trim();
    console.log(`[gmail] Claude response: ${raw.length} chars. First 500: ${raw.substring(0, 500)}`);

    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    // Find JSON array
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
        const parsed: Opportunity[] = JSON.parse(cleaned);
        console.log(`[gmail] Found ${parsed.length} opportunities`);
        allOpportunities.push(...parsed.map((o) => ({ ...o, status: 'new' as const })));
      } catch (e) {
        console.error(`[gmail] JSON parse error:`, e);
      }
    } else {
      console.error(`[gmail] No JSON array found. Response: ${raw.substring(0, 300)}`);
    }
  }
  } catch (claudeErr: any) {
    console.error(`[gmail] Claude API error: ${claudeErr.message}`);
  }

  return { opportunities: allOpportunities, emailsFound: allMessages.length, emailsScanned: emails.length };
}
