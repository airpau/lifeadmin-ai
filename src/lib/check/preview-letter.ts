/**
 * Deterministic letter composition for the public /check funnel.
 *
 * Why this is not the Claude engine
 * ---------------------------------
 * `/check` is unauthenticated. Wiring `generateComplaintLetter` to an
 * open route would create a public, uncapped Anthropic endpoint: every
 * anonymous POST would be two potential Sonnet calls (the engine retries
 * once for citation completeness) at 10 to 20 seconds each. An IP rate
 * limit slows a single abuser down, it does not stop a distributed one,
 * and the B2B `/v1/disputes` route has already shown that the engine can
 * exceed the serverless timeout under load.
 *
 * So the public letter is composed here, in code, from:
 *   - the user's own words, sanitised and capped
 *   - the verified citations retrieved from `legal_references`
 *   - the escalation route for the sector
 *
 * That means the free letter is instant, costs nothing per request, and
 * cannot cite a statute we do not hold, because there is no generative
 * step to hallucinate one. It is a real, complete, sendable letter. What
 * an account adds is the Claude engine tailoring the argument to the
 * specifics, plus everything that happens after the letter is sent.
 */

import type { CheckCategory, ContactStage } from './categories';
import type { VerifiedCitation } from './citations';

export type LetterInput = {
  category: CheckCategory;
  providerName: string;
  description: string;
  desiredOutcome: string;
  amountGbp: number | null;
  accountRef: string;
  incidentDate: string;
  contactStage: ContactStage;
  evidenceLabels: string[];
  citations: VerifiedCitation[];
};

const MAX_DESCRIPTION = 1200;

/** House style: no em dashes in prose we author. */
function houseStyle(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ', ');
}

/**
 * Strip anything that would break a plain-text letter or let a
 * submission smuggle formatting into the output. Control characters go,
 * runs of blank lines collapse, length is capped.
 */
export function sanitiseUserText(input: string, max = MAX_DESCRIPTION): string {
  return (input ?? '')
    // Strips ASCII control characters while keeping tab and newline.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatIncident(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d);
}

function subjectLine(category: CheckCategory, amountGbp: number | null): string {
  const base: Record<string, string> = {
    energy_dispute: 'Formal complaint about incorrect energy charges',
    broadband_complaint: 'Formal complaint about my broadband service and charges',
    mobile_contract: 'Formal complaint about my mobile contract and charges',
    flight_compensation: 'Claim for compensation and expenses following a disrupted flight',
    refund_request: 'Formal request for a refund under UK consumer law',
    debt_dispute: 'Disputed account, request for proof and suspension of collection',
    insurance_dispute: 'Formal complaint about the handling of my claim',
    parking_appeal: 'Appeal against a parking charge notice',
    gym_membership: 'Formal complaint about cancellation and continued charges',
    council_tax_band: 'Challenge to the council tax banding of my property',
    hmrc_tax_rebate: 'Formal request for correction of my tax position',
    dvla_vehicle: 'Formal complaint regarding my vehicle record',
    nhs_complaint: 'Formal complaint under the NHS complaints procedure',
    complaint: 'Formal complaint and request for resolution',
  };
  const line = base[category.id] ?? base.complaint;
  return amountGbp && amountGbp > 0 ? `${line} (£${amountGbp.toFixed(2)})` : line;
}

/**
 * Present a stored statute summary as a standalone sentence.
 *
 * We deliberately do NOT try to bend the stored wording into a
 * subordinate clause. Summaries in `legal_references` vary: some read as
 * obligations ("Providers must give 30 days notice…"), others as
 * descriptions ("Primary legislation for telecoms regulation…"). Forcing
 * either shape into "under X, <clause>" produces a fragment for half of
 * them. Quoting the summary as its own sentence is always grammatical
 * and, more importantly, always faithful to what we actually hold.
 */
