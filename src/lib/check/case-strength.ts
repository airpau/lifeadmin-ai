/**
 * Case strength scoring for the public /check funnel.
 *
 * Design rule: the number must be defensible. It is NOT a prediction of
 * whether the user wins, and nothing in this module models outcomes. It
 * scores six concrete, observable things about the submission:
 *
 *   1. Do we hold verified UK law for this category, from an official
 *      source, that we can actually cite. This is the heaviest signal
 *      because a complaint with no legal grounding is just a letter.
 *   2. Is the provider named.
 *   3. Is the disputed amount known.
 *   4. Is the problem still inside the relevant time window.
 *   5. How much supporting evidence the user says they hold.
 *   6. Whether the provider has been given a chance to put it right,
 *      which every ombudsman requires before it will look at a case.
 *
 * Two hard caps keep the output honest:
 *   - no verified citation for the category caps the score at 40
 *   - a problem outside the relevant time window caps the score at 45
 *
 * Every signal returns the points it earned, the points available, and a
 * plain-English line telling the user how to improve it. The UI renders
 * that breakdown in full, so the score is never a black box.
 */

import type { CheckCategory, ContactStage } from './categories';

export type SignalStatus = 'met' | 'partial' | 'missing' | 'warning';

export type StrengthSignal = {
  id: string;
  label: string;
  status: SignalStatus;
  points: number;
  max: number;
  /** Shown under the signal row. Present tense, plain English. */
  detail: string;
  /** Populated when the signal is not fully met. Feeds "what would strengthen this". */
  improvement?: string;
};

export type StrengthBand = 'needs_detail' | 'worth_pursuing' | 'solid' | 'strong';

export type CaseStrength = {
  score: number;
  band: StrengthBand;
  bandLabel: string;
  headline: string;
  signals: StrengthSignal[];
  improvements: string[];
  /** Set when a cap was applied, so the UI can explain the ceiling. */
  cap?: { reason: string; ceiling: number };
};

export type StrengthInput = {
  category: CheckCategory;
  /** Number of verified citations we could actually source for this case. */
  verifiedCitationCount: number;
  providerName: string;
  amountGbp: number | null;
  /** ISO date string (yyyy-mm-dd) or empty. */
  incidentDate: string;
  evidenceIds: string[];
  contactStage: ContactStage;
  descriptionLength: number;
  /** Injected in tests. Defaults to now. */
  now?: Date;
};

const BAND_LABELS: Record<StrengthBand, string> = {
  needs_detail: 'Needs more detail',
  worth_pursuing: 'Worth pursuing',
  solid: 'Solid case',
  strong: 'Strong case',
};

