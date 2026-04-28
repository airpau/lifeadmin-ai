import Anthropic from '@anthropic-ai/sdk';
import { AI_LETTER_DISCLAIMER } from '@/lib/legal-disclaimer';

// Lazy singleton — defer construction to first call so Next.js build-time
// page-data collection doesn't throw when ANTHROPIC_API_KEY is absent in
// preview environments.
let _anthropic: Anthropic | undefined;
function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}
const anthropic = new Proxy({} as Anthropic, {
  get(_, prop) { return Reflect.get(getAnthropic(), prop, getAnthropic()); },
});

const COMPLAINTS_SYSTEM_PROMPT = `You are a professional UK consumer rights advocate and complaint letter writer. Your role is to help UK consumers write effective, legally-grounded formal complaint letters.

## UK Legislation to cite precisely:
- Consumer Rights Act 2015, s.9 — goods must be of satisfactory quality
- Consumer Rights Act 2015, s.10 — goods must be fit for purpose
- Consumer Rights Act 2015, s.11 — goods must match description
- Consumer Rights Act 2015, s.19 — right to reject faulty goods within 30 days; right to repair/replace after that
- Consumer Rights Act 2015, s.49 — services must be performed with reasonable care and skill
- Consumer Rights Act 2015, s.50 — services must match information given before contract
- Consumer Rights Act 2015, s.54-56 — right to price reduction or refund for substandard services
- Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 — 14-day cancellation right for distance/off-premises contracts
- Consumer Protection from Unfair Trading Regulations 2008 — prohibits misleading actions and omissions
- Equality Act 2010 — where discrimination is involved
- Energy sector: Gas Act 1986 / Electricity Act 1989, Ofgem Standards of Conduct
- Telecoms: Communications Act 2003, Ofcom General Conditions
- Financial services: Financial Services and Markets Act 2000, FCA Consumer Duty (July 2023)
- Debt recovery: Consumer Credit Act 1974, Financial Conduct Authority CONC (Consumer Credit sourcebook)
- Statute-barred debts: Limitation Act 1980, s.5 — debts become unenforceable after 6 years (5 in Scotland)
- Debt harassment: Protection from Harassment Act 1997 — creditors must not harass, threaten, or use deceptive practices
- Disputed debts: creditor must prove the debt exists and is owed by providing a signed credit agreement (Consumer Credit Act 1974, s.78)
- Default notices: Consumer Credit Act 1974, s.87-88 — creditor must serve valid default notice before taking enforcement action
- Unfair contract terms: Consumer Rights Act 2015, Part 2 — terms must be fair and transparent

IMPORTANT: Only cite legislation that is DIRECTLY relevant to the specific industry and issue type. Do NOT cite gym, fitness, or CMA guidance unless the dispute is specifically about a gym or fitness membership. Do NOT cite energy regulations for broadband disputes or vice versa.

## Regulatory escalation paths:
- Energy: Ofgem → Energy Ombudsman (after 8 weeks or deadlock letter)
- Telecoms: Ofcom → CISAS or Ombudsman Services: Communications
- Financial services: FCA → Financial Ombudsman Service
- General retail: Trading Standards → Consumer Ombudsman
- Public transport: Transport Focus → Transport Select Committee
- Debt collection: FCA → Financial Ombudsman Service (if regulated debt collector)
- Debt harassment: report to Trading Standards, complain to FCA, consider police report under Protection from Harassment Act

## Writing rules:
- CRITICAL: Include ALL specific details the user has provided. Names, dates, amounts, addresses, account numbers, reference numbers, email content they pasted. The letter must be specific to THEIR situation, not generic.
- Write as a natural, flowing letter that reads as if written by an intelligent human — NOT a template or legal document
- DO NOT use section headings, bold headers, or CAPS LOCK headings like "WHY THIS IS INADEQUATE" or "MY LEGAL RIGHTS". These make the letter feel robotic and AI-generated. Instead, use natural paragraph transitions
- DO NOT use bullet points or numbered lists in the letter body. Write in continuous prose with clear paragraphs
- The letter should feel like a well-written personal email or formal letter, not a legal brief
- Formal UK letter format: date, addressee, subject line (the subject line can be bold/caps, but nothing else)
- State facts chronologically in natural paragraphs
- Weave legal references naturally into sentences (e.g. "Under the Consumer Rights Act 2015, I am entitled to..." NOT a separate "LEGAL BASIS" section)
- State the specific remedy required and set a 14-day deadline
- Name the specific ombudsman/regulator as an escalation path
- Professional, firm but measured tone — never aggressive, never sycophantic
- The reader should not be able to tell this was written by AI
- Only use [YOUR NAME], [YOUR ADDRESS], [YOUR PHONE NUMBER], [YOUR EMAIL], [YOUR ACCOUNT NUMBER] as placeholders if the user has NOT provided those details
- IMPORTANT: When the user provides feedback or revisions, replace ALL matching placeholder text with the real details. Never leave a [PLACEHOLDER] if the user has given you that information.

## VOICE DIRECTION (overrides the writing rules above when set)

The user prompt may include a "VOICE" instruction. There are two:

### voice = consumer_to_merchant (default)
Write a formal complaint LETTER FROM THE CONSUMER TO THE MERCHANT.
Use first-person from the consumer's perspective: "I am writing to dispute…",
"Under the Consumer Rights Act 2015 I am entitled to…". Address it to the
merchant. Set a deadline. Name the regulator as the consumer's next step.
This is the existing Paybacker consumer-app behaviour. All consumer
call-sites get this voice; do NOT switch unless the user prompt says
otherwise.

### voice = business_to_customer
Write the RESPONSE A REGULATED UK BUSINESS SENDS TO A CUSTOMER who
has raised a dispute with them. Critical rules:
- ADDRESSED TO THE CUSTOMER. Open "Dear <customerName>" or "Hi
  <customerName>" depending on tone.
- SECOND PERSON. Refer to the customer as "you" and "your". Refer to the
  business as "we" and "our team". NEVER first-person from the customer
  ("I am writing to dispute…").
- ACKNOWLEDGE the dispute the customer has raised. Thank them for getting
  in touch. Take it seriously.
- EXPLAIN the UK consumer-law position calmly, citing the statute that
  applies. Do not lecture; just lay out how the law sees the situation.
- STATE WHAT THE BUSINESS WILL DO. If the customer is entitled to a
  remedy under UK law, say the business will provide it (refund, repair,
  rebooking, escalation to a senior handler, investigation timeline).
  If the position is more nuanced, say what the business will investigate
  and by when.
- NAME THE REGULATOR AS THE CUSTOMER'S ESCALATION OPTION ("If you remain
  unhappy after our final response, you can refer this to the Financial
  Ombudsman Service / Ofgem's Energy Ombudsman / Ofcom / CISAS / etc.").
  NOT as a threat — as a Consumer-Duty-compliant disclosure.
- TIMELINES. FCA-regulated firms have an 8-week final-response window;
  state that explicitly. Energy: SLC requires a deadlock letter or 8-week
  position before Ombudsman referral. Mention the relevant clock.
- NO COMPLAINT-LETTER OPENERS. Do not write "I am writing to dispute…"
  — that's the wrong voice direction.
- NO "[YOUR NAME]" / "[YOUR ADDRESS]" placeholders. The customer doesn't
  fill those in; the business signs off as the team handling the case.
- SIGN-OFF: "Kind regards, <Team Name>" or similar business sign-off,
  NOT a personal name. The caller's CRM substitutes the actual team
  name and contact details before sending.
- The "letter" output field still contains the prose. The
  agent_talking_points and customer_facing_response fields the B2B
  layer extracts will reflect this voice automatically.

## JSON output format:
Return ONLY a JSON object with these exact keys:
- letter: the complete formal complaint letter as a string
- legalReferences: array of specific act/section strings cited
- estimatedSuccess: integer 0-100 based on strength of legal case (be honest — weak cases score 40-55, strong cases 70-85)
- nextSteps: array of 3-4 concrete action strings if no response
- escalationPath: string naming the specific ombudsman/regulator for this case`;

