/**
 * Shared result presentation for every calculator at /tools.
 *
 * Imported by client components, so it becomes part of the client
 * bundle. Deliberately dumb: all the reasoning lives in each tool's
 * pure `evaluate()` function so the logic can be read and checked
 * without reading JSX.
 */

export type VerdictTone = 'yes' | 'maybe' | 'caution' | 'no';

/**
 * One line of the working. Exported as a mutable element type because
 * every calculator builds its figures by pushing conditionally, so
 * `NonNullable<Verdict['figures']>` has to be assignable to a mutable
 * array for that pattern to type-check.
 */
export type VerdictFigure = {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
};

export type Verdict = {
  tone: VerdictTone;
  /** Short uppercase tag, e.g. "Likely eligible". */
  tag: string;
  headline: string;
  /** Large figure, e.g. "£350". Only where a number is genuinely known. */
  amount?: string;
  amountNote?: string;
  /** What applies and why. */
  reasoning: string[];
  /**
   * Optional line-by-line working, used by the money calculators so a
   * reader can check the arithmetic rather than trust the total. Not
   * used by the eligibility checkers, which have nothing to add up.
   */
  figures?: VerdictFigure[];
  /** Optional heading for the figures block. */
  figuresHeading?: string;
  /** Concrete next actions in order. */
  nextSteps: string[];
  /** Conditions, exceptions and the ways this can fail. Never empty. */
  caveats: string[];
};

const TONE_LABEL: Record<VerdictTone, string> = {
  yes: 'is-yes',
  maybe: 'is-maybe',
  caution: 'is-caution',
  no: 'is-no',
};

export function ResultCard({ verdict }: { verdict: Verdict }) {
  return (
    <div className={`tool-result ${TONE_LABEL[verdict.tone]}`} role="status" aria-live="polite">
      <div className="tool-result-tag">{verdict.tag}</div>
      <h3>{verdict.headline}</h3>

      {verdict.amount ? (
        <>
          <div className="tool-result-amount">{verdict.amount}</div>
          {verdict.amountNote ? (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '-8px 0 0' }}>
              {verdict.amountNote}
            </p>
          ) : null}
        </>
      ) : null}

      {verdict.figures && verdict.figures.length > 0 ? (
        <div className="tool-result-block">
          <h4>{verdict.figuresHeading ?? 'The working'}</h4>
          <dl className="tool-figures">
            {verdict.figures.map((f, i) => (
              <div key={i} className={`tool-figure${f.emphasis ? ' is-emphasis' : ''}`}>
                <dt>
                  {f.label}
                  {f.note ? <span>{f.note}</span> : null}
                </dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {verdict.reasoning.length > 0 ? (
        <div className="tool-result-block">
          <h4>Why</h4>
          <ul className="tool-list">
            {verdict.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {verdict.nextSteps.length > 0 ? (
        <div className="tool-result-block">
          <h4>What to do next</h4>
          <ul className="tool-list is-steps">
            {verdict.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {verdict.caveats.length > 0 ? (
        <div className="tool-result-block">
          <h4>Conditions and exceptions</h4>
          <ul className="tool-list is-caveat">
            {verdict.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Shared field wrapper so every calculator looks identical. */
export function Field({
  label,
  help,
  htmlFor,
  full,
  children,
}: {
  label: string;
  help?: string;
  htmlFor: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`tool-field${full ? ' is-full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help ? <span className="tool-field-help">{help}</span> : null}
    </div>
  );
}