const BAND_HEADLINES: Record<StrengthBand, string> = {
  needs_detail:
    'There is probably something here, but as it stands the letter would be thin. Fill in the gaps below and it gets a lot harder to brush off.',
  worth_pursuing:
    'This is worth putting in writing. A few more specifics would make it considerably harder for the provider to send you a standard refusal.',
  solid:
    'This is a well-formed complaint. You have named law, a named provider and enough detail for the provider to have to engage with it properly.',
  strong:
    'This is about as well-evidenced as a consumer complaint gets before it goes to an ombudsman. Everything the provider needs in order to act is in front of them.',
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function calculateCaseStrength(input: StrengthInput): CaseStrength {
  const now = input.now ?? new Date();
  const signals: StrengthSignal[] = [];

  // ---------------------------------------------------------------------
  // 1. Verified law we can cite (max 30)
  // ---------------------------------------------------------------------
  const refs = input.verifiedCitationCount;
  let lawPoints = 0;
  let lawStatus: SignalStatus = 'missing';
  let lawDetail: string;
  let lawImprovement: string | undefined;
  if (refs >= 3) {
    lawPoints = 30;
    lawStatus = 'met';
    lawDetail = `We hold ${refs} verified rules for this type of dispute, each retrieved from an official UK source.`;
  } else if (refs === 2) {
    lawPoints = 24;
    lawStatus = 'met';
    lawDetail = 'We hold two verified rules for this type of dispute, both retrieved from official UK sources.';
  } else if (refs === 1) {
    lawPoints = 16;
    lawStatus = 'partial';
    lawDetail = 'We hold one verified rule for this type of dispute, retrieved from an official UK source.';
    lawImprovement =
      'Adding more detail about what went wrong may let us match further rules that also apply to your case.';
  } else {
    lawPoints = 0;
    lawStatus = 'missing';
    lawDetail =
      'We do not currently hold a verified citation that matches this case. We will not invent one, so the letter below argues the facts without naming a statute.';
    lawImprovement =
      'Try a more specific category, or add detail about the sector and the exact thing that went wrong so we can match a verified rule.';
  }
  signals.push({
    id: 'verified_law',
    label: 'Verified UK law on your side',
    status: lawStatus,
    points: lawPoints,
    max: 30,
    detail: lawDetail,
    improvement: lawImprovement,
  });

  // ---------------------------------------------------------------------
  // 2. Named provider (max 12)
  // ---------------------------------------------------------------------
  const provider = input.providerName.trim();
  signals.push({
    id: 'provider',
    label: 'A named provider',
    status: provider.length >= 2 ? 'met' : 'missing',
    points: provider.length >= 2 ? 12 : 0,
    max: 12,
    detail: provider.length >= 2
      ? `The complaint is addressed to ${provider}, so it can be logged against a real account and a real complaints process.`
      : 'The complaint has no named provider, so it cannot be addressed to a complaints team or escalated later.',
    improvement: provider.length >= 2 ? undefined : 'Name the company or body you are disputing with.',
  });

  // ---------------------------------------------------------------------
  // 3. Known amount (max 10)
  // ---------------------------------------------------------------------
  const amount = input.amountGbp;
  const hasAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  signals.push({
    id: 'amount',
    label: 'A quantified loss',
    status: hasAmount ? 'met' : 'missing',
    points: hasAmount ? 10 : 0,
    max: 10,
    detail: hasAmount
      ? `You are asking for a specific sum, £${amount!.toFixed(2)}. A specific figure is far harder to answer with a goodwill gesture.`
      : 'No amount is stated, so the provider is free to answer with an apology rather than money.',
    improvement: hasAmount
      ? undefined
      : 'Work out what you are actually out of pocket, even approximately, and state it as a figure.',
  });

  // ---------------------------------------------------------------------
  // 4. Time limits (max 20)
  // ---------------------------------------------------------------------
  const incident = parseDate(input.incidentDate);
  const limitDays = input.category.primaryLimitDays;
  let timePoints = 8;
  let timeStatus: SignalStatus = 'partial';
  let timeDetail =
    'You have not told us when this happened, so we cannot check it against the time limit for this type of case.';
  let timeImprovement: string | undefined =
    'Add the date the problem happened. Every redress route has a deadline and it is the most common reason a good case gets refused.';
  let outsideWindow = false;

  if (incident) {
    const age = daysBetween(now, incident);
    if (age < 0) {
      timePoints = 8;
      timeStatus = 'partial';
      timeDetail = 'The date you gave is in the future, so we have not scored the time limit.';
      timeImprovement = 'Check the date and re-run the check.';
    } else if (age > limitDays) {
      timePoints = 0;
      timeStatus = 'warning';
      outsideWindow = true;
      timeDetail = `This happened about ${Math.round(age / 30)} months ago, which is outside the usual window for this type of case. ${input.category.primaryLimitLabel}`;
      timeImprovement =
        'Write anyway if you have a reason for the delay, such as only finding out recently, and say what that reason is. Some schemes will accept a late case on those grounds.';
    } else if (age > limitDays * 0.8) {
      timePoints = 14;
      timeStatus = 'partial';
      timeDetail = `You are inside the window but close to the end of it. ${input.category.primaryLimitLabel}`;
      timeImprovement = 'Send this soon. You are near the deadline for this type of case.';
    } else {
      timePoints = 20;
      timeStatus = 'met';
      timeDetail = `You are comfortably inside the window. ${input.category.primaryLimitLabel}`;
      timeImprovement = undefined;
    }
  }
  signals.push({
    id: 'time_limit',
    label: 'Inside the time limit',
    status: timeStatus,
    points: timePoints,
    max: 20,
    detail: timeDetail,
    improvement: timeImprovement,
  });

  // ---------------------------------------------------------------------
  // 5. Evidence (max 16)
  // ---------------------------------------------------------------------
  const evidenceCount = input.evidenceIds.length;
  const evidencePoints = evidenceCount >= 3 ? 16 : evidenceCount === 2 ? 12 : evidenceCount === 1 ? 6 : 0;
  const missingEvidence = input.category.evidence
    .filter((e) => !input.evidenceIds.includes(e.id))
    .slice(0, 3)
    .map((e) => e.label.replace(/^I have (already )?/i, '').replace(/^I /, ''));
  signals.push({
    id: 'evidence',
    label: 'Supporting evidence',
    status: evidenceCount >= 3 ? 'met' : evidenceCount >= 1 ? 'partial' : 'missing',
    points: evidencePoints,
    max: 16,
    detail: evidenceCount === 0
      ? 'You have not confirmed any supporting documents. A complaint with nothing behind it is easy to refuse.'
      : `You hold ${evidenceCount} of the ${input.category.evidence.length} things that usually matter for this type of case.`,
    improvement: evidenceCount >= 3 || missingEvidence.length === 0
      ? undefined
      : `Gather what you can of: ${missingEvidence.join('; ')}. Attach it and reference it in the letter.`,
  });

  // ---------------------------------------------------------------------
  // 6. Provider given a chance to fix it (max 12)
  // ---------------------------------------------------------------------
  let contactPoints = 4;
  let contactStatus: SignalStatus = 'partial';
  let contactDetail =
    'You have not raised this with the provider yet. That is fine, this letter is the right first step, and the clock to the ombudsman only starts once they have it.';
  let contactImprovement: string | undefined =
    'Send the letter and log the date. No ombudsman will look at a case the provider has not had a chance to answer.';

  if (input.contactStage === 'raised_waiting') {
    contactPoints = 12;
    contactStatus = 'met';
    contactDetail =
      'You have already raised it, so the provider is on notice and the response clock is running.';
    contactImprovement = undefined;
  } else if (input.contactStage === 'rejected') {
    contactPoints = 12;
    contactStatus = 'met';
    contactDetail =
      'They have rejected it, which means you have a position on record to argue against rather than a blank page.';
    contactImprovement = undefined;
  } else if (input.contactStage === 'final_response') {
    contactPoints = 12;
    contactStatus = 'met';
    contactDetail =
      'You have a final response or deadlock letter, which is normally the key that unlocks the independent redress route.';
    contactImprovement = undefined;
  }
  signals.push({
    id: 'engagement',
    label: 'The provider has been given a chance',
    status: contactStatus,
    points: contactPoints,
    max: 12,
    detail: contactDetail,
    improvement: contactImprovement,
  });

  // ---------------------------------------------------------------------
  // Total, caps, band
  // ---------------------------------------------------------------------
  let score = signals.reduce((sum, s) => sum + s.points, 0);
  let cap: CaseStrength['cap'];

  if (refs === 0 && score > 40) {
    cap = {
      ceiling: 40,
      reason:
        'We hold no verified citation for this case, so we have capped the score. We would rather tell you that than show you a confident number built on a statute we made up.',
    };
    score = 40;
  } else if (outsideWindow && score > 45) {
    cap = {
      ceiling: 45,
      reason:
        'This looks to be outside the usual time limit for this type of case, so we have capped the score. It can still be worth writing, but expect the deadline to be raised.',
    };
    score = 45;
  }

  // A very short description cannot support a high score, whatever else
  // is ticked, because the letter has nothing concrete to work with.
  if (input.descriptionLength < 40 && score > 55) {
    cap = {
      ceiling: 55,
      reason:
        'Your description is very short, so we have capped the score. Add the specifics, what happened, when, and what they said, and the assessment will move.',
    };
    score = 55;
  }

  const band: StrengthBand =
    score >= 75 ? 'strong' : score >= 55 ? 'solid' : score >= 35 ? 'worth_pursuing' : 'needs_detail';

  const improvements = signals
    .map((s) => s.improvement)
    .filter((x): x is string => typeof x === 'string' && x.length > 0);

  return {
    score,
    band,
    bandLabel: BAND_LABELS[band],
    headline: BAND_HEADLINES[band],
    signals,
    improvements,
    cap,
  };
}