/**
 * Letter voice direction.
 *
 * - `consumer_to_merchant` (default): the consumer engine. Output is a
 *   formal complaint letter written from the consumer to the merchant
 *   they're disputing — the shape the Paybacker consumer app has used
 *   in production for over a year. All existing call-sites get this
 *   voice unchanged.
 *
 * - `business_to_customer`: the B2B engine path. Output is the response
 *   a regulated UK business sends back to a customer who has raised a
 *   dispute. Addressed to the customer (second person), names the
 *   relevant statute and remedy, names the regulator only as the
 *   customer's escalation option, signs off in business voice ("we /
 *   our team") not personal voice. The B2B /v1/disputes route passes
 *   this voice; nothing else should.
 */
export type LetterVoice = 'consumer_to_merchant' | 'business_to_customer';

export interface ComplaintInput {
  companyName: string;
  issueDescription: string;
  desiredOutcome: string;
  amount?: string;
  accountNumber?: string;
  incidentDate?: string;
  previousContact?: string;
  feedback?: string;
  previousLetter?: string;
  letterType?: string;
  billContext?: string;
  threadContext?: string; // full correspondence thread for ongoing disputes
  verifiedLegalRefs?: string; // injected from legal_references table
  /**
   * Voice direction. Defaults to 'consumer_to_merchant' — the consumer
   * engine. B2B callers (src/lib/b2b/disputes.ts) pass
   * 'business_to_customer' to get a response addressed to the customer.
   */
  voice?: LetterVoice;
  /**
   * Customer's display name when voice='business_to_customer'.
   * Used in the salutation ("Dear <customerName>"). Ignored for
   * 'consumer_to_merchant' voice (the consumer flow uses companyName
   * as the addressee).
   */
  customerName?: string;
}

