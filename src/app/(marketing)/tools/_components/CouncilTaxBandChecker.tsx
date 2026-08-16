'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';

/**
 * Council tax band challenge viability checker (England, Wales,
 * Scotland, Northern Ireland).
 *
 * The distinction this tool exists to make clear is the one GOV.UK
 * draws and almost nobody else does:
 *
 *   PROPOSAL   you have a legal right to challenge. The Valuation
 *              Office has up to 4 months. If it refuses you, you can
 *              appeal to the Valuation Tribunal.
 *
 *   BAND REVIEW  you have no legal right to challenge. The VO may look
 *              at it as a courtesy, can take up to 12 months, and
 *              there is NO right of appeal if it says no.
 *
 * Every path also carries the plain warning that a band can go up.
 */

type Nation = 'england' | 'wales' | 'scotland' | 'ni' | '';
type Tenure = 'under6' | 'over6' | '';
type YesNo = 'yes' | 'no' | '';
type Neighbours = 'lower' | 'same' | 'not-checked' | '';

const BAND_UP_WARNING =
  'A band review looks at whether your band is CORRECT, not only whether it is too high. The Valuation Office can conclude your band should be higher, and a higher band is backdated. This is a real risk, not boilerplate, and you should not start unless you are prepared for that outcome.';

const NEIGHBOUR_WARNING =
  'If your case is that neighbouring properties are in a lower band, be aware the Valuation Office may conclude they are the ones banded wrongly. The outcome can be their bands going up rather than yours coming down.';

