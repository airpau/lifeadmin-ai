'use client';

/**
 * /check — the free, no-account case checker.
 *
 * Three steps, all reachable without signing up:
 *   1. Pick a category and describe what happened.
 *   2. Read the case strength assessment, the verified UK law that
 *      applies, and the escalation route.
 *   3. Read and copy a complete draft letter.
 *
 * Everything the visitor sees here stays free. The account prompt at the
 * bottom is about what happens AFTER the letter is sent, not about
 * unlocking anything already on screen.
 *
 * All analysis happens server-side in POST /api/check. This component
 * holds form state and presentation only.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHECK_CATEGORIES,
  CONTACT_STAGES,
  type CheckCategory,
  type ContactStage,
} from '@/lib/check/categories';
import './check.css';

const MAX_DESCRIPTION = 1200;

type Signal = {
  id: string;
  label: string;
  status: 'met' | 'partial' | 'missing' | 'warning';
  points: number;
  max: number;
  detail: string;
  improvement?: string;
};

type Citation = {
  id: string;
  lawName: string;
  section: string | null;
  meaning: string;
  sourceUrl: string;
  sourceHost: string;
  authorityDomain: string;
  escalationBody: string | null;
  verifiedDaysAgo: number | null;
  figuresUnderReview: boolean;
};

type CheckResult = {
  category: {
    id: string;
    label: string;
    regulator: string;
    ombudsman: string;
    ombudsmanUrl: string;
    eightWeekClock: boolean;
    limitLabel: string;
  };
  strength: {
    score: number;
    band: string;
    bandLabel: string;
    headline: string;
    signals: Signal[];
    improvements: string[];
    cap?: { reason: string; ceiling: number };
  };
  citations: Citation[];
  sourcing: { droppedNonAuthority: number };
  nextSteps: string[];
  letter: string;
};

const MARK: Record<Signal['status'], string> = {
  met: '✓',
  partial: '~',
  missing: '·',
  warning: '!',
};

const DRAFT_LINES = [
  'Reading what you told us',
  'Matching it against the verified statute index',
  'Composing the letter with the citations we can prove',
];

export default function CheckClient() {
  const [categoryId, setCategoryId] = useState<string>('');
  const [providerName, setProviderName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [contactStage, setContactStage] = useState<ContactStage>('not_yet');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [draftStage, setDraftStage] = useState(0);
  const [copied, setCopied] = useState(false);

  const topRef = useRef<HTMLDivElement | null>(null);

  const category: CheckCategory | null = useMemo(
    () => CHECK_CATEGORIES.find((c) => c.id === categoryId) ?? null,
    [categoryId],
  );

  // Prefill from ?category=, so /templates and campaign links can deep
  // link straight into a category.
  //
  // Read on mount rather than during render for two reasons. Reading
  // window.location during render would produce a hydration mismatch,
  // because the server has no query string to work from. And taking it
  // from `useSearchParams` instead would opt the whole route out of
  // static rendering, which we want to keep for an SEO surface. The URL
  // is an external system being read once on mount, which is the
  // documented legitimate use of an effect, so the cascading-render rule
  // is suppressed deliberately here rather than worked around.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('category');
    if (!wanted || !CHECK_CATEGORIES.some((c) => c.id === wanted)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategoryId(wanted);
  }, []);

  const scrollTop = useCallback(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    topRef.current?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const pickCategory = (id: string) => {
    setCategoryId(id);
    setEvidenceIds([]);
    setError(null);
  };

  const toggleEvidence = (id: string) => {
    setEvidenceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSubmit = Boolean(category) && description.trim().length >= 10 && !loading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!category) {
      setError('Pick the category that fits best so we can match the right law.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Tell us a little more about what happened, at least a sentence.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: category.id,
          providerName,
          description,
          amountGbp: amount,
          incidentDate,
          desiredOutcome,
          accountRef,
          contactStage,
          evidenceIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      setResult(data as CheckResult);
      setStep(2);
      setLoading(false);
      window.setTimeout(scrollTop, 30);
    } catch {
      setError('We could not reach the checker. Check your connection and try again.');
      setLoading(false);
    }
  };

  // Step 3 reveal. The letter text is already in hand from the single
  // API call, so this is presentation only, not a second request.
  const revealLetter = () => {
    setStep(3);
    setDraftStage(0);
    window.setTimeout(scrollTop, 30);
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDraftStage(DRAFT_LINES.length + 1);
      return;
    }
    DRAFT_LINES.forEach((_, i) => {
      window.setTimeout(() => setDraftStage(i + 1), 360 * (i + 1));
    });
    window.setTimeout(() => setDraftStage(DRAFT_LINES.length + 1), 360 * (DRAFT_LINES.length + 1));
  };

  const copyLetter = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.letter);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      setError('Your browser blocked the copy. Select the letter text and copy it manually.');
    }
  };

  const signupHref = useMemo(() => {
    if (!category) return '/auth/signup?from=check';
    const params = new URLSearchParams({
      from: 'check',
      type: category.letterType,
      issue: description.slice(0, 300),
    });
    return `/auth/signup?${params.toString()}`;
  }, [category, description]);

  const carryIntent = () => {
    if (typeof window === 'undefined' || !category) return;
    try {
      sessionStorage.setItem(
        'pb_homepage_letter_intent',
        JSON.stringify({
          type: category.letterType,
          issue: description.slice(0, 1200),
          provider: providerName,
          amount,
          source: 'check',
        }),
      );
    } catch {
      /* private mode, ignore */
    }
  };

  const letterReady = draftStage > DRAFT_LINES.length;

  return (
    <main className="chk-main">
      <div className="chk-wrap" ref={topRef}>
        {/* ---------- Hero ---------- */}
        <section className="chk-hero">
          <span className="eyebrow">Free case check, no account</span>
          <h1>Check your case against the actual UK law in about a minute.</h1>
          <p className="chk-dek">
            Tell us what happened. We will tell you how strong your case looks, which UK
            rules apply and where each one comes from, and draft the letter. Free to read,
            free to copy, no email required.
          </p>
          <div className="chk-hero-badges">
            <span className="chk-badge is-mint">Citations retrieved, never generated</span>
            <span className="chk-badge">Official sources only</span>
            <span className="chk-badge">No sign-up to see the letter</span>
          </div>
        </section>

        {/* ---------- Stepper ---------- */}
        <nav className="chk-steps" aria-label="Progress">
          {['Your case', 'What the law says', 'Your letter'].map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const cls = step === n ? 'is-active' : step > n ? 'is-done' : '';
            return (
              <span key={label} style={{ display: 'contents' }}>
                {i > 0 ? <span className="chk-step-rule" aria-hidden="true" /> : null}
                <span className={`chk-step ${cls}`} aria-current={step === n ? 'step' : undefined}>
                  <span className="chk-step-num">{step > n ? '✓' : n}</span>
                  {label}
                </span>
              </span>
            );
          })}
        </nav>

        {error ? (
          <p className="chk-error" role="alert">
            {error}
          </p>
        ) : null}

        {/* ================= STEP 1 ================= */}
        {step === 1 ? (
          <form onSubmit={handleSubmit}>
            <section className="chk-card">
              <h2>What kind of problem is it?</h2>
              <p className="chk-sub">
                Pick the closest fit. This decides which part of the verified law index we
                search, so it matters more than it looks.
              </p>
              <div className="chk-cat-grid" role="radiogroup" aria-label="Dispute category">
                {CHECK_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={categoryId === c.id}
                    className={`chk-cat ${categoryId === c.id ? 'is-selected' : ''}`}
                    onClick={() => pickCategory(c.id)}
                  >
                    <span className="chk-cat-label">{c.label}</span>
                    <span className="chk-cat-blurb">{c.blurb}</span>
                  </button>
                ))}
              </div>
            </section>

            {category ? (
              <section className="chk-card">
                <h2>What happened?</h2>
                <p className="chk-sub">
                  Plain English is fine. Dates, amounts and what they said back are the
                  details that make a letter hard to ignore.
                </p>

                <div className="chk-field">
                  <label htmlFor="chk-desc">
                    Describe the problem <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="chk-desc"
                    className="chk-textarea"
                    value={description}
                    maxLength={MAX_DESCRIPTION}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={category.placeholder}
                    required
                  />
                  <div className="chk-counter">
                    {description.length} / {MAX_DESCRIPTION}
                  </div>
                </div>

                <div className="chk-row">
                  <div className="chk-field">
                    <label htmlFor="chk-provider">Who is it with?</label>
                    <input
                      id="chk-provider"
                      className="chk-input"
                      value={providerName}
                      maxLength={120}
                      onChange={(e) => setProviderName(e.target.value)}
                      placeholder="e.g. Octopus Energy"
                    />
                  </div>
                  <div className="chk-field">
                    <label htmlFor="chk-amount">How much is in dispute?</label>
                    <input
                      id="chk-amount"
                      className="chk-input"
                      inputMode="decimal"
                      value={amount}
                      maxLength={12}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="£"
                    />
                  </div>
                </div>

                <div className="chk-row">
                  <div className="chk-field">
                    <label htmlFor="chk-date">When did it happen?</label>
                    <input
                      id="chk-date"
                      type="date"
                      className="chk-input"
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                    />
                    <p className="chk-hint">
                      We check this against the deadline for this type of case.
                    </p>
                  </div>
                  <div className="chk-field">
                    <label htmlFor="chk-ref">Account or reference number</label>
                    <input
                      id="chk-ref"
                      className="chk-input"
                      value={accountRef}
                      maxLength={60}
                      onChange={(e) => setAccountRef(e.target.value)}
                      placeholder="Optional"
                    />
                    <p className="chk-hint">
                      We never ask for your address. The reference is how they find you.
                    </p>
                  </div>
                </div>

                <div className="chk-field">
                  <label htmlFor="chk-outcome">What do you want them to do?</label>
                  <input
                    id="chk-outcome"
                    className="chk-input"
                    value={desiredOutcome}
                    maxLength={240}
                    onChange={(e) => setDesiredOutcome(e.target.value)}
                    placeholder={category.defaultOutcome}
                  />
                </div>

                <div className="chk-field">
                  <label htmlFor="chk-stage">Have you already raised it with them?</label>
                  <select
                    id="chk-stage"
                    className="chk-select"
                    value={contactStage}
                    onChange={(e) => setContactStage(e.target.value as ContactStage)}
                  >
                    {CONTACT_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset className="chk-field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
                  <legend className="chk-legend">What can you back it up with?</legend>
                  <div className="chk-checks">
                    {category.evidence.map((e) => (
                      <label
                        key={e.id}
                        className={`chk-check ${evidenceIds.includes(e.id) ? 'is-on' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={evidenceIds.includes(e.id)}
                          onChange={() => toggleEvidence(e.id)}
                        />
                        <span>{e.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="chk-hint">
                    Evidence is a large part of how we score the case, and it is the thing
                    most people can improve fastest.
                  </p>
                </fieldset>

                <div className="chk-actions">
                  <button type="submit" className="chk-btn chk-btn-primary" disabled={!canSubmit}>
                    {loading ? 'Checking your case…' : 'Check my case →'}
                  </button>
                </div>
              </section>
            ) : null}
          </form>
        ) : null}

        {/* ================= STEP 2 ================= */}
        {step === 2 && result ? (
          <StepTwo
            result={result}
            onBack={() => {
              setStep(1);
              window.setTimeout(scrollTop, 30);
            }}
            onNext={revealLetter}
          />
        ) : null}

        {/* ================= STEP 3 ================= */}
        {step === 3 && result ? (
          <>
            <section className="chk-card">
              <div className="chk-letter-head">
                <div>
                  <h2>Your draft letter</h2>
                  <p className="chk-sub" style={{ margin: 0 }}>
                    Complete, and yours to send. No account needed to read or copy it.
                  </p>
                </div>
                {letterReady ? (
                  <button
                    type="button"
                    className={`chk-copy ${copied ? 'is-done' : ''}`}
                    onClick={copyLetter}
                  >
                    {copied ? '✓ Copied' : 'Copy letter'}
                  </button>
                ) : null}
              </div>

              {letterReady ? (
                <>
                  <div className="chk-letter">{result.letter}</div>
                  <p className="chk-hint" style={{ marginTop: 12 }}>
                    Replace [Your name] and the reference before you send it. Email it to the
                    provider&rsquo;s complaints address and keep the sent copy.
                  </p>
                </>
              ) : (
                <div className="chk-drafting" aria-live="polite">
                  {DRAFT_LINES.map((line, i) => (
                    <div key={line} className={`chk-draft-line ${draftStage > i ? 'is-on' : ''}`}>
                      <span className="chk-draft-dot" aria-hidden="true" />
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {letterReady ? (
              <>
                <ConvertPanel
                  result={result}
                  signupHref={signupHref}
                  onCarry={carryIntent}
                />
                <div className="chk-actions" style={{ marginBottom: 24 }}>
                  <button
                    type="button"
                    className="chk-btn chk-btn-ghost"
                    onClick={() => {
                      setStep(2);
                      window.setTimeout(scrollTop, 30);
                    }}
                  >
                    ← Back to the law and next steps
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {/* ---------- Standing disclaimer ---------- */}
        <p className="chk-disclaimer">
          Paybacker helps you exercise your own rights under UK consumer law. We are not a
          law firm and this is not legal advice. The case strength figure is an assessment
          of how well-evidenced and legally grounded your complaint is. It is not a
          prediction of the outcome, and no result is guaranteed. For disputes over £5,000,
          court proceedings, or facts unique to your situation, speak to a qualified
          solicitor or Citizens Advice.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2: strength, law, next steps                                          */
/* -------------------------------------------------------------------------- */

function StepTwo({
  result,
  onBack,
  onNext,
}: {
  result: CheckResult;
  onBack: () => void;
  onNext: () => void;
}) {
  const { strength, citations, nextSteps, category, sourcing } = result;
  const pct = Math.max(0, Math.min(100, strength.score));
  const dialStyle = {
    background: `conic-gradient(var(--accent-mint) ${pct * 3.6}deg, rgba(255,255,255,0.14) 0deg)`,
  };

  return (
    <>
      {/* Score */}
      <section className="chk-score-card">
        <div className="chk-score-top">
          <div className="chk-dial" style={dialStyle} role="img" aria-label={`Case strength ${pct} out of 100`}>
            <div className="chk-dial-inner">
              <div className="chk-dial-num">{pct}</div>
              <div className="chk-dial-den">out of 100</div>
            </div>
          </div>
          <div>
            <div className="chk-score-eyebrow">Case strength</div>
            <p className="chk-score-band">{strength.bandLabel}</p>
          </div>
        </div>

        <p className="chk-score-head">{strength.headline}</p>

        {strength.cap ? <p className="chk-cap">{strength.cap.reason}</p> : null}

        <p className="chk-score-note">
          This score measures how well-evidenced and legally grounded your complaint is,
          nothing more. It is not a prediction of whether you win. Here is exactly how it
          was worked out.
        </p>
      </section>

      {/* Signal breakdown */}
      <section className="chk-card">
        <h2>How we worked that out</h2>
        <p className="chk-sub">Six signals, each one something you can actually see and change.</p>
        {strength.signals.map((s) => (
          <div key={s.id} className="chk-signal">
            <span className={`chk-sig-mark ${s.status}`} aria-hidden="true">
              {MARK[s.status]}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="chk-sig-head">
                <span className="chk-sig-label">{s.label}</span>
                <span className="chk-sig-pts">
                  {s.points}/{s.max}
                </span>
              </div>
              <p className="chk-sig-detail">{s.detail}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Improvements */}
      {strength.improvements.length > 0 ? (
        <section className="chk-card">
          <h2>What would make this stronger</h2>
          <p className="chk-sub">In rough order of how much difference each one makes.</p>
          <ul className="chk-improve">
            {strength.improvements.map((imp) => (
              <li key={imp}>{imp}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Provenance */}
      <section className="chk-prov">
        <h3>Where these citations come from</h3>
        <p>
          Paybacker does not ask an AI what the law says. Every rule below is{' '}
          <strong>retrieved</strong> from our maintained index of UK legislation, regulator
          rules and official guidance, then checked against an allowlist of official source
          domains before it is shown to you. Anything that resolves to a trade body, a law
          firm blog, a news article or an aggregator is dropped, not softened.
        </p>
        <p>
          Each card carries its own source link so you can open the statute or regulator
          page yourself and read the wording. That is the point: a citation you cannot
          check is not a citation.
          {sourcing.droppedNonAuthority > 0
            ? ` On this case we dropped ${sourcing.droppedNonAuthority} candidate reference${sourcing.droppedNonAuthority === 1 ? '' : 's'} that did not clear the source check.`
            : ''}
        </p>
      </section>

      {/* Citations */}
      <section className="chk-card">
        <h2>The law on your side</h2>
        {citations.length === 0 ? (
          <div className="chk-nolaw">
            <h3>We do not hold a verified citation for this one</h3>
            <p>
              We could not match a rule in our index to what you have described, and we will
              not invent one to fill the gap. That is the whole reason this tool exists.
            </p>
            <p>
              Your letter below still works. It argues the facts and the general obligations
              the provider owes you, and it names the escalation route. Try a more specific
              category, or add detail about the sector and exactly what went wrong, and we
              may be able to match a verified rule.
            </p>
          </div>
        ) : (
          <>
            <p className="chk-sub">
              {citations.length} rule{citations.length === 1 ? '' : 's'} matched to your
              case, most relevant first.
            </p>
            {citations.map((c) => (
              <article key={c.id} className="chk-cite">
                <span className="chk-cite-verified">
                  <span aria-hidden="true">✓</span> Verified source
                </span>
                <h3 className="chk-cite-law">{c.lawName}</h3>
                {c.section ? <p className="chk-cite-section">{c.section}</p> : null}
                <p className="chk-cite-meaning">{c.meaning}</p>
                {c.figuresUnderReview ? (
                  <p className="chk-cite-review">
                    The rule itself is verified. A specific figure inside it is currently
                    being re-checked by our compliance pipeline, so quote the rule and check
                    the current number on the source page before you rely on it.
                  </p>
                ) : null}
                <div className="chk-cite-foot">
                  <span>
                    Source:{' '}
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {c.sourceHost}
                    </a>
                  </span>
                  {c.verifiedDaysAgo != null ? (
                    <span>
                      Last checked{' '}
                      {c.verifiedDaysAgo === 0
                        ? 'today'
                        : `${c.verifiedDaysAgo} day${c.verifiedDaysAgo === 1 ? '' : 's'} ago`}
                    </span>
                  ) : null}
                  {c.escalationBody ? <span>Escalates to {c.escalationBody}</span> : null}
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      {/* Next steps */}
      <section className="chk-card">
        <h2>What to do next</h2>
        <p className="chk-sub">Specific to a {category.label.toLowerCase()} case.</p>
        <ol className="chk-steps-list">
          {nextSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        {category.eightWeekClock ? (
          <div className="chk-clock">
            <span aria-hidden="true">⏱</span>
            <span>
              <strong>The eight week clock.</strong> Once {category.regulator}-regulated
              providers receive your complaint they have eight weeks to give you a final
              answer. After that, whether or not they have replied, you can take the case to{' '}
              <a
                href={category.ombudsmanUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: 'inherit', fontWeight: 650 }}
              >
                {category.ombudsman}
              </a>
              . Note the date you send the letter, because that is when the clock starts.
            </span>
          </div>
        ) : (
          <div className="chk-clock">
            <span aria-hidden="true">⏱</span>
            <span>
              <strong>Deadline to watch.</strong> {category.limitLabel} If it is not resolved,
              the route from here is{' '}
              <a
                href={category.ombudsmanUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: 'inherit', fontWeight: 650 }}
              >
                {category.ombudsman}
              </a>
              .
            </span>
          </div>
        )}
      </section>

      <div className="chk-actions" style={{ marginBottom: 28 }}>
        <button type="button" className="chk-btn chk-btn-primary" onClick={onNext}>
          Draft my letter →
        </button>
        <button type="button" className="chk-btn chk-btn-ghost" onClick={onBack}>
          ← Change my answers
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Conversion panel — what an account ADDS, not what it unlocks               */
/* -------------------------------------------------------------------------- */

function ConvertPanel({
  result,
  signupHref,
  onCarry,
}: {
  result: CheckResult;
  signupHref: string;
  onCarry: () => void;
}) {
  const { category } = result;
  return (
    <section className="chk-convert">
      <h2>The letter is the easy part. The next eight weeks are not.</h2>
      <p>
        Keep the draft above. It is yours, free, whether or not you ever make an account.
        What an account adds is everything that happens after you hit send.
      </p>
      <ul className="chk-adds">
        <li>
          <strong>The response gets tracked.</strong> Your dispute becomes a thread with
          dates, replies and letter versions in one place, which is exactly what{' '}
          {category.ombudsman} asks to see.
        </li>
        <li>
          <strong>Watchdog reads your inbox for the reply.</strong> Connect your email and we
          poll it every 30 minutes for their response, so a rejection buried in a Sunday
          night auto-mail does not sit unread for a fortnight.
        </li>
        <li>
          <strong>
            {category.eightWeekClock ? 'The eight week clock runs itself.' : 'The deadline runs itself.'}
          </strong>{' '}
          We count from the day you send and tell you the moment you can escalate, instead of
          you remembering.
        </li>
        <li>
          <strong>Escalation is drafted for you.</strong> If they refuse or go quiet, the next
          letter builds on this one and cites the correspondence, rather than starting from a
          blank page.
        </li>
        <li>
          <strong>The AI engine tailors the argument.</strong> The full generator writes to
          your specific facts and provider rather than to the category, using the same
          verified citation index you just saw.
        </li>
      </ul>
      <Link className="chk-btn chk-btn-primary" href={signupHref} onClick={onCarry}>
        Create a free account and track this dispute →
      </Link>
      <p className="chk-kept">
        Free tier, no card. You keep 100% of anything you get back, we never take a cut of a
        settlement. And nothing you typed into this checker was stored: create the account
        and we will carry your answers across so you do not type them twice.
      </p>
    </section>
  );
}
