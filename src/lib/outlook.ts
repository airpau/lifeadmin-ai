const OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
].join(' ');

const REDIRECT_URI = 'https://paybacker.co.uk/api/auth/callback/microsoft';
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
  refresh_token?: string;
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

// ---------- Opportunity type (shared with Gmail) ----------
export interface Opportunity {
  id: string;
  emailId: string;
  type: 'subscription' | 'utility_bill' | 'renewal' | 'insurance' | 'loan' | 'overcharge' | 'refund_opportunity' | 'flight_delay' | 'debt_dispute' | 'tax_rebate' | 'price_increase' | 'forgotten_subscription' | 'upcoming_payment' | 'deal_expiry' | 'credit_card' | 'bill' | 'contract' | 'dispute_response' | 'cancellation_confirmation' | 'bank_gap' | 'trial_expiry' | 'insurance_renewal' | 'dd_advance_notice' | 'government';
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

// ---------- Microsoft Graph helpers ----------
interface GraphMessage {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
}

interface EmailData {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}

/**
 * Fetch messages from Microsoft Graph using $search (KQL).
 * Graph $search requires ConsistencyLevel: eventual header.
 * Returns up to `maxResults` messages, following @odata.nextLink pagination.
 */
async function fetchMessagesBySearch(
  accessToken: string,
  kqlQuery: string,
  maxResults = 100
): Promise<GraphMessage[]> {
  const allMessages: GraphMessage[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/me/messages?` +
    new URLSearchParams({
      $search: `"${kqlQuery}"`,
      $select: 'id,subject,from,receivedDateTime,bodyPreview,body',
      $top: String(Math.min(50, maxResults)),
      $count: 'true',
    }).toString();

  while (url && allMessages.length < maxResults) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: 'eventual',
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[outlook] Graph search failed (${res.status}): ${errText.substring(0, 300)}`);
      break;
    }
    const data: { value?: GraphMessage[]; '@odata.nextLink'?: string } = await res.json();
    const msgs: GraphMessage[] = data.value || [];
    allMessages.push(...msgs);
    url = data['@odata.nextLink'] || null;
  }

  return allMessages.slice(0, maxResults);
}

/**
 * Alternative: fetch messages using $filter (OData) for sender-based queries.
 * $filter can't be combined with $search, so we use it separately.
 */