export default function CouncilTaxBandChecker() {
  const [nation, setNation] = useState<Nation>('');
  const [tenure, setTenure] = useState<Tenure>('');
  const [voaChanged, setVoaChanged] = useState<YesNo>('');
  const [materialChange, setMaterialChange] = useState<YesNo>('');
  const [neighbours, setNeighbours] = useState<Neighbours>('');
  const [valuationEvidence, setValuationEvidence] = useState<YesNo>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const ready =
    nation !== '' &&
    tenure !== '' &&
    voaChanged !== '' &&
    materialChange !== '' &&
    neighbours !== '' &&
    valuationEvidence !== '';

  function evidenceStrength(): 'strong' | 'partial' | 'weak' {
    const a = neighbours === 'lower';
    const b = valuationEvidence === 'yes';
    if (a && b) return 'strong';
    if (a || b) return 'partial';
    return 'weak';
  }

  function evidenceLines(): string[] {
    const lines: string[] = [];
    if (neighbours === 'lower') {
      lines.push(
        'You have identified comparable neighbouring properties in a lower band. That is the single most persuasive evidence there is, because banding is a relative exercise. Make sure the comparables really are comparable: same property type, similar size and layout, same street or a genuinely equivalent one.',
      );
    } else if (neighbours === 'same') {
      lines.push(
        'Your neighbours are in the same band as you. On its own that points against a challenge, because banding is relative and consistency across similar properties is what the Valuation Office is aiming for. You would need the valuation argument to carry the case.',
      );
    } else {
      lines.push(
        'You have not compared with neighbouring properties yet. This is the first thing to do and it is free. Look up your street on the official band register and note the band of every comparable property.',
      );
    }

    if (valuationEvidence === 'yes') {
      lines.push(
        'You have worked out what the property was worth at the valuation date. That is the other half of a proper case: the band has to be wrong against the statutory valuation date, not against what the property is worth today.',
      );
    } else {
      lines.push(
        'You have not established a value at the statutory valuation date. Bands are set on 1 April 1991 values in England and 1 April 2003 in Wales. A challenge based on the current market value alone misunderstands the test and will not get anywhere.',
      );
    }
    return lines;
  }

  function evaluate(): Verdict {
    if (nation === 'ni') {
      return {
        tone: 'caution',
        tag: 'Different system',
        headline: 'Northern Ireland does not use council tax bands at all',
        reasoning: [
          'Northern Ireland uses domestic rates based on the capital value of the property, assessed by Land and Property Services, rather than the banding system used in England, Wales and Scotland.',
          'The Local Government Finance Act 1992 banding machinery, the Valuation Office and the Valuation Tribunal do not apply to you.',
        ],
        nextSteps: [
          'Check your capital valuation on the Land and Property Services valuation list.',
          'If you think it is wrong, apply to LPS for a review. There is a separate appeal route to the Commissioner of Valuation and then the Northern Ireland Valuation Tribunal.',
        ],
        caveats: [
          'A capital valuation review can also move the figure upwards. The same warning applies as elsewhere.',
        ],
      };
    }

    const strength = evidenceStrength();
    const evidence = evidenceLines();

    if (nation === 'scotland') {
      const hasRight = tenure === 'under6' || materialChange === 'yes' || voaChanged === 'yes';
      return {
        tone: strength === 'weak' ? 'caution' : hasRight ? 'maybe' : 'caution',
        tag: hasRight ? 'Formal proposal route open' : 'Informal review only',
        headline: hasRight
          ? 'You appear to be inside the window for a formal proposal to your Assessor'
          : 'You are outside the formal window, so this would be an informal request',
        reasoning: [
          'In Scotland, banding is handled by the Assessor for your Valuation Joint Board or council, not by the Valuation Office. Scottish bands are based on 1 April 1991 values.',
          hasRight
            ? 'You told us you have been the council tax payer for under six months, or that there has been a relevant change. That is normally the basis for a formal proposal.'
            : 'Outside the formal window, the Assessor can look at your band informally, but you do not have the same appeal rights.',
          ...evidence,
        ],
        nextSteps: [
          'Find your local Assessor through the Scottish Assessors Association and use their banding enquiry route.',
          'Send your comparables and your valuation reasoning together, in one submission.',
          'If a formal proposal is refused, the appeal goes to the Local Taxation Chamber, not to the Valuation Tribunal for England.',
        ],
        caveats: [BAND_UP_WARNING, NEIGHBOUR_WARNING],
      };
    }

    // England and Wales
    const isWales = nation === 'wales';
    const valuationDate = isWales ? '1 April 2003' : '1 April 1991';
    const appealWindow = isWales ? 'four months' : 'three months';
    const hasLegalRight = tenure === 'under6' || voaChanged === 'yes' || materialChange === 'yes';

    const rightReasons: string[] = [];
    if (tenure === 'under6') {
      rightReasons.push('You have been paying council tax on the property for less than six months.');
    }
    if (voaChanged === 'yes') {
      rightReasons.push('The Valuation Office changed your band in the last six months.');
    }
    if (materialChange === 'yes') {
      rightReasons.push(
        'There has been a change affecting the property or the area: the property being split or merged, a change of use, or a physical change to the local area.',
      );
    }

    if (hasLegalRight) {
      return {
        tone: strength === 'weak' ? 'caution' : 'yes',
        tag: 'Legal right to make a proposal',
        headline: 'You can make a formal proposal, which carries a right of appeal',
        reasoning: [
          `You qualify to make a formal proposal: ${rightReasons.join(' ')}`,
          'This matters a great deal. A formal proposal must be decided by the Valuation Office within about four months, and if it refuses you, you can appeal to the Valuation Tribunal free of charge.',
          `Bands in ${isWales ? 'Wales' : 'England'} are set on ${valuationDate} values, so your case has to be that the band is wrong against that date, not against today’s market.`,
          ...evidence,
        ],
        nextSteps: [
          'Look up your own band and the bands of every comparable property on your street using the official register.',
          `Work out what the property was worth on ${valuationDate}. The usual method is to take a recent sale price for a comparable property and index it back, then check which band that value falls in.`,
          'Submit the proposal through the Valuation Office check and challenge service, attaching the comparables and the valuation working.',
          `If the proposal is refused, appeal to the Valuation Tribunal. You normally have ${appealWindow} from the decision.`,
        ],
        caveats: [
          BAND_UP_WARNING,
          NEIGHBOUR_WARNING,
          strength === 'weak'
            ? 'Your evidence is currently thin. Submitting a proposal without comparables or a valuation figure invites a quick refusal, and it uses up the window you qualify for. Build the case first.'
            : 'Submit everything at once. A proposal supported by a page of comparables and a valuation calculation is a very different document from a letter saying the band feels too high.',
          'If the band is reduced, the refund is normally backdated to when you became liable, or to 1993 if the band has been wrong since the list was created.',
        ],
      };
    }

    return {
      tone: 'caution',
      tag: 'Band review only, no appeal right',
      headline: 'You have no legal right to challenge, so this would be an informal band review',
      reasoning: [
        'You have been the council tax payer for more than six months, the Valuation Office has not changed your band recently, and there has been no relevant change to the property or the area. That means you fall outside the statutory grounds for making a proposal.',
        'You can still ask the Valuation Office to review the band. But a band review is not a proposal. It can take up to twelve months, and, critically, there is NO right of appeal to the Valuation Tribunal if the Valuation Office decides not to change your band. That is where it ends.',
        `Bands in ${isWales ? 'Wales' : 'England'} are set on ${valuationDate} values, so the test is what the property was worth then.`,
        ...evidence,
      ],
      nextSteps: [
        'Because you get one shot with no appeal, build the case properly before you send anything.',
        'Look up every comparable property on your street on the official band register and list the ones in a lower band, with addresses.',
        `Establish a ${valuationDate} value. Take a comparable sale you can evidence and index it back to the valuation date, then show which band that value falls in.`,
        'Only then submit the band review through the Valuation Office service, with both strands of evidence attached.',
      ],
      caveats: [
        BAND_UP_WARNING,
        NEIGHBOUR_WARNING,
        'There is no right of appeal from a band review. If the Valuation Office says no, that is the end of the matter unless something later gives you a legal right to make a proposal.',
        strength === 'weak'
          ? 'On what you have told us, there is not yet a case here. Sending a band review now would most likely produce a refusal you cannot appeal. Gather the evidence first.'
          : 'A well-evidenced band review is still worth making. It is the lack of an appeal route, not the lack of merit, that makes it a one-shot exercise.',
      ],
    };
  }

  return (
    <div className="tool-card">
      <h2>Check whether a challenge is viable</h2>
      <p className="tool-card-hint">
        Six questions. This tells you which route is open to you and, just as
        importantly, when you should not start.
      </p>

      <div className="tool-fields is-two">
        <Field label="Where is the property?" htmlFor="ct-nation">
          <select id="ct-nation" value={nation} onChange={(e) => setNation(e.target.value as Nation)}>
            <option value="">Choose one</option>
            <option value="england">England</option>
            <option value="wales">Wales</option>
            <option value="scotland">Scotland</option>
            <option value="ni">Northern Ireland</option>
          </select>
        </Field>

        <Field
          label="How long have you been paying council tax on it?"
          htmlFor="ct-tenure"
          help="Under six months is one of the grounds that gives you a legal right to challenge."
        >
          <select id="ct-tenure" value={tenure} onChange={(e) => setTenure(e.target.value as Tenure)}>
            <option value="">Choose one</option>
            <option value="under6">Less than 6 months</option>
            <option value="over6">More than 6 months</option>
          </select>
        </Field>

        <Field label="Has your band been changed in the last 6 months?" htmlFor="ct-voa">
          <select id="ct-voa" value={voaChanged} onChange={(e) => setVoaChanged(e.target.value as YesNo)}>
            <option value="">Choose one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>

        <Field
          label="Has the property or the area physically changed?"
          htmlFor="ct-change"
          help="Split or merged, a change of use, or something built nearby that changes the area physically."
        >
          <select
            id="ct-change"
            value={materialChange}
            onChange={(e) => setMaterialChange(e.target.value as YesNo)}
          >
            <option value="">Choose one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>

        <Field
          label="Have you checked comparable neighbouring properties?"
          htmlFor="ct-neighbours"
          help="Same type, similar size, same street. You can look up any address on the official band register for free."
        >
          <select
            id="ct-neighbours"
            value={neighbours}
            onChange={(e) => setNeighbours(e.target.value as Neighbours)}
          >
            <option value="">Choose one</option>
            <option value="lower">Yes, comparable homes are in a lower band</option>
            <option value="same">Yes, they are in the same band as me</option>
            <option value="not-checked">I have not checked yet</option>
          </select>
        </Field>

        <Field
          label="Do you know what the property was worth at the valuation date?"
          htmlFor="ct-valuation"
          full
          help="1 April 1991 for England, 1 April 2003 for Wales and 1 April 1991 for Scotland. Today’s value is not the test."
        >
          <select
            id="ct-valuation"
            value={valuationEvidence}
            onChange={(e) => setValuationEvidence(e.target.value as YesNo)}
          >
            <option value="">Choose one</option>
            <option value="yes">Yes, I have worked it out</option>
            <option value="no">No, not yet</option>
          </select>
        </Field>
      </div>

      <div className="tool-actions">
        <button
          type="button"
          className="btn btn-mint btn-lg"
          disabled={!ready}
          style={ready ? undefined : { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }}
          onClick={() => setVerdict(evaluate())}
        >
          Check my options
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setNation('');
              setTenure('');
              setVoaChanged('');
              setMaterialChange('');
              setNeighbours('');
              setValuationEvidence('');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}
    </div>
  );
}
