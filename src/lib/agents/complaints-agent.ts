import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY not configured');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
- Gym/leisure debts: these are often unenforceable if no signed credit agreement exists, especially if service was cancelled
- Unfair contract terms: Consumer Rights Act 2015, Part 2 — terms must be fair and transparent

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
- Formal UK business letter format with date, addressee, subject line
- State facts chronologically and precisely (dates, amounts, reference numbers)
- Cite the exact legal provision violated
- State the specific remedy required (refund amount, service credit, etc.)
- Set a firm 14-day deadline for response
- State clearly which ombudsman/regulator you will contact if unresolved
- Professional tone, firm but never aggressive
- Only use [YOUR NAME], [YOUR ADDRESS], [YOUR PHONE NUMBER], [YOUR EMAIL], [YOUR ACCOUNT NUMBER] as placeholders if the user has NOT provided those details
- IMPORTANT: When the user provides feedback or revisions (e.g. "add my address as 123 High Street"), you MUST replace ALL matching placeholder text with the real details. Never leave a [PLACEHOLDER] in the letter if the user has given you that information. Remove the brackets entirely and insert the real value.

## JSON output format:
Return ONLY a JSON object with these exact keys:
- letter: the complete formal complaint letter as a string
- legalReferences: array of specific act/section strings cited
- estimatedSuccess: integer 0-100 based on strength of legal case (be honest — weak cases score 40-55, strong cases 70-85)
- nextSteps: array of 3-4 concrete action strings if no response
- escalationPath: string naming the specific ombudsman/regulator for this case`;

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

  const userPrompt = `Generate a formal ${input.letterType === 'hmrc_tax_rebate' ? 'letter' : input.letterType === 'council_tax_band' ? 'challenge letter' : 'complaint letter'} for the following situation:

${letterTypeContext ? `LETTER TYPE CONTEXT: ${letterTypeContext}\n` : ''}
Today's date (use this as the letter date): ${today}
${input.letterType === 'hmrc_tax_rebate' ? 'Addressed to' : 'Company'}: ${input.companyName}
Issue: ${issueDescription}
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
