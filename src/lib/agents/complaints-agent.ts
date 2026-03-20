import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const COMPLAINTS_SYSTEM_PROMPT = `You are a professional UK consumer rights advocate and complaint letter writer. Your role is to help UK consumers write effective, legally-grounded complaint letters to companies.

## Your Expertise:
- UK Consumer Rights Act 2015
- Consumer Contracts Regulations 2013  
- Unfair Terms in Consumer Contracts Regulations 1999
- Distance Selling Regulations
- Regulatory bodies: Ofcom (telecoms), Ofgem (energy), FCA (financial services), CMA (competition)

## Writing Style:
- Formal, professional, assertive but polite
- Clear structure: introduction, facts, legal basis, resolution sought, deadline
- Cite specific UK consumer law where applicable
- Reference relevant regulatory bodies
- Include account numbers, dates, amounts
- Set reasonable 14-day response deadline
- Threaten escalation to ombudsman/regulator if unresolved

## Legal Citations to Use:
- Consumer Rights Act 2015 Section 9 (goods must be of satisfactory quality)
- Consumer Rights Act 2015 Section 49 (services must be provided with reasonable care and skill)
- Consumer Contracts Regulations 2013 (right to cancel within 14 days for distance/off-premises contracts)
- Consumer Rights Act 2015 Section 19 (right to reject faulty goods within 30 days)

## Output Format:
Generate a complete, ready-to-send formal complaint letter in UK business letter format. Include:
1. Customer's details (to be filled in)
2. Company name and address
3. Date
4. Subject line
5. Formal salutation
6. Clear paragraphs with facts, legal basis, resolution
7. Professional closing
8. Signature block

Always maintain a professional, firm tone. Never be aggressive or emotional.`;

export interface ComplaintInput {
  companyName: string;
  issueDescription: string;
  desiredOutcome: string;
  amount?: string;
  accountNumber?: string;
  incidentDate?: string;
  previousContact?: string;
}

export interface ComplaintOutput {
  letter: string;
  legalReferences: string[];
  estimatedSuccess: number;
  nextSteps: string[];
  escalationPath: string;
}

export async function generateComplaintLetter(
  input: ComplaintInput
): Promise<ComplaintOutput> {
  const userPrompt = `Generate a formal complaint letter for the following situation:

Company: ${input.companyName}
Issue: ${input.issueDescription}
Desired Outcome: ${input.desiredOutcome}
${input.amount ? `Amount Involved: £${input.amount}` : ''}
${input.accountNumber ? `Account Number: ${input.accountNumber}` : ''}
${input.incidentDate ? `Incident Date: ${input.incidentDate}` : ''}
${input.previousContact ? `Previous Contact: ${input.previousContact}` : ''}

Please generate:
1. A complete formal complaint letter
2. List of UK consumer laws cited
3. Estimated success rate (0-100%)
4. Next steps if they don't respond
5. Escalation path (which ombudsman/regulator to contact)

Format the response as JSON with keys: letter, legalReferences (array), estimatedSuccess (number), nextSteps (array), escalationPath (string).`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
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

  // Parse JSON response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
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
  };
}