function toSentence(meaning: string): string {
  let s = houseStyle(meaning).trim().replace(/…$/, '');
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

/** Name a citation the way it should appear in prose. */
function citationName(c: { lawName: string; section: string | null }): string {
  return c.section ? `${c.lawName}, ${c.section}` : c.lawName;
}

export type ComposedLetter = {
  text: string;
  /** Citations actually named in the letter body, in order. */
  citedRefIds: string[];
};

export function composePreviewLetter(input: LetterInput, now: Date = new Date()): ComposedLetter {
  const {
    category,
    providerName,
    description,
    desiredOutcome,
    amountGbp,
    accountRef,
    incidentDate,
    contactStage,
    evidenceLabels,
    citations,
  } = input;

  const provider = sanitiseUserText(providerName, 120) || '[Provider name]';
  const body = sanitiseUserText(description);
  const ref = sanitiseUserText(accountRef, 60) || '[Your account or reference number]';
  const when = formatIncident(incidentDate);
  const outcome = houseStyle(sanitiseUserText(desiredOutcome, 240) || category.defaultOutcome);

  const parts: string[] = [];

  // Header. Formal UK letter order: date, addressee, reference, Re:,
  // then salutation. No sender postal address, per house rules on
  // privacy: the merchant identifies the customer by reference number.
  parts.push(formatDate(now));
  parts.push(provider + '\nCustomer Relations');
  parts.push(`Account or reference: ${ref}`);
  parts.push(`Re: ${subjectLine(category, amountGbp)}`);
  parts.push('Dear Sir or Madam,');

  // Opening: what this is and when it happened.
  const opener = when
    ? `I am writing to raise a formal complaint about a matter that arose on ${when}.`
    : 'I am writing to raise a formal complaint about the matter set out below.';
  parts.push(opener);

  // The user's own account, verbatim, because their facts are the case.
  if (body) parts.push(body);

  // Amount.
  if (amountGbp && amountGbp > 0) {
    parts.push(
      `The sum in dispute is £${amountGbp.toFixed(2)}. I am asking you to put that right rather than to acknowledge it in general terms.`,
    );
  }

  // Prior contact.
  if (contactStage === 'raised_waiting') {
    parts.push(
      'I have already raised this with you and have not received a substantive response. I am now putting the complaint in writing so that it is formally logged and the response period runs from this letter.',
    );
  } else if (contactStage === 'rejected') {
    parts.push(
      'I have raised this with you already and the response I received did not address the substance of my complaint. I am therefore setting out my position formally.',
    );
  } else if (contactStage === 'final_response') {
    parts.push(
      'I have received what you describe as your final response. I do not accept it, and I am setting out my position formally before taking this further.',
    );
  }

  // The legal ground. One sentence per verified citation, woven into
  // prose rather than bulleted, matching the house letter style.
  const cited: string[] = [];
  if (citations.length > 0) {
    const first = citations[0];
    parts.push(
      `The position I rely on is set out in ${citationName(first)}. ${toSentence(first.meaning)} On the facts above, that applies directly to my situation.`,
    );
    cited.push(first.id);

    const supporting = citations.slice(1, 3);
    if (supporting.length > 0) {
      const sentences = supporting.map((c) => {
        cited.push(c.id);
        return `${citationName(c)} is also relevant here. ${toSentence(c.meaning)}`;
      });
      parts.push(
        `${sentences.join(' ')} Taken together, these place the obligation on you rather than on me.`,
      );
    }
  } else {
    parts.push(
      'I am raising this on the facts and on the basis of the general obligations you owe me as a customer, including the obligation to treat me fairly and to provide the service you agreed to provide.',
    );
  }

  // Evidence.
  if (evidenceLabels.length > 0) {
    const items = evidenceLabels
      .map((l) => houseStyle(l).replace(/^I have (already )?/i, '').replace(/^I /, '').trim())
      .filter(Boolean);
    if (items.length > 0) {
      parts.push(
        `I hold the following in support of this complaint: ${items.join('; ')}. I will provide any of it on request.`,
      );
    }
  }

  // The ask, with a deadline.
  parts.push(
    `I am asking you to provide ${outcome}. Please confirm in writing within 14 days of the date of this letter what you intend to do.`,
  );

  // Escalation, including the 8 week clock where the sector has one.
  //
  // Uses `letterEscalation`, the phrase written to read correctly inside
  // a sentence. The `ombudsman` display label often contains a comma or
  // an "or" ("POPLA or the Independent Appeals Service") which turns into
  // nonsense mid-sentence, and naming both the citation's escalation body
  // and the category regulator produced "refer the matter to Ofcom and to
  // Ofcom" on the sectors where they are the same body.
  const bodyPhrase = category.letterEscalation;
  if (category.eightWeekClock) {
    parts.push(
      `If I do not receive a satisfactory response, or if this remains unresolved eight weeks after you receive this letter, I will refer the matter to ${bodyPhrase}. I would prefer to resolve it with you directly.`,
    );
  } else {
    parts.push(
      `If I do not receive a satisfactory response within that period, I will refer the matter to ${bodyPhrase}. I would prefer to resolve it with you directly.`,
    );
  }

  parts.push('Yours faithfully,');
  parts.push('[Your name]');

  return { text: parts.join('\n\n'), citedRefIds: cited };
}

/**
 * Case-specific next steps. Deterministic, derived from the category
 * metadata plus the answers given, so the list changes with the case
 * rather than being boilerplate.
 */
export function buildNextSteps(
  category: CheckCategory,
  contactStage: ContactStage,
  citations: VerifiedCitation[],
): string[] {
  const steps: string[] = [];

  steps.push(
    'Send the letter by email to the provider’s complaints address, and keep the sent copy. Email gives you a timestamp you can prove later.',
  );

  if (contactStage === 'final_response') {
    steps.push(
      `You already hold a final response, so you can go straight to ${category.ombudsman} if this letter does not move them.`,
    );
  } else if (category.eightWeekClock) {
    steps.push(
      `Diarise eight weeks from the day they receive it. At that point, whether or not they have replied, you can take the case to ${category.ombudsman}.`,
    );
  } else {
    steps.push(
      `Give them 14 days. If nothing useful comes back, the next step is ${category.ombudsman}.`,
    );
  }

  steps.push(
    'Reply to every response in writing, even a rejection. A paper trail is what an ombudsman reads, and a phone call leaves nothing behind.',
  );

  // Only worth saying when the citations point somewhere the steps above
  // have not already named, otherwise it repeats the ombudsman line.
  const alreadyNamed = `${category.ombudsman} ${category.regulator}`.toLowerCase();
  const escalators = Array.from(
    new Set(citations.map((c) => c.escalationBody).filter((x): x is string => !!x)),
  )
    .filter((e) => !alreadyNamed.includes(e.toLowerCase()))
    .slice(0, 2);
  if (escalators.length > 0) {
    steps.push(
      `The rules we matched to your case also name ${escalators.join(' and ')} as a route if the provider will not resolve it.`,
    );
  }

  for (const extra of category.extraSteps) steps.push(extra);

  return steps;
}