async function fetchMessagesByFilter(
  accessToken: string,
  filter: string,
  maxResults = 100
): Promise<GraphMessage[]> {
  const allMessages: GraphMessage[] = [];
  // 2-year lookback
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
  const dateFilter = `receivedDateTime ge ${twoYearsAgo}`;
  const fullFilter = `${dateFilter} and (${filter})`;

  let url: string | null =
    `https://graph.microsoft.com/v1.0/me/messages?` +
    new URLSearchParams({
      $filter: fullFilter,
      $select: 'id,subject,from,receivedDateTime,bodyPreview,body',
      $top: String(Math.min(50, maxResults)),
      $orderby: 'receivedDateTime desc',
    }).toString();

  while (url && allMessages.length < maxResults) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[outlook] Graph filter failed (${res.status}): ${errText.substring(0, 300)}`);
      break;
    }
    const data: { value?: GraphMessage[]; '@odata.nextLink'?: string } = await res.json();
    const msgs: GraphMessage[] = data.value || [];
    allMessages.push(...msgs);
    url = data['@odata.nextLink'] || null;
  }

  return allMessages.slice(0, maxResults);
}

/** Extract plain text body from a Graph message, stripping HTML. */
function extractBody(msg: GraphMessage): string {
  const raw = msg.body?.content || '';
  // Strip HTML tags, normalise whitespace, keep up to 1500 chars
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

/** Convert a GraphMessage to our normalised EmailData. */
function toEmailData(msg: GraphMessage): EmailData {
  return {
    id: msg.id,
    subject: msg.subject || '',
    from: msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '',
    date: msg.receivedDateTime || '',
    snippet: msg.bodyPreview || '',
    body: extractBody(msg),
  };
}

// ---------- Search queries (mirrors Gmail's 7 parallel queries) ----------

// Query A: subject/keyword based — catches billing emails from any provider
const KQL_SUBJECT =
  'subject:bill OR subject:invoice OR subject:statement OR subject:renewal OR subject:"price increase" OR subject:"price change" OR subject:overdue OR subject:"direct debit" OR subject:subscription OR subject:"payment failed" OR subject:"payment due" OR subject:charge OR subject:receipt OR subject:"action required" OR subject:refund OR subject:overcharge OR subject:"final notice" OR subject:tariff OR subject:"your plan" OR subject:mortgage OR subject:"credit card" OR subject:"contract end" OR subject:cancellation OR subject:compensation OR subject:"council tax"';

// Query B: sender-based — energy, telecoms, streaming (KQL from: syntax)
const KQL_SENDERS_1 =
  'from:britishgas OR from:edfenergy OR from:octopusenergy OR from:eon OR from:npower OR from:sse OR from:scottishpower OR from:ovo OR from:sky OR from:virginmedia OR from:bt OR from:talktalk OR from:vodafone OR from:o2 OR from:three OR from:ee OR from:plusnet OR from:giffgaff OR from:netflix OR from:spotify OR from:amazon OR from:disney OR from:apple OR from:adobe OR from:microsoft OR from:google OR from:dropbox OR from:youtube OR from:dazn';

// Query C: sender-based — finance, insurance, government
const KQL_SENDERS_2 =
  'from:barclays OR from:lloyds OR from:hsbc OR from:natwest OR from:monzo OR from:starling OR from:revolut OR from:halifax OR from:santander OR from:tsb OR from:nationwide OR from:chase OR from:klarna OR from:council OR from:hmrc OR from:dvla OR from:nhs OR from:admiral OR from:aviva OR from:directline OR from:comparethemarket OR from:moneysupermarket';

// Query D: sender-based — fitness, food, software, transport, airlines
const KQL_SENDERS_3 =
  'from:puregym OR from:davidlloyd OR from:nuffield OR from:deliveroo OR from:ubereats OR from:gousto OR from:hellofresh OR from:experian OR from:equifax OR from:openai OR from:anthropic OR from:github OR from:notion OR from:slack OR from:zoom OR from:trainline OR from:uber OR from:ryanair OR from:easyjet OR from:jet2 OR from:wizz OR from:tui OR from:booking OR from:airbnb';

// Query E: deal expirations, contract endings (HIGH PRIORITY)
const KQL_EXPIRATIONS =
  'subject:"contract end" OR subject:"deal ending" OR subject:"deal expires" OR subject:"out of contract" OR subject:"minimum term" OR subject:"fixed term" OR subject:"renewal date" OR subject:"auto-renew" OR subject:"will renew" OR subject:"renewing soon" OR subject:"expires on" OR subject:"end date" OR subject:"notice period" OR subject:"switching" OR subject:"leaving us"';

// Query F: upcoming payments and payment reminders
const KQL_PAYMENTS =
  'subject:"payment due" OR subject:"payment reminder" OR subject:"upcoming payment" OR subject:"next payment" OR subject:"direct debit" OR subject:"amount due" OR subject:"will be charged" OR subject:"scheduled payment" OR subject:"your bill is ready" OR subject:"new bill" OR subject:"monthly bill"';

// Query G: price increases and tariff changes
const KQL_PRICE_CHANGES =
  'subject:"price increase" OR subject:"price change" OR subject:"new prices" OR subject:"tariff change" OR subject:"rate increase" OR subject:"going up" OR subject:"increasing" OR subject:"new rate" OR subject:"cost increase" OR subject:"premium increase" OR subject:"annual increase" OR subject:CPI OR subject:RPI';

// Query H: free trial expiry (highest priority — auto-converts to paid)
const KQL_TRIALS =
  'subject:"trial ends" OR subject:"trial ending" OR subject:"trial expires" OR subject:"free trial" OR subject:"will be charged" OR subject:"upgrade to continue" OR subject:"after your trial" OR subject:"your trial"';

// Query I: insurance renewal notices
const KQL_INSURANCE =
  'subject:"renewal notice" OR subject:"policy renewal" OR subject:"your renewal" OR subject:"cover renewal" OR subject:"new premium" OR subject:"renews on" OR subject:"insurance renewal"';

// Query J: direct debit advance notices
const KQL_DD =
  'subject:"advance notice" OR subject:"direct debit" OR subject:"payment change" OR subject:"new direct debit" OR subject:"direct debit instruction"';

// Query K: HMRC and government correspondence
const KQL_GOVERNMENT =
  'from:hmrc.gov.uk OR from:gov.uk OR from:dvla.gov.uk OR from:nhs.uk OR subject:"self assessment" OR subject:"tax return" OR subject:"tax code" OR subject:"P60" OR subject:"P45" OR subject:"P800" OR subject:HMRC OR subject:DVLA OR subject:"council tax" OR subject:"student loan" OR subject:"MOT reminder"';

export async function scanOutlookForOpportunities(
  accessToken: string
): Promise<{ opportunities: Opportunity[]; emailsFound: number; emailsScanned: number }> {
  // Run all queries in parallel (same strategy as Gmail)
  console.log('[outlook] Starting comprehensive email scan (11 parallel queries)...');

  const [
    subjectMsgs, senderMsgs1, senderMsgs2, senderMsgs3,
    expirationMsgs, paymentMsgs, priceChangeMsgs,
    trialMsgs, insuranceMsgs, ddMsgs, governmentMsgs,
  ] = await Promise.all([
    fetchMessagesBySearch(accessToken, KQL_SUBJECT, 200),
    fetchMessagesBySearch(accessToken, KQL_SENDERS_1, 200),
    fetchMessagesBySearch(accessToken, KQL_SENDERS_2, 200),
    fetchMessagesBySearch(accessToken, KQL_SENDERS_3, 200),
    fetchMessagesBySearch(accessToken, KQL_EXPIRATIONS, 100),
    fetchMessagesBySearch(accessToken, KQL_PAYMENTS, 100),
    fetchMessagesBySearch(accessToken, KQL_PRICE_CHANGES, 100),
    fetchMessagesBySearch(accessToken, KQL_TRIALS, 100),
    fetchMessagesBySearch(accessToken, KQL_INSURANCE, 100),
    fetchMessagesBySearch(accessToken, KQL_DD, 100),
    fetchMessagesBySearch(accessToken, KQL_GOVERNMENT, 100),
  ]);

  // Deduplicate by message ID
  const seen = new Set<string>();
  const allMessages = [
    ...subjectMsgs, ...senderMsgs1, ...senderMsgs2, ...senderMsgs3,
    ...expirationMsgs, ...paymentMsgs, ...priceChangeMsgs,
    ...trialMsgs, ...insuranceMsgs, ...ddMsgs, ...governmentMsgs,
  ].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(`[outlook] Total unique messages: ${allMessages.length} (subject: ${subjectMsgs.length}, senders1: ${senderMsgs1.length}, senders2: ${senderMsgs2.length}, senders3: ${senderMsgs3.length}, expirations: ${expirationMsgs.length}, payments: ${paymentMsgs.length}, priceChanges: ${priceChangeMsgs.length})`);

  if (!allMessages.length) return { opportunities: [], emailsFound: 0, emailsScanned: 0 };

  // Convert to EmailData and extract bodies (Graph already returns body inline)
  const emails: EmailData[] = allMessages.slice(0, 200).map(toEmailData);

  // Group emails by sender for efficient Claude analysis (matches Gmail approach)
  const senderMap = new Map<string, {
    from: string;
    subjects: string[];
    snippets: string[];
    dates: string[];
    bodies: string[];
    emailIds: string[];
  }>();

  for (const e of emails) {
    const sender = (e.from || '').toLowerCase().trim();
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

  // Build compact summary grouped by sender (same format as Gmail)
  const senderSummary = Array.from(senderMap.entries())
    .map(([, group], i) => {
      const recentSubjects = group.subjects.slice(0, 8).join(' | ');
      const recentSnippets = group.snippets.slice(0, 3).join('\n  ');
      const recentBodies = group.bodies.slice(0, 3).join('\n  ');
      return `--- Provider ${i + 1} (${group.emailIds.length} emails) ---\nFrom: ${group.from}\nRecent subjects: ${recentSubjects}\nSnippets:\n  ${recentSnippets}\nBody excerpts:\n  ${recentBodies}\nDates: ${group.dates.slice(0, 5).join(', ')}\nEmail ID: ${group.emailIds[0]}`;
    })
    .join('\n\n');

  console.log(`[outlook] Grouped ${emails.length} emails into ${senderMap.size} unique senders. Summary: ${senderSummary.length} chars`);

  // Truncate if needed to fit within token limits
  const truncatedSummary = senderSummary.length > 400000 ? senderSummary.substring(0, 400000) : senderSummary;

  // Use Claude Sonnet for comprehensive analysis (same model and prompt as Gmail)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { logClaudeCall } = await import('@/lib/claude-rate-limit');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const SCAN_MODEL = 'claude-sonnet-4-6';
  const allOpportunities: Opportunity[] = [];

  logClaudeCall({
    userId: 'outlook-scan',
    route: '/api/outlook/scan (lib/outlook)',
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

### 5. FREE TRIAL EXPIRY (critical — auto-converts to paid)
Look for: "trial ends", "trial ending", "you'll be charged", "will be charged on", "trial expires", "trial period ends", "after your trial", "subscription begins"
- Extract the EXACT TRIAL END DATE and AMOUNT to be charged
- type: "trial_expiry", suggestedAction: "cancel", urgency: "immediate" if within 7 days

### 6. INSURANCE RENEWALS
Look for: "renewal notice", "policy renewal", "your premium", "your cover renews", "new premium from [date]"
- Extract OLD premium, NEW premium, RENEWAL DATE
- type: "insurance_renewal", suggestedAction: "switch_deal"
- UK tip: always compare before auto-renewing

### 7. DIRECT DEBIT ADVANCE NOTICES (Bacs)
Look for: "advance notice", "direct debit change", "new direct debit instruction"
- Extract PAYEE NAME, OLD AMOUNT, NEW AMOUNT, EFFECTIVE DATE
- type: "dd_advance_notice", urgency: "soon" if effective within 30 days

### 8. HMRC AND GOVERNMENT CORRESPONDENCE
Look for: emails from gov.uk, hmrc.gov.uk, dvla.gov.uk, nhs.uk, student finance, council
- Tax rebate opportunities: P800 overpayment → type: "tax_rebate", urgency: "immediate"
- Self Assessment deadlines → type: "government", urgency based on deadline
- DVLA renewals → type: "government", suggestedAction: "monitor"

### 9. STANDARD DETECTION
- Streaming/software/fitness subscriptions → review if still needed
- Energy/broadband/mobile from known providers → switching opportunity
- Airline emails → flight delay compensation (UK261, up to £520)
- Bank/lender emails → rate monitoring
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
  "type": "subscription|utility_bill|renewal|insurance|loan|overcharge|refund_opportunity|flight_delay|debt_dispute|tax_rebate|price_increase|forgotten_subscription|upcoming_payment|deal_expiry|trial_expiry|insurance_renewal|dd_advance_notice|government",
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
      console.log(`[outlook] Claude response: ${raw.length} chars. First 500: ${raw.substring(0, 500)}`);

      // Strip markdown code fences if present
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

      // Find JSON array
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
          const parsed: Opportunity[] = JSON.parse(cleaned);
          console.log(`[outlook] Found ${parsed.length} opportunities`);
          allOpportunities.push(...parsed.map((o) => ({ ...o, status: 'new' as const })));
        } catch (e) {
          console.error(`[outlook] JSON parse error:`, e);
        }
      } else {
        console.error(`[outlook] No JSON array found. Response: ${raw.substring(0, 300)}`);
      }
    }
  } catch (claudeErr: any) {
    console.error(`[outlook] Claude API error: ${claudeErr.message}`);
  }

  return { opportunities: allOpportunities, emailsFound: allMessages.length, emailsScanned: emails.length };
}