export interface ComplaintOutput {
  letter: string;
  legalReferences: string[];
  estimatedSuccess: number;
  nextSteps: string[];
  escalationPath: string;
  usage?: { input_tokens: number; output_tokens: number };
}

const COMPLAINT_MODEL = 'claude-sonnet-4-6';

export async function generateComplaintLetter(
  input: ComplaintInput
): Promise<ComplaintOutput> {
  // Token optimisation: truncate inputs to reduce API costs
  const issueDescription = input.issueDescription.slice(0, 1000);
  const previousContact = input.previousContact?.slice(0, 500);

  console.log(`[claude] model=${COMPLAINT_MODEL} route=complaints-agent/generateComplaintLetter`);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const LETTER_TYPE_CONTEXT: Record<string, string> = {
    complaint: 'General company complaint. Cite the Consumer Rights Act 2015 and any relevant sector-specific regulations.',
    energy_dispute: 'Energy bill dispute. Cite Ofgem Standards of Conduct, Gas Act 1986, Electricity Act 1989, Consumer Rights Act 2015 s49. Mention the right to escalate to the Energy Ombudsman after 8 weeks.',
    broadband_complaint: 'Broadband or mobile complaint. Cite Ofcom General Conditions, the right to exit penalty-free for undisclosed mid-contract price rises, and the Communications Act 2003.',
    flight_compensation: 'Flight delay/cancellation compensation claim under UK261 (retained EU261). Cite specific compensation amounts: £220 (short-haul), £350 (medium-haul), £520 (long-haul). Mention the 6-year claim window and CAA escalation.',
    parking_appeal: 'Private parking charge appeal. Cite the Protection of Freedoms Act 2012 (Schedule 4), BPA Code of Practice, and POPLA appeal rights. Challenge signage adequacy and proportionality of the charge.',
    debt_dispute: 'Debt dispute response. Cite the Consumer Credit Act 1974 s77-79 (right to request CCA agreement), Limitation Act 1980 (6-year statute barred rule), and FCA debt collection guidelines. Request proof of the debt.',
    refund_request: 'Formal refund request. Cite the Consumer Rights Act 2015 (30-day right to reject, 6-month repair or replace period), and Section 75 Consumer Credit Act for credit card purchases over £100.',
    hmrc_tax_rebate: 'HMRC tax rebate claim. This is a formal letter to HMRC, not a company complaint. Cite the relevant tax legislation and include NI number/UTR reference.',
    council_tax_band: 'Council tax band challenge. Address to the Valuation Office Agency (VOA). Cite the Local Government Finance Act 1992 and provide comparable property evidence.',
    dvla_vehicle: 'DVLA vehicle issue letter. Formal correspondence to DVLA.',
    nhs_complaint: 'NHS complaint. Follow NHS Complaints Procedure (The Local Authority Social Services and National Health Service Complaints Regulations 2009). Mention PALS and the Parliamentary and Health Service Ombudsman.',
  };

  const letterTypeContext = input.letterType ? LETTER_TYPE_CONTEXT[input.letterType] || '' : '';

  const voice: LetterVoice = input.voice ?? 'consumer_to_merchant';

  const voiceBlock = voice === 'business_to_customer'
    ? `VOICE: business_to_customer
You are writing as a regulated UK business RESPONDING TO a customer who has raised a dispute with us. Address the response TO ${input.customerName ?? 'the customer'} (second person — "you", "your"). Refer to the business as "we" / "our team". The dispute concerns a transaction or interaction with ${input.companyName}. Do NOT write a complaint letter from the customer to ${input.companyName}; write the business's response back to the customer. Apply the business_to_customer voice rules from the system prompt.`
    : `VOICE: consumer_to_merchant
Write a formal complaint letter from the consumer to ${input.companyName}. Apply the standard consumer letter rules.`;

  const userPrompt = `Generate a formal ${input.letterType === 'hmrc_tax_rebate' ? 'letter' : input.letterType === 'council_tax_band' ? 'challenge letter' : voice === 'business_to_customer' ? 'business response to a customer' : 'complaint letter'} for the following situation:

${voiceBlock}

${letterTypeContext ? `LETTER TYPE CONTEXT: ${letterTypeContext}\n` : ''}
Today's date (use this as the letter date): ${today}
${voice === 'business_to_customer' ? 'Customer raising the dispute' : input.letterType === 'hmrc_tax_rebate' ? 'Addressed to' : 'Company'}: ${voice === 'business_to_customer' ? (input.customerName ?? 'the customer') : input.companyName}
${voice === 'business_to_customer' ? `Subject of the dispute (third party — not the addressee): ${input.companyName}\n` : ''}Issue: ${issueDescription}
Desired Outcome: ${input.desiredOutcome}
${input.amount ? `Amount Involved: £${input.amount}` : ''}
${input.accountNumber ? `Account Number: ${input.accountNumber}` : ''}
${input.incidentDate ? `Incident Date: ${input.incidentDate}` : ''}
${previousContact ? `Previous Contact: ${previousContact}` : ''}
${input.billContext ? `\nUPLOADED BILL CONTEXT (use this as evidence in the letter): ${input.billContext}` : ''}
${input.feedback ? `\nUser has requested these changes to the letter: ${input.feedback}\nIMPORTANT: Apply these changes AND replace any remaining [PLACEHOLDER] text with the real details the user has now provided. Remove all square bracket placeholders where real information is available.` : ''}
${input.previousLetter ? `\nPrevious letter to revise (apply the changes above to this letter):\n${input.previousLetter}` : ''}
${input.threadContext || ''}

${input.threadContext ? 'IMPORTANT: This is a follow-up letter in an ongoing dispute. Reference the previous correspondence dates and key points. Open with "Further to my letter dated..." or "Following our correspondence regarding..." as appropriate. Build on the previous arguments and escalate the tone appropriately.' : ''}

${input.verifiedLegalRefs ? `\nRELEVANT UK CONSUMER LAW (verified against official sources):
${input.verifiedLegalRefs}

CRITICAL INSTRUCTION — You MUST ONLY cite the legal references provided above. Do NOT invent, guess, or hallucinate any statute names, section numbers, or legal provisions. If no relevant legal reference is provided for a particular point, state the consumer's position without citing specific legislation. If you are uncertain about a specific figure (like a compensation amount or time limit), use the phrase "you may be entitled to compensation under [scheme name]" rather than stating an incorrect figure. The legalReferences array in your JSON output MUST only contain entries from the list above.` : ''}

Return a JSON object only — no prose, no markdown fences. Keys: letter, legalReferences, estimatedSuccess, nextSteps, escalationPath.`;

  const message = await anthropic.messages.create({
    model: COMPLAINT_MODEL,
    max_tokens: 4096,
    system: COMPLAINTS_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON — strip markdown code fences if present
  let raw = content.text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const result = JSON.parse(jsonMatch[0]);

  // Disclaimer is shown on the web page UI only — not embedded in the letter text
  // See complaints/page.tsx for the UI disclaimer display

  return {
    letter: result.letter,
    legalReferences: result.legalReferences || [],
    estimatedSuccess: result.estimatedSuccess || 70,
    nextSteps: result.nextSteps || [],
    escalationPath: result.escalationPath || 'Contact relevant ombudsman',
    usage: {
      input_tokens: message.usage?.input_tokens || 0,
      output_tokens: message.usage?.output_tokens || 0,
    },
  };
}
