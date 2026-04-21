'use client';

/**
 * Homepage product demos — ported verbatim from
 *   demos-handoff/demos/demo-*.jsx (Claude Design, Apr 2026).
 *
 * Timings, dimensions, refs and copy are preserved pixel-for-pixel.
 * Every demo is gated behind IntersectionObserver so the requestAnimationFrame
 * loop only runs while the stage is within 200px of the viewport.
 */

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

// ---------------------------------------------------------------------------
// Shared: `t` ticker gated by viewport (IntersectionObserver + rAF)
// ---------------------------------------------------------------------------
function useInViewTicker(period: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState<number>(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let raf = 0;
    let start = 0;
    let running = false;

    const tick = () => {
      setT(((Date.now() - start) / 1000) % period);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      cancelAnimationFrame(raf);
      running = false;
    };
    const play = () => {
      if (running) return;
      running = true;
      start = Date.now();
      raf = requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === 'undefined') {
      play();
      return () => stop();
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) play();
        else stop();
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(node);

    return () => {
      io.disconnect();
      stop();
    };
  }, [period]);

  return { ref, t };
}

// Resolve a target element's center relative to a stage element.
function targetCenter(
  stageRef: RefObject<HTMLElement | null>,
  ref: RefObject<HTMLElement | null>,
): { x: number; y: number } | null {
  if (!ref.current || !stageRef.current) return null;
  const s = stageRef.current.getBoundingClientRect();
  const r = ref.current.getBoundingClientRect();
  return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
}

const CURSOR_SVG = (
  <svg viewBox="0 0 24 24">
    <path
      d="M4 2.5L4 19L9 15L12 21.5L15.5 20L12.5 13.5L19 13L4 2.5Z"
      fill="#0B1220"
      stroke="#fff"
      strokeWidth="1.2"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// 1 · Disputes
// ---------------------------------------------------------------------------
export function DisputesDemo() {
  const { ref: tickerRef, t } = useInViewTicker(12);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const draftBtnRef = useRef<HTMLButtonElement | null>(null);
  const linkBtnRef = useRef<HTMLButtonElement | null>(null);
  const threadItemRef = useRef<HTMLDivElement | null>(null);

  const setBothRefs = (node: HTMLDivElement | null) => {
    stageRef.current = node;
    tickerRef.current = node;
  };

  const composeOpen = t > 1.9;
  const letterText = [
    'Dear Virgin Media,',
    '',
    'On 12 November 2026 my monthly charge increased from £38 to £50 with no prior notice. Under Ofcom General Condition C1.8, you must provide at least one month\u2019s notice of any change that materially increases my charges.',
    '',
    'Under Consumer Rights Act 2015, Section 49, I am exercising my right to exit without penalty and request a full refund of £312 for charges billed without adequate notice since August.',
  ].join('\n');
  const typeProgress = Math.max(0, Math.min(1, (t - 2.2) / 2.8));
  const typedChars = Math.floor(letterText.length * typeProgress);
  const shownText = letterText.slice(0, typedChars);

  const showInboxPicker = t > 6.4 && t < 8.2;
  const tracking = t > 8.2;
  const showDualAlert = t > 10.3;

  const cursorPos = (() => {
    const easeTo = (
      target: { x: number; y: number } | null,
      p0: number,
      p1: number,
      from: { x: number; y: number },
    ) => {
      if (!target) return { x: 0, y: 0, o: 0 };
      const k = Math.max(0, Math.min(1, (t - p0) / (p1 - p0)));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        o: 1,
      };
    };

    if (t < 2.0) {
      const tgt = targetCenter(stageRef, draftBtnRef);
      if (t < 1.4) return easeTo(tgt, 0.2, 1.4, { x: 80, y: 80 });
      return tgt ? { ...tgt, o: 1 } : { x: 0, y: 0, o: 0 };
    }
    if (t < 5.5) return { x: 0, y: 0, o: 0 };
    if (t < 6.6) {
      const tgt = targetCenter(stageRef, linkBtnRef);
      if (t < 5.9) return easeTo(tgt, 5.5, 5.9, { x: 500, y: 280 });
      return tgt ? { ...tgt, o: 1 } : { x: 0, y: 0, o: 0 };
    }
    if (t < 7.4) return { x: 0, y: 0, o: 0 };
    if (t < 8.3) {
      const tgt = targetCenter(stageRef, threadItemRef);
      if (t < 7.8) return easeTo(tgt, 7.4, 7.8, { x: 820, y: 500 });
      return tgt ? { ...tgt, o: 1 } : { x: 0, y: 0, o: 0 };
    }
    return { x: 0, y: 0, o: 0 };
  })();
  const clickDraft = t > 1.7 && t < 2.0;
  const clickLink = t > 5.8 && t < 6.1;
  const clickThread = t > 7.7 && t < 8.0;

  const timelineStage = !tracking ? 0 : t < 9.0 ? 1 : t < 9.4 ? 2 : t < 10.0 ? 3 : 4;

  const moneyRows = [
    { m: 'Tesco', a: '−£42.80', d: 'Today', i: '🛒', h: false },
    { m: 'Virgin Media', a: '−£50.00', d: '12 Nov', i: '📶', h: true },
    { m: 'Spotify', a: '−£11.99', d: '10 Nov', i: '♫', h: false },
    { m: 'TfL', a: '−£2.80', d: '9 Nov', i: '🚇', h: false },
  ];

  return (
    <div className="demo-stage" ref={setBothRefs}>
      <span className="demo-label">
        Disputes · drafts letter · suggests email thread to watch · 12s loop
      </span>

      <div style={{ position: 'absolute', inset: '56px 44px 40px 44px', display: 'flex', gap: 16 }}>
        {/* LEFT: Money Hub */}
        <div
          style={{
            flex: '0 0 340px',
            background: '#fff',
            borderRadius: 14,
            border: '1px solid var(--divider)',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-md)',
            transform: composeOpen ? 'translateX(-6px) scale(.97)' : 'translateX(0) scale(1)',
            transition: 'transform 500ms cubic-bezier(.4,0,.2,1)',
            opacity: composeOpen ? 0.45 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Money Hub</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>Recent</div>
            </div>
            <span className="pill grey">12 this week</span>
          </div>
          {moneyRows.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 8px',
                borderRadius: 8,
                marginBottom: 3,
                background: r.h && t > 0.5 && t < 2.0 ? 'rgba(245,158,11,.08)' : 'transparent',
                border: r.h && t > 0.5 && t < 2.0 ? '1px solid rgba(245,158,11,.3)' : '1px solid transparent',
                transition: 'all 200ms',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: '#F3F4F6',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                }}
              >
                {r.i}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.m}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{r.d}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace' }}>{r.a}</div>
                {r.h && (
                  <span className="pill orange" style={{ marginTop: 2, fontSize: 9.5 }}>
                    ↑ HIKE
                  </span>
                )}
              </div>
              {r.h && t > 0.8 && t < 2.0 && (
                <button
                  ref={draftBtnRef}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 5,
                    background: 'var(--ink)',
                    color: '#fff',
                    border: 'none',
                    marginLeft: 2,
                  }}
                >
                  Draft dispute
                </button>
              )}
            </div>
          ))}
        </div>

        {/* RIGHT: Compose / Tracking panel */}
        <div
          style={{
            flex: 1,
            background: '#fff',
            borderRadius: 14,
            border: '1px solid var(--divider)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-lg)',
            transform: composeOpen ? 'translateX(0)' : 'translateX(100%)',
            opacity: composeOpen ? 1 : 0,
            transition: 'transform 500ms cubic-bezier(.4,0,.2,1), opacity 300ms',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div className="eyebrow">{tracking ? 'Tracking · thread linked' : 'AI-drafted · Virgin Media'}</div>
              <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.01em', marginTop: 3 }}>
                {tracking ? 'Dispute #2847 · Virgin Media' : 'Dispute letter'}
              </div>
            </div>
            {!tracking && (
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="pill grey" style={{ fontSize: 10 }}>Formal</span>
                <span className="pill mint" style={{ fontSize: 10 }}>Firm</span>
                <span className="pill grey" style={{ fontSize: 10 }}>Polite</span>
              </div>
            )}
          </div>

          {!tracking ? (
            <>
              <div
                style={{
                  flex: 1,
                  background: '#FAFAF7',
                  borderRadius: 9,
                  padding: '12px 14px',
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: 'var(--text-2)',
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  fontFamily: 'Inter,sans-serif',
                  minHeight: 0,
                }}
              >
                {shownText
                  .split(/(Ofcom General Condition C1\.8|Consumer Rights Act 2015, Section 49)/)
                  .map((ch, i) =>
                    ch === 'Ofcom General Condition C1.8' || ch === 'Consumer Rights Act 2015, Section 49' ? (
                      <mark
                        key={i}
                        style={{
                          background: 'rgba(52,211,153,.22)',
                          color: 'var(--mint-dark)',
                          fontWeight: 600,
                          padding: '1px 3px',
                          borderRadius: 3,
                        }}
                      >
                        {ch}
                      </mark>
                    ) : (
                      <span key={i}>{ch}</span>
                    ),
                  )}
                {typeProgress < 1 && <span className="caret" />}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  padding: '7px 10px',
                  background: '#FFFBEB',
                  border: '1px solid #FCD34D',
                  borderRadius: 7,
                  fontSize: 11,
                  color: '#78350F',
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: 12 }}>ⓘ</span>
                <span>
                  <b>Draft only.</b> We never send on your behalf. Copy the letter, send it yourself, then link the
                  email thread so we can watch for replies.
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                }}
              >
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                  Expected refund{' '}
                  <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono,monospace' }}>
                    £312
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={{
                      padding: '7px 12px',
                      borderRadius: 7,
                      background: '#F3F4F6',
                      border: 'none',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--text-2)',
                    }}
                  >
                    Copy letter
                  </button>
                  <button
                    ref={linkBtnRef}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 7,
                      background: 'var(--ink)',
                      color: '#fff',
                      border: 'none',
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    ✉ Link email thread
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  padding: '10px 12px',
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 11.5,
                  animation: 'demoFadeInUp 400ms',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'var(--ink)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  ✉
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#0C4A6E' }}>
                    Thread linked · &ldquo;Re: Your account 8847261&rdquo;
                  </div>
                  <div style={{ fontSize: 10.5, color: '#075985', marginTop: 1 }}>
                    Watching your inbox. We&rsquo;ll alert you the moment Virgin Media replies.
                  </div>
                </div>
                <span className="pill mint" style={{ fontSize: 10 }}>● LIVE</span>
              </div>

              <div style={{ marginTop: 12, flex: 1 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Timeline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5 }}>
                  {[
                    { s: 1, l: 'Letter drafted by Paybacker', time: 'just now' },
                    { s: 2, l: 'You sent it from your email', time: 'today' },
                    { s: 3, l: 'Virgin Media replied', time: 'day 3', alert: true },
                    { s: 4, l: 'Refund £312 received', time: 'day 5', won: true },
                  ].map((e, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        opacity: timelineStage >= e.s ? 1 : 0.25,
                        transition: 'opacity 300ms',
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background:
                            timelineStage >= e.s ? (e.won ? 'var(--mint-deep)' : 'var(--text-2)') : '#E5E7EB',
                          color: '#fff',
                          fontSize: 10,
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 700,
                          animation: e.alert && timelineStage === 3 ? 'demoPingRing 1s ease-out' : 'none',
                        }}
                      >
                        ✓
                      </div>
                      <div style={{ flex: 1 }}>{e.l}</div>
                      <span className="mono" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>{e.time}</span>
                      {e.won && timelineStage >= 4 && (
                        <span className="pill mint" style={{ fontSize: 10 }}>WON</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {showDualAlert && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '9px 12px',
                    background: 'var(--ink)',
                    color: '#fff',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 11,
                    animation: 'demoFadeInUp 400ms',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--mint)',
                      flexShrink: 0,
                      animation: 'demoPulse 1.2s infinite',
                    }}
                  />
                  <span>
                    Alert sent: <b>Paybacker inbox</b> + <b>Telegram</b>
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <div
                      style={{
                        padding: '3px 7px',
                        borderRadius: 4,
                        background: 'rgba(52,211,153,.15)',
                        color: '#6EE7B7',
                        fontSize: 9.5,
                        fontWeight: 700,
                      }}
                    >
                      🔔 App
                    </div>
                    <div
                      style={{
                        padding: '3px 7px',
                        borderRadius: 4,
                        background: 'rgba(52,211,153,.15)',
                        color: '#6EE7B7',
                        fontSize: 9.5,
                        fontWeight: 700,
                      }}
                    >
                      ✈ Telegram
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showInboxPicker && (
        <div
          style={{
            position: 'absolute',
            right: 60,
            bottom: 90,
            width: 340,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 24px 56px -12px rgba(0,0,0,.28)',
            border: '1px solid var(--divider)',
            zIndex: 40,
            animation: 'demoDropdownIn 250ms cubic-bezier(.4,0,.2,1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 13px',
              borderBottom: '1px solid var(--divider)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div className="eyebrow" style={{ fontSize: 10 }}>Pick an email thread to watch</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Threads matching Virgin Media</div>
            </div>
            <span className="pill grey" style={{ fontSize: 9.5 }}>3 found</span>
          </div>
          {[
            { subj: 'Re: Your account 8847261', from: 'disputes@virginmedia.com', date: '10 min ago', suggested: true },
            { subj: 'Your Virgin Media bill is ready', from: 'bills@virginmedia.com', date: '3 Nov', suggested: false },
            { subj: 'Welcome to Virgin Media', from: 'hello@virginmedia.com', date: '12 Aug', suggested: false },
          ].map((th, i) => (
            <div
              key={i}
              ref={th.suggested ? threadItemRef : null}
              style={{
                padding: '9px 13px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderTop: i ? '1px solid #F3F4F6' : 'none',
                background: th.suggested ? 'var(--mint-wash)' : '#fff',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: th.suggested ? 'var(--mint-deep)' : '#F3F4F6',
                  color: th.suggested ? '#fff' : 'var(--text-2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                ✉
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: th.suggested ? 700 : 600,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {th.subj}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                  {th.from} · {th.date}
                </div>
              </div>
              {th.suggested && (
                <span className="pill mint" style={{ fontSize: 9.5 }}>SUGGESTED</span>
              )}
            </div>
          ))}
          <div
            style={{
              padding: '8px 13px',
              background: '#FAFAF7',
              borderTop: '1px solid var(--divider)',
              fontSize: 10,
              color: 'var(--text-3)',
              lineHeight: 1.45,
            }}
          >
            We only read the subject, sender and reply status — never the body.
          </div>
        </div>
      )}

      <div className="cursor" style={{ left: cursorPos.x, top: cursorPos.y, opacity: cursorPos.o }}>
        {CURSOR_SVG}
      </div>
      {clickDraft && (
        <div className="click-ring" style={{ left: cursorPos.x + 11, top: cursorPos.y + 11 }} key={`c1-${Math.floor(t * 10)}`} />
      )}
      {clickLink && (
        <div className="click-ring" style={{ left: cursorPos.x + 11, top: cursorPos.y + 11 }} key={`c2-${Math.floor(t * 10)}`} />
      )}
      {clickThread && (
        <div className="click-ring" style={{ left: cursorPos.x + 11, top: cursorPos.y + 11 }} key={`c3-${Math.floor(t * 10)}`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Pocket Agent · Telegram
// ---------------------------------------------------------------------------
type PAMsg =
  | { from: number; kind: 'bot-alert' }
  | { from: number; kind: 'user'; text: string }
  | { from: number; kind: 'bot-spend' }
  | { from: number; kind: 'bot-disputes' }
  | { from: number; kind: 'bot-afford' }
  | { from: number; kind: 'bot-draft' }
  | { from: number; kind: 'user-accept' };

export function PocketAgentDemo() {
  const { ref, t } = useInViewTicker(15);

  const msgs: PAMsg[] = [
    { from: 0.0, kind: 'bot-alert' },
    { from: 1.2, kind: 'user', text: 'How much did I spend on eating out last month?' },
    { from: 2.0, kind: 'bot-spend' },
    { from: 3.5, kind: 'user', text: 'Show me every dispute I\u2019ve won this year' },
    { from: 4.3, kind: 'bot-disputes' },
    { from: 6.3, kind: 'user', text: 'Can I afford the new Macbook? It\u2019s £1,599.' },
    { from: 7.1, kind: 'bot-afford' },
    { from: 9.5, kind: 'user', text: 'fight it' },
    { from: 10.3, kind: 'bot-draft' },
    { from: 12.0, kind: 'user-accept' },
  ];
  const visible = msgs.filter((m) => t > m.from);
  const typing = (() => {
    if (t > 1.6 && t < 2.0) return true;
    if (t > 3.9 && t < 4.3) return true;
    if (t > 6.7 && t < 7.1) return true;
    if (t > 9.9 && t < 10.3) return true;
    return false;
  })();

  const inputText = (() => {
    const q1 = 'How much did I spend on eating out last month?';
    const q2 = 'Show me every dispute I\u2019ve won this year';
    const q3 = 'Can I afford the new Macbook? It\u2019s £1,599.';
    const q4 = 'fight it';
    if (t >= 0.4 && t < 1.2)
      return q1.slice(0, Math.floor(q1.length * Math.min(1, (t - 0.4) / 0.8)));
    if (t >= 2.7 && t < 3.5)
      return q2.slice(0, Math.floor(q2.length * Math.min(1, (t - 2.7) / 0.8)));
    if (t >= 5.5 && t < 6.3)
      return q3.slice(0, Math.floor(q3.length * Math.min(1, (t - 5.5) / 0.8)));
    if (t >= 9.1 && t < 9.5)
      return q4.slice(0, Math.floor(q4.length * Math.min(1, (t - 9.1) / 0.4)));
    return '';
  })();

  const spendCats = [
    { l: 'Eating out', v: 312.4, pct: 100, hl: true },
    { l: 'Groceries', v: 286.1, pct: 92, hl: false },
    { l: 'Transport', v: 164.3, pct: 53, hl: false },
  ];
  const wins = [
    { m: 'Virgin Media', a: '£312' },
    { m: 'Funding Circle', a: '£468' },
    { m: 'EE', a: '£24' },
  ];
  const features: Array<[string, string]> = [
    ['💬', 'Ask anything about your finances'],
    ['🛡️', 'Draft & track disputes'],
    ['📊', 'Spending breakdowns on demand'],
    ['⚠️', 'Live hike + payment alerts'],
    ['📎', 'Forward a bill — we parse it'],
  ];

  return (
    <div className="demo-stage dark" ref={ref}>
      <span className="demo-label">
        Pocket Agent · full financial assistant · ask anything · use any tool · 14s loop
      </span>

      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
        {/* LEFT brand panel */}
        <div style={{ padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--mint)',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mint)', animation: 'demoPulse 1.6s infinite' }} />
            Pocket Agent · Telegram
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '-.02em',
              lineHeight: 1.05,
              color: '#fff',
              marginBottom: 12,
            }}
          >
            A financial assistant,
            <br />
            in your pocket.
          </div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.7)', lineHeight: 1.55, maxWidth: 340 }}>
            Ask anything about your money — spending, income, disputes, categories, affordability. Every tool from the
            web app, reachable from one chat.
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {features.map(([e, l], i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'rgba(255,255,255,.82)', fontSize: 12.5 }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: 'rgba(52,211,153,.14)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                  }}
                >
                  {e}
                </span>
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT Telegram phone */}
        <div style={{ padding: '18px 22px 18px 0', display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              maxHeight: 520,
              background: '#17212B',
              borderRadius: 28,
              overflow: 'hidden',
              border: '7px solid #0D0D10',
              boxShadow: '0 24px 48px -12px rgba(0,0,0,.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                background: '#202B36',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderBottom: '1px solid rgba(255,255,255,.04)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#34D399,#059669)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#0B1220',
                }}
              >
                P
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fff' }}>Paybacker</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.5)' }}>assistant · online</div>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                overflow: 'hidden',
                justifyContent: 'flex-end',
                minHeight: 0,
              }}
            >
              {visible.map((m, i) => {
                if (m.kind === 'bot-alert') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#2E2416',
                        color: '#FDE68A',
                        border: '1px solid rgba(251,191,36,.35)',
                        padding: '7px 9px',
                        borderRadius: '10px 10px 10px 2px',
                        maxWidth: '86%',
                        fontSize: 10,
                        animation: 'demoMsgIn 350ms',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#FCD34D', marginBottom: 3 }}>
                        ⚠ Virgin Media: £38 → £50
                      </div>
                      <div style={{ color: 'rgba(253,230,138,.9)', fontSize: 9.5 }}>
                        Ofcom breach · reply &ldquo;fight it&rdquo; to dispute →
                      </div>
                    </div>
                  );
                }
                if (m.kind === 'user') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-end',
                        background: '#2B5278',
                        color: '#fff',
                        padding: '5px 9px',
                        borderRadius: '10px 10px 2px 10px',
                        maxWidth: '78%',
                        fontSize: 10,
                        animation: 'demoMsgIn 300ms',
                      }}
                    >
                      {m.text}
                    </div>
                  );
                }
                if (m.kind === 'user-accept') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-end',
                        background: '#2B5278',
                        color: '#fff',
                        padding: '5px 9px',
                        borderRadius: '10px 10px 2px 10px',
                        maxWidth: '40%',
                        fontSize: 10,
                        animation: 'demoMsgIn 300ms',
                      }}
                    >
                      ✓ Accept
                    </div>
                  );
                }
                if (m.kind === 'bot-spend') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#182533',
                        color: '#fff',
                        padding: '8px 10px',
                        borderRadius: '10px 10px 10px 2px',
                        maxWidth: '92%',
                        fontSize: 10,
                        animation: 'demoMsgIn 350ms',
                      }}
                    >
                      <div>
                        You spent <b style={{ color: '#6EE7B7' }}>£312.40</b> on eating out in October — 16% up on September. Here&rsquo;s the context:
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {spendCats.map((c, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5 }}>
                            <span style={{ width: 68, color: c.hl ? '#6EE7B7' : 'rgba(255,255,255,.7)' }}>{c.l}</span>
                            <div
                              style={{
                                flex: 1,
                                height: 4,
                                background: 'rgba(255,255,255,.08)',
                                borderRadius: 2,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${c.pct}%`,
                                  height: '100%',
                                  background: c.hl ? '#34D399' : 'rgba(255,255,255,.3)',
                                }}
                              />
                            </div>
                            <span
                              className="mono"
                              style={{
                                width: 42,
                                textAlign: 'right',
                                color: c.hl ? '#fff' : 'rgba(255,255,255,.6)',
                                fontSize: 9.5,
                              }}
                            >
                              £{c.v}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 9, color: 'rgba(255,255,255,.45)' }}>
                        Top merchants: Dishoom, Pret, Honest Burgers
                      </div>
                    </div>
                  );
                }
                if (m.kind === 'bot-disputes') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#182533',
                        color: '#fff',
                        padding: '8px 10px',
                        borderRadius: '10px 10px 10px 2px',
                        maxWidth: '92%',
                        fontSize: 10,
                        animation: 'demoMsgIn 350ms',
                      }}
                    >
                      <div>
                        3 disputes won in 2026 — <b style={{ color: '#6EE7B7' }}>£804 total</b>.
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {wins.map((w, j) => (
                          <div
                            key={j}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 7px',
                              background: 'rgba(52,211,153,.1)',
                              border: '1px solid rgba(52,211,153,.22)',
                              borderRadius: 5,
                            }}
                          >
                            <span style={{ fontSize: 9.5 }}>{w.m}</span>
                            <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: '#6EE7B7' }}>+{w.a}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (m.kind === 'bot-afford') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#182533',
                        color: '#fff',
                        padding: '8px 10px',
                        borderRadius: '10px 10px 10px 2px',
                        maxWidth: '94%',
                        fontSize: 10,
                        animation: 'demoMsgIn 350ms',
                      }}
                    >
                      <div>
                        Short answer: <b style={{ color: '#6EE7B7' }}>yes, comfortably</b> — here&rsquo;s the math:
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: 'JetBrains Mono,monospace',
                          fontSize: 9.5,
                          lineHeight: 1.55,
                          background: 'rgba(255,255,255,.04)',
                          padding: '7px 9px',
                          borderRadius: 6,
                        }}
                      >
                        <div>Monthly income&nbsp;&nbsp;<span style={{ float: 'right' }}>£3,820</span></div>
                        <div>Fixed outgoings&nbsp;<span style={{ float: 'right' }}>−£1,847</span></div>
                        <div>Avg spending&nbsp;&nbsp;&nbsp;<span style={{ float: 'right' }}>−£1,114</span></div>
                        <div
                          style={{
                            borderTop: '1px solid rgba(255,255,255,.1)',
                            marginTop: 4,
                            paddingTop: 4,
                            color: '#6EE7B7',
                            fontWeight: 700,
                          }}
                        >
                          Monthly slack&nbsp;<span style={{ float: 'right' }}>£859</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 9.5, color: 'rgba(255,255,255,.7)' }}>
                        £1,599 ≈ 1.9 months slack. Waiting till payday on the 28th keeps your buffer intact.
                      </div>
                    </div>
                  );
                }
                if (m.kind === 'bot-draft') {
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#182533',
                        color: '#fff',
                        padding: '7px 9px',
                        borderRadius: '10px 10px 10px 2px',
                        maxWidth: '88%',
                        fontSize: 10,
                        animation: 'demoMsgIn 350ms',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 3, color: '#6EE7B7' }}>Letter drafted</div>
                      <div
                        style={{
                          background: 'rgba(255,255,255,.04)',
                          padding: '5px 7px',
                          borderRadius: 5,
                          fontSize: 9,
                          lineHeight: 1.4,
                          color: 'rgba(255,255,255,.8)',
                          fontStyle: 'italic',
                          marginBottom: 5,
                        }}
                      >
                        &ldquo;…under Ofcom GC C1.8 + CRA 2015 s.49, £312 refund requested…&rdquo;
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <div
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '4px 0',
                            background: t > 12.2 ? '#10B981' : '#34D399',
                            color: '#0B1220',
                            borderRadius: 5,
                            fontSize: 9.5,
                            fontWeight: 700,
                            transition: 'background 300ms',
                          }}
                        >
                          {t > 12.2 ? '✓ Copied' : 'Accept · copy letter'}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '4px 0',
                            background: 'rgba(255,255,255,.08)',
                            color: '#fff',
                            borderRadius: 5,
                            fontSize: 9.5,
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {typing && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    padding: '7px 11px',
                    background: '#182533',
                    borderRadius: '10px 10px 10px 2px',
                    display: 'flex',
                    gap: 3,
                  }}
                >
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,.5)',
                        animation: `demoDotPulse 1.2s ${j * 0.15}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                background: '#17212B',
                padding: '7px 9px',
                borderTop: '1px solid rgba(255,255,255,.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: '#242F3D',
                  borderRadius: 12,
                  padding: '5px 9px',
                  fontSize: 9.5,
                  color: inputText ? '#fff' : 'rgba(255,255,255,.42)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {inputText || 'Ask anything…'}
                {inputText && <span className="caret" />}
              </div>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#34D399',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#0B1220',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                ➤
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Money Hub
// ---------------------------------------------------------------------------
export function MoneyHubDemo() {
  const { ref, t } = useInViewTicker(15);

  const syncing = t < 1.3;
  const interp = (start: number, end: number, from: number, to: number) =>
    Math.max(0, Math.min(1, (t - start) / (end - start))) * (to - from) + from;

  const kIncome = Math.round(interp(1.3, 2.4, 0, 12351.04));
  const kSpent = Math.round(interp(1.4, 2.5, 0, 21968.91));
  const kSavings = interp(1.5, 2.6, 0, -77.9).toFixed(1);
  const kHealth = Math.round(interp(1.6, 2.7, 0, 33));

  const catProgress = Math.max(0, Math.min(1, (t - 2.6) / 2.0));
  const trendsProgress = Math.max(0, Math.min(1, (t - 4.6) / 1.4));
  const budgetsVisible = t > 6.0;
  const showBillsGrid = t > 8.0;

  const actionItems = [
    { at: 9.6, kind: 'hike', title: 'Sky mid-contract price rise', sub: '£41.00 → £46.00 · +12.2% · Ofcom exit right', pill: 'DISPUTE' },
    { at: 10.4, kind: 'email', title: 'Apple: Upwork Plus renews 5 May', sub: '£29.00/mo · detected in Gmail receipt · consider downgrade', pill: 'REVIEW' },
    { at: 11.2, kind: 'deal', title: 'Virgin Media — 3 cheaper broadband deals', sub: '£56.36/mo → £17.99/mo · save £460/yr', pill: 'SAVE £460' },
    { at: 12.0, kind: 'delay', title: 'South Western Railway delay repay', sub: '15+ min delay on 9 Apr 2026 · claim window closes 7 May', pill: 'CLAIM £5.20' },
  ] as const;

  const kpiTiles: Array<{ l: string; v: string; c: string; i: string; sub?: string }> = [
    { l: 'Income · Apr', v: `£${kIncome.toLocaleString()}`, c: 'var(--mint-deep)', i: '↗' },
    { l: 'Spent · Apr', v: `£${kSpent.toLocaleString()}`, c: 'var(--text)', i: '↘' },
    { l: 'Savings rate', v: `${kSavings}%`, c: '#B91C1C', i: '⚠' },
    { l: 'Health score', v: `${kHealth}`, sub: '/100', c: '#F59E0B', i: '◎' },
  ];

  const incomeRows = [
    { l: 'Rental income', p: 88.7, v: 10963.55, c: 'var(--orange)' },
    { l: 'Loan repayment', p: 8.1, v: 997.49, c: '#EF4444' },
    { l: 'Salary', p: 3.2, v: 400.0, c: 'var(--mint-deep)' },
  ];
  const spendRows = [
    { l: 'Mortgage', p: 19.8, v: 4339.31, c: '#3B82F6' },
    { l: 'Bills', p: 15.6, v: 3423.8, c: '#06B6D4' },
    { l: 'Loans', p: 14.4, v: 3158.53, c: '#EF4444' },
    { l: 'Professional', p: 14.3, v: 3136.47, c: '#8B5CF6' },
    { l: 'Software', p: 4.5, v: 980.08, c: '#F59E0B' },
  ];
  const monthlyBars = [
    { m: 'Nov', i: 0.3, s: 0.35 },
    { m: 'Dec', i: 0.4, s: 0.45 },
    { m: 'Jan', i: 0.7, s: 0.55 },
    { m: 'Feb', i: 0.95, s: 0.85 },
    { m: 'Mar', i: 0.75, s: 0.6 },
    { m: 'Apr', i: 0.6, s: 0.85 },
  ];
  const budgets = [
    { l: 'Groceries', v: 681.25, cap: 500, over: true },
    { l: 'Travel', v: 207.14, cap: 400, over: false },
    { l: 'Energy', v: 396.57, cap: 300, over: true },
  ];
  type Bill = { n: string; s: string; v: string; st: 'paid' | 'upcoming' };
  const bills: Bill[] = [
    { n: 'Santander Loans', s: 'Due 4th', v: '£447.12', st: 'paid' },
    { n: 'DVLA Vehicle Tax', s: 'Due 10th', v: '£30.18', st: 'paid' },
    { n: 'Lendinvest BTL', s: 'Due 12th', v: '£1,800.44', st: 'paid' },
    { n: 'London Borough', s: 'Due 15th', v: '£93.89', st: 'paid' },
    { n: 'Loqbox', s: 'Due 21st', v: '£34.95', st: 'paid' },
    { n: 'Thames Water', s: 'Due 22nd', v: '£44.84', st: 'paid' },
    { n: 'Skipton BS', s: 'Due 28th', v: '£817.42', st: 'upcoming' },
    { n: 'ManyPets', s: 'Due 2nd', v: '£50.42', st: 'upcoming' },
    { n: 'Patreon', s: 'Due 3rd', v: '£8.00', st: 'upcoming' },
    { n: 'Starlink', s: 'Due 9th', v: '£56.36', st: 'paid' },
    { n: 'City of Westminster', s: 'Due 10th', v: '£60.57', st: 'paid' },
    { n: 'Creation Financial', s: 'Due 20th', v: '£397.95', st: 'upcoming' },
  ];

  return (
    <div className="demo-stage" ref={ref}>
      <span className="demo-label">
        Money Hub · categories · budgets · Financial Action Centre · 14s loop
      </span>

      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 32,
          right: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          zIndex: 2,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'var(--mint-wash)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
              }}
            >
              📊
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.015em' }}>Money Hub</div>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>
            Auto-syncs 4× daily · {syncing ? 'Syncing Lloyds · NatWest · Outlook…' : 'Last synced just now'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="pill grey" style={{ fontSize: 10 }}>This month ▾</span>
          <span className="pill mint" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--mint-deep)',
                animation: syncing ? 'demoPulse 1s infinite' : 'none',
              }}
            />
            {syncing ? 'Syncing' : '2 banks · 1 email connected'}
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: '82px 26px 24px 26px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gridTemplateRows: 'auto auto auto auto auto',
          gap: 8,
          overflow: 'hidden',
          fontSize: 10.5,
        }}
      >
        {kpiTiles.map((k, i) => (
          <div
            key={i}
            style={{
              background: '#fff',
              border: '1px solid var(--divider)',
              borderRadius: 10,
              padding: '9px 11px',
              boxShadow: '0 1px 2px rgba(0,0,0,.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 9.5,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  fontWeight: 600,
                }}
              >
                {k.l}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{k.i}</span>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: k.c,
                letterSpacing: '-.01em',
                marginTop: 2,
              }}
            >
              {k.v}
              {k.sub && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{k.sub}</span>}
            </div>
          </div>
        ))}

        <div
          style={{
            gridColumn: '1 / 3',
            background: '#fff',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '9px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>📈 Income</div>
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>Tap to see transactions</span>
          </div>
          {incomeRows.map((r, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                <span>
                  <span style={{ color: 'var(--text)' }}>{r.l}</span>
                  <span style={{ color: 'var(--text-3)', marginLeft: 3 }}>{r.p}%</span>
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  £{r.v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ height: 3, background: '#F3F4F6', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                <div style={{ width: `${r.p * catProgress}%`, height: '100%', background: r.c, transition: 'width 60ms' }} />
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 5,
              paddingTop: 5,
              borderTop: '1px solid var(--divider)',
              fontSize: 10,
            }}
          >
            <span style={{ color: 'var(--text-3)' }}>Total</span>
            <span className="mono" style={{ fontWeight: 800 }}>£12,351.04</span>
          </div>
        </div>

        <div
          style={{
            gridColumn: '3 / 5',
            background: '#fff',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '9px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>📉 Spending</div>
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>Tap to recategorise</span>
          </div>
          {spendRows.map((r, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                <span>
                  <span style={{ color: 'var(--text)' }}>{r.l}</span>
                  <span style={{ color: 'var(--text-3)', marginLeft: 3 }}>{r.p}%</span>
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  £{r.v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ height: 3, background: '#F3F4F6', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
                <div style={{ width: `${r.p * catProgress * 4}%`, height: '100%', background: r.c, transition: 'width 60ms' }} />
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            gridColumn: '1 / 3',
            background: '#fff',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '9px 12px',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>📊 Monthly trends</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              height: 46,
              gap: 6,
              padding: '0 2px',
            }}
          >
            {monthlyBars.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 36 }}>
                  <div
                    style={{
                      width: 6,
                      height: `${b.i * 100 * trendsProgress}%`,
                      background: 'var(--mint-deep)',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 80ms',
                    }}
                  />
                  <div
                    style={{
                      width: 6,
                      height: `${b.s * 100 * trendsProgress}%`,
                      background: 'var(--orange)',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 80ms',
                    }}
                  />
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{b.m}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: 'var(--text-3)' }}>
            <span>
              <span style={{ display: 'inline-block', width: 7, height: 7, background: 'var(--mint-deep)', borderRadius: 2, marginRight: 3 }} />
              Income
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 7, height: 7, background: 'var(--orange)', borderRadius: 2, marginRight: 3 }} />
              Spending
            </span>
          </div>
        </div>

        <div
          style={{
            gridColumn: '3 / 5',
            background: '#fff',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '9px 12px',
            opacity: budgetsVisible ? 1 : 0.3,
            transition: 'opacity 400ms',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>🎯 Budgets &amp; goals</div>
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>Active budgets</span>
          </div>
          {budgets.map((b, i) => {
            const pct = Math.min(b.v / b.cap, 1);
            const overAmount = b.v - b.cap;
            return (
              <div key={i} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                  <span>{b.l}</span>
                  <span className="mono" style={{ color: b.over ? '#DC2626' : 'var(--text-2)', fontWeight: 600 }}>
                    £{b.v.toFixed(2)} / £{b.cap}.00
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: '#F3F4F6',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginTop: 2,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${pct * 100}%`,
                      height: '100%',
                      background: b.over ? '#EF4444' : 'var(--mint-deep)',
                      animation: b.over && budgetsVisible ? 'demoBudgetPulse 1.8s infinite' : 'none',
                    }}
                  />
                </div>
                {b.over && (
                  <div style={{ fontSize: 9, color: '#DC2626', marginTop: 1, fontWeight: 600 }}>
                    Over by £{overAmount.toFixed(2)}
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10,
              marginTop: 6,
              paddingTop: 5,
              borderTop: '1px solid var(--divider)',
            }}
          >
            <div>
              <span
                style={{
                  color: 'var(--text-3)',
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  fontWeight: 700,
                }}
              >
                Savings goal · Travel
              </span>
              <div style={{ marginTop: 2 }}>
                £350 / <span style={{ color: 'var(--text-3)' }}>£1,000</span>
              </div>
            </div>
            <div style={{ width: 80, height: 4, background: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '35%', height: '100%', background: 'var(--mint-deep)' }} />
            </div>
          </div>
        </div>

        <div
          style={{
            gridColumn: '1 / 5',
            background: '#fff',
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '9px 12px',
            opacity: showBillsGrid ? 1 : 0.3,
            transition: 'opacity 400ms',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>
              🕐 Expected bills ·{' '}
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>£5,937.23 expected</span>
            </div>
            <div style={{ display: 'flex', gap: 5, fontSize: 9, color: 'var(--text-3)' }}>
              <span><span style={{ color: 'var(--mint-deep)' }}>●</span> Paid</span>
              <span><span style={{ color: '#EF4444' }}>●</span> Past due</span>
              <span><span style={{ color: 'var(--orange)' }}>●</span> Upcoming</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
            {bills.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: '5px 7px',
                  borderRadius: 5,
                  background: '#FAFAF7',
                  border: '1px solid #F3F4F6',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: b.st === 'upcoming' ? 'var(--text)' : 'var(--text-3)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: b.st === 'paid' ? 'line-through' : 'none',
                  }}
                >
                  {b.n}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 1 }}>
                  {b.s} ·{' '}
                  <span style={{ color: b.st === 'paid' ? 'var(--mint-deep)' : 'var(--orange)', fontWeight: 600 }}>
                    {b.st === 'paid' ? '✓ Paid' : 'Upcoming'}
                  </span>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    marginTop: 1,
                    textDecoration: b.st === 'paid' ? 'line-through' : 'none',
                    color: b.st === 'paid' ? 'var(--text-3)' : 'var(--text)',
                  }}
                >
                  {b.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            gridColumn: '1 / 5',
            background: 'linear-gradient(180deg, #FFFBEB, #fff)',
            border: '1px solid #FDE68A',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#78350F', display: 'flex', alignItems: 'center', gap: 5 }}>
                ⚡ Financial Action Centre
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    background: '#FEF3C7',
                    padding: '2px 6px',
                    borderRadius: 999,
                  }}
                >
                  1 due soon · 78 tracked
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#92400E', marginTop: 2 }}>
                Detected from your bank transactions <b>and</b> inbox scan — actions worth a few minutes of your time.
              </div>
            </div>
            <span className="pill ink" style={{ fontSize: 9.5 }}>Browse deals →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actionItems.map((a, i) => {
              const visible = t > a.at;
              const pillColor = a.pill.startsWith('DISPUTE')
                ? '#EF4444'
                : a.pill.startsWith('REVIEW')
                  ? '#F59E0B'
                  : a.pill.startsWith('SAVE')
                    ? 'var(--mint-deep)'
                    : '#3B82F6';
              const icon = a.kind === 'hike' ? '↑' : a.kind === 'email' ? '✉' : a.kind === 'deal' ? '★' : '🚆';
              return (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--divider)',
                    borderRadius: 7,
                    padding: '6px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(4px)',
                    transition: 'opacity 300ms, transform 300ms',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: '#F3F4F6',
                      color: 'var(--text-2)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        color: 'var(--text-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 1,
                      }}
                    >
                      {a.sub}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: `${pillColor}14`,
                      color: pillColor,
                      letterSpacing: '.03em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.pill}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== DEMO 4 · SUBSCRIPTIONS TRACKER ==================== */
type SubRow = {
  name: string;
  provider: string;
  price: string;
  cat: string;
  i: string;
  in: number;
  pill?: { t: string; c: 'red' | 'mint' | 'orange' };
};

export function SubscriptionsDemo() {
  const { ref: tickerRef, t } = useInViewTicker(11);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const setBothRefs = (node: HTMLDivElement | null) => {
    stageRef.current = node;
    tickerRef.current = node;
  };

  const rows: SubRow[] = [
    { name: 'Mortgage', provider: 'NatWest · 5-yr fixed', price: '£1,142.00', cat: 'Mortgage', i: '🏠', in: 3.0 },
    { name: 'Funding Circle loan', provider: 'Business loan · rate jumped 32%', price: '£189.50', cat: 'Loan', i: '£', in: 3.2, pill: { t: 'CHALLENGEABLE', c: 'red' } },
    { name: 'Car insurance', provider: 'Aviva · renews 14 May', price: '£67.40', cat: 'Insurance', i: '🛡', in: 3.4 },
    { name: 'Virgin Media', provider: 'Broadband + TV · last hike 12 Nov', price: '£56.36', cat: 'Telecom', i: '📶', in: 3.6, pill: { t: 'SAVE £460/yr', c: 'mint' } },
    { name: 'Octopus Energy', provider: 'Electricity · tracker tariff', price: '£94.00', cat: 'Utility', i: '⚡', in: 3.8 },
    { name: 'Spotify Family', provider: 'Music · 4 profiles used', price: '£19.99', cat: 'Subscription', i: '♫', in: 4.0 },
    { name: 'Netflix Premium', provider: 'Streaming · watched today', price: '£17.99', cat: 'Subscription', i: '▶', in: 4.2 },
    { name: 'Audible', provider: 'Audiobooks · not used 94 days', price: '£7.99', cat: 'Subscription', i: '🎧', in: 4.4, pill: { t: 'DORMANT', c: 'orange' } },
  ];

  const scanProgress = Math.min(100, (t / 2.0) * 100);
  const scanning = t < 2.0;

  const cursor = (() => {
    if (t < 7.5 || t > 9.5) return { x: 0, y: 0, o: 0 };
    const tgt = targetCenter(stageRef, pillRef);
    if (!tgt) return { x: 0, y: 0, o: 0 };
    if (t < 7.9) {
      const k = Math.max(0, Math.min(1, (t - 7.5) / 0.4));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const from = { x: 100, y: 120 };
      return { x: from.x + (tgt.x - from.x) * e, y: from.y + (tgt.y - from.y) * e, o: 1 };
    }
    return { ...tgt, o: 1 };
  })();
  const showTip = t > 7.9 && t < 9.5;

  const tipPos = (() => {
    const pc = targetCenter(stageRef, pillRef);
    return {
      left: pc ? Math.max(20, pc.x - 240 + 30) : 420,
      top: pc ? pc.y - 80 : 355,
    };
  })();

  return (
    <div className="demo-stage" ref={setBothRefs}>
      <span className="demo-label">Subscriptions tracker · every fixed outgoing in one view · 10s loop</span>

      <div style={{ position: 'absolute', inset: '48px 44px' }}>
        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--divider)', padding: '14px 20px', boxShadow: 'var(--shadow-md)', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div className="eyebrow">Fixed outgoings · Money Hub</div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', marginTop: 3 }}>
                {scanning ? 'Scanning 3 accounts…' : '27 recurring payments tracked'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Subscriptions · loans · mortgage · insurance · utilities · telecom — all in one view.
              </div>
            </div>
            {!scanning && (
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
                <div>
                  <div style={{ color: 'var(--text-3)', fontSize: 10.5 }}>Tracked / mo</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>£1,847.23</div>
                </div>
                <div>
                  <div style={{ color: 'var(--mint-deep)', fontSize: 10.5 }}>Savings in Deals</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--mint-deep)' }}>£523/yr</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ height: 4, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${scanProgress}%`, height: '100%', background: 'linear-gradient(90deg,var(--mint),var(--mint-deep))', transition: 'width 80ms linear' }} />
          </div>
          {/* Category chips */}
          {t > 2.0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
              {['All · 27', 'Subscriptions · 11', 'Utilities · 4', 'Telecom · 3', 'Insurance · 3', 'Loans · 2', 'Mortgage · 1', 'Dormant · 4'].map((c, i) => (
                <span
                  key={i}
                  className={i === 0 ? 'pill ink' : 'pill grey'}
                  style={{
                    fontSize: 10.5,
                    padding: '4px 9px',
                    opacity: t > 2.0 + i * 0.1 ? 1 : 0,
                    transform: t > 2.0 + i * 0.1 ? 'translateY(0)' : 'translateY(4px)',
                    transition: 'opacity 250ms, transform 250ms',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => {
            const visible = t > r.in;
            const isVirgin = r.name === 'Virgin Media';
            const highlight = isVirgin && showTip;
            return (
              <div
                key={i}
                style={{
                  background: '#fff',
                  borderRadius: 9,
                  border: '1px solid var(--divider)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(4px)',
                  transition: 'opacity 250ms, transform 250ms, box-shadow 200ms',
                  boxShadow: highlight ? '0 0 0 2px var(--mint-deep)' : 'none',
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 7, background: '#F3F4F6', display: 'grid', placeItems: 'center', fontSize: 13 }}>{r.i}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{r.provider}</div>
                </div>
                <span className="pill grey" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>{r.cat}</span>
                {r.pill && (
                  <span ref={isVirgin ? pillRef : null} className={`pill ${r.pill.c}`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                    {r.pill.t}
                  </span>
                )}
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, width: 72, textAlign: 'right' }}>{r.price}</div>
              </div>
            );
          })}
        </div>

        {/* Virgin Media savings tooltip */}
        {showTip && (
          <div
            style={{
              position: 'absolute',
              left: tipPos.left,
              top: tipPos.top,
              width: 240,
              background: 'var(--ink)',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 11px',
              fontSize: 10.5,
              lineHeight: 1.5,
              boxShadow: '0 16px 32px -8px rgba(0,0,0,.35)',
              animation: 'demoFadeInUp 250ms',
              zIndex: 20,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--mint)', marginBottom: 3 }}>£460/yr cheaper deal available</div>
            <div style={{ color: 'rgba(255,255,255,.75)' }}>Open in Deals tab to compare side-by-side.</div>
          </div>
        )}
      </div>

      {/* Cursor */}
      <div className="cursor" style={{ left: cursor.x, top: cursor.y, opacity: cursor.o }}>
        {CURSOR_SVG}
      </div>
    </div>
  );
}

/* ==================== DEMO 5 · EXPORT ==================== */
export function ExportDemo() {
  const { ref, t } = useInViewTicker(10);

  const toggled = t > 2.3;
  const showToggleClick = t > 2.0 && t < 2.3;
  const cursorPos = t < 2.3 ? { x: 220, y: 220 } : t < 5.5 ? { x: 600, y: 280 } : { x: 340, y: 430 };

  const rows = [
    { tab: 'Transactions', count: 124, in: 2.8 },
    { tab: 'Subscriptions', count: 12, in: 3.6 },
    { tab: 'Disputes', count: 7, in: 4.4 },
    { tab: 'Savings log', count: 104, in: 5.0 },
  ];

  const chips = [
    { label: 'CSV', ext: '.csv', in: 5.8 },
    { label: 'Excel', ext: '.xlsx', in: 6.2 },
    { label: 'PDF', ext: '.pdf', in: 6.6 },
  ];
  const showClickCSV = t > 7.0 && t < 7.3;
  const showToast = t > 7.2;

  const gridRows = [
    { m: 'Tesco', a: '−42.80', d: '14 Nov', in: 2.9, hike: false },
    { m: 'Virgin Media ⚠', a: '−50.00', d: '12 Nov', in: 3.3, hike: true },
    { m: 'Spotify', a: '−11.99', d: '10 Nov', in: 3.7, hike: false },
    { m: 'TfL', a: '−2.80', d: '9 Nov', in: 4.1, hike: false },
    { m: 'Audible', a: '−7.99', d: '8 Nov', in: 4.5, hike: false },
    { m: 'Deliveroo', a: '−18.20', d: '7 Nov', in: 4.9, hike: false },
    { m: 'Netflix', a: '−10.99', d: '5 Nov', in: 5.3, hike: false },
  ];

  return (
    <div className="demo-stage" ref={ref}>
      <span className="demo-label">Export · 9s loop</span>

      <div style={{ position: 'absolute', inset: '48px 44px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* LEFT: Export Hub card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--divider)', padding: '20px 22px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="eyebrow">Export hub</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', marginTop: 4 }}>Your data, anywhere</div>
          </div>

          {/* Google Sheets live sync row */}
          <div style={{ background: '#FAFAF7', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0F9D58', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>⊞</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Google Sheets</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Auto-sync every hour</div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: toggled ? 'var(--mint-deep)' : '#D1D5DB',
                  position: 'relative',
                  transition: 'background 300ms',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: toggled ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 300ms',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }}
                />
              </div>
            </div>
            {toggled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mint-deep)', fontWeight: 600, animation: 'demoFadeInUp 300ms' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint-deep)', animation: 'demoPulse 1.5s infinite' }} />
                Live · connected to Paybacker workbook
              </div>
            )}
          </div>

          {/* One-shot download chips */}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>Or download one-shot</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {chips.map((c, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: t > c.in ? 'var(--ink)' : '#F3F4F6',
                    color: t > c.in ? '#fff' : 'var(--text-3)',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'center',
                    transition: 'all 300ms',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                  <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{c.ext}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.55, marginTop: 'auto' }}>
            Read-only scope. We never write to your accounts.
          </div>
        </div>

        {/* RIGHT: Sheets preview */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--divider)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#F8F9FA', borderBottom: '1px solid var(--divider)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: '#0F9D58', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10, fontWeight: 800 }}>⊞</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Paybacker_Export.xlsx</div>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>sheets.google.com</span>
          </div>

          <div style={{ background: '#F1F3F4', display: 'flex', padding: '0 8px', borderBottom: '1px solid var(--divider)' }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderTop: i === 0 ? '2px solid #0F9D58' : '2px solid transparent',
                  background: i === 0 ? '#fff' : 'transparent',
                  color: t > r.in ? 'var(--text)' : 'var(--text-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {r.tab}
                {t > r.in && <span className="mono" style={{ fontSize: 9, color: 'var(--mint-deep)', fontWeight: 700 }}>+{r.count}</span>}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, padding: '8px', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 70px', gap: 1, background: '#F8F9FA', padding: '5px 4px', fontWeight: 700, color: 'var(--text-3)', borderBottom: '1px solid var(--divider)' }}>
              <div></div>
              <div>Merchant</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div style={{ textAlign: 'right' }}>Date</div>
            </div>
            {gridRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 90px 70px',
                  gap: 1,
                  padding: '4px',
                  borderBottom: '1px solid #F0F0F0',
                  color: r.hike ? 'var(--orange-deep)' : 'var(--text)',
                  opacity: t > r.in ? 1 : 0,
                  transform: t > r.in ? 'translateY(0)' : 'translateY(3px)',
                  transition: 'all 220ms ease-out',
                }}
              >
                <div style={{ color: 'var(--text-4)', textAlign: 'center' }}>{i + 2}</div>
                <div>{r.m}</div>
                <div style={{ textAlign: 'right' }}>£{r.a}</div>
                <div style={{ textAlign: 'right', color: 'var(--text-3)' }}>{r.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`toast ${showToast ? 'show' : ''}`}>
        <span className="dot" /> Synced 247 rows to Paybacker workbook
      </div>

      {/* Cursor */}
      <div className="cursor" style={{ left: cursorPos.x, top: cursorPos.y, opacity: t < 8.5 ? 1 : 0 }}>
        {CURSOR_SVG}
      </div>
      {showToggleClick && <div className="click-ring" style={{ left: 240, top: 230 }} key="x1" />}
      {showClickCSV && <div className="click-ring" style={{ left: 360, top: 440 }} key="x2" />}
    </div>
  );
}

/* ==================== DEMO 7 · DEALS TAB ==================== */
export function DealsDemo() {
  const { ref: tickerRef, t } = useInViewTicker(12);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const guideBtnRef = useRef<HTMLButtonElement | null>(null);
  const setBothRefs = (node: HTMLDivElement | null) => {
    stageRef.current = node;
    tickerRef.current = node;
  };

  const deals = [
    { cat: 'Broadband', icon: '📶', from: { n: 'Virgin Media', p: '£56.36' }, to: { n: 'Vodafone Fibre', p: '£17.99' }, save: 460, ends: '14 May', in: 1.6, hl: true },
    { cat: 'Car insurance', icon: '🛡', from: { n: 'Aviva', p: '£67.40' }, to: { n: 'Admiral', p: '£49.20' }, save: 218, ends: '30 Jun', in: 1.9, hl: false },
    { cat: 'Energy', icon: '⚡', from: { n: 'British Gas', p: '£118.00' }, to: { n: 'Octopus Tracker', p: '£94.00' }, save: 288, ends: 'rolling', in: 2.2, hl: false },
  ];

  const showComparison = t > 3.5;
  const showGuide = t > 7.5;
  const cursor = (() => {
    if (t < 5.0 || t > 7.3) return { x: 0, y: 0, o: 0 };
    const tgt = targetCenter(stageRef, guideBtnRef);
    if (!tgt) return { x: 0, y: 0, o: 0 };
    if (t < 5.5) {
      const k = Math.max(0, Math.min(1, (t - 5.0) / 0.5));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const from = { x: 120, y: 140 };
      return { x: from.x + (tgt.x - from.x) * e, y: from.y + (tgt.y - from.y) * e, o: 1 };
    }
    return { ...tgt, o: 1 };
  })();
  const clickGuide = t > 7.2 && t < 7.5;
  const savingsTick = Math.max(0, Math.min(460, (t - 9.5) * 460 / 1.0));

  const compareRows = [
    { l: 'Monthly price', c: '£56.36', d: '£17.99', s: '−£38.37' },
    { l: 'Speed', c: '350 Mbps', d: '500 Mbps', s: '+150' },
    { l: 'Contract', c: 'Rolling', d: '24 months', s: '' },
    { l: 'Setup fee', c: '—', d: '£0', s: '' },
  ];

  const guideSteps = [
    { n: 1, t: 'Check exit right', d: 'Ofcom rule — mid-contract price rise = penalty-free exit within 30 days' },
    { n: 2, t: 'Order Vodafone Fibre', d: 'New connection scheduled before old one ends. No downtime.' },
    { n: 3, t: 'Cancel Virgin Media', d: 'We provide template letter. You send it from your email.' },
    { n: 4, t: 'Confirm first Vodafone bill', d: 'We watch your bank feed and flag if anything goes wrong.' },
  ];

  return (
    <div className="demo-stage" ref={setBothRefs}>
      <span className="demo-label">Deals · links bills to better prices · guidance, not auto-switch · 11s loop</span>

      <div style={{ position: 'absolute', inset: '48px 44px', display: 'flex', gap: 14, flexDirection: 'column' }}>
        {/* Hero strip */}
        <div
          style={{
            background: 'linear-gradient(120deg, var(--mint-wash), #fff 70%)',
            borderRadius: 13,
            border: '1px solid var(--mint)',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: 'var(--mint-deep)' }}>Deals · verified weekly</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.015em', marginTop: 3 }}>
              53 deals matched to <span style={{ color: 'var(--mint-deep)' }}>your</span> bills
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>We compare your current suppliers to live market offers. You choose what to switch.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Potential savings</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: 'var(--mint-deep)', letterSpacing: '-.01em' }}>
              £2,840<span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/yr</span>
            </div>
          </div>
        </div>

        {/* Main */}
        <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Left: deal cards */}
          <div style={{ flex: '0 0 440px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deals.map((d, i) => {
              const visible = t > d.in;
              const highlighted = d.hl && showComparison;
              return (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid var(--divider)',
                    padding: '11px 13px',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateX(0)' : 'translateX(-10px)',
                    transition: 'opacity 350ms, transform 350ms, box-shadow 250ms',
                    boxShadow: highlighted ? '0 0 0 2px var(--mint-deep), var(--shadow-md)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#F3F4F6', display: 'grid', placeItems: 'center', fontSize: 13 }}>{d.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{d.cat}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>Deal ends {d.ends}</div>
                    </div>
                    <span className="pill mint" style={{ fontSize: 10.5 }}>SAVE £{d.save}/yr</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: '7px 0' }}>
                    <div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Your supplier</div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{d.from.n}</div>
                      <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'line-through', marginTop: 1 }}>{d.from.p}/mo</div>
                    </div>
                    <div style={{ color: 'var(--mint-deep)', fontSize: 16, fontWeight: 800 }}>→</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9.5, color: 'var(--mint-deep)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Best deal</div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{d.to.n}</div>
                      <div className="mono" style={{ fontSize: 13, color: 'var(--mint-deep)', fontWeight: 800, marginTop: 1 }}>{d.to.p}/mo</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: comparison + guide panel */}
          <div
            style={{
              flex: 1,
              background: '#fff',
              borderRadius: 12,
              border: '1px solid var(--divider)',
              padding: '16px 18px',
              boxShadow: 'var(--shadow-md)',
              minWidth: 0,
              opacity: showComparison ? 1 : 0,
              transform: showComparison ? 'translateX(0)' : 'translateX(20px)',
              transition: 'opacity 500ms, transform 500ms',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow">Comparison · Virgin Media → Vodafone</div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', marginTop: 3 }}>Side-by-side</div>
              </div>
              <span className="pill mint" style={{ fontSize: 10 }}>Ofcom verified</span>
            </div>

            {/* Comparison table */}
            <div style={{ marginTop: 11, border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
              {compareRows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 1fr 1fr 0.9fr',
                    padding: '7px 10px',
                    fontSize: 11,
                    background: i % 2 ? '#FAFAF7' : '#fff',
                    borderTop: i ? '1px solid var(--divider)' : 'none',
                  }}
                >
                  <div style={{ color: 'var(--text-3)' }}>{r.l}</div>
                  <div style={{ textDecoration: r.l === 'Monthly price' ? 'line-through' : 'none', color: 'var(--text-2)' }}>{r.c}</div>
                  <div style={{ fontWeight: 700 }}>{r.d}</div>
                  <div className="mono" style={{ color: r.s.startsWith('−') ? 'var(--mint-deep)' : 'var(--text-3)', fontWeight: 600, textAlign: 'right' }}>{r.s}</div>
                </div>
              ))}
            </div>

            {/* Savings number (ticking) */}
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--mint-wash)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--mint-dark)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Annual saving if you switch</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>You keep every penny. We charge 0% success fee.</div>
              </div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--mint-deep)', letterSpacing: '-.01em' }}>
                £{Math.round(t > 9.5 ? savingsTick : 460)}
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
              <button style={{ flex: 1, padding: '9px 10px', borderRadius: 7, background: '#F3F4F6', border: 'none', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>Save for later</button>
              <button ref={guideBtnRef} style={{ flex: 2, padding: '9px 10px', borderRadius: 7, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 700 }}>
                See switching guide →
              </button>
            </div>

            {/* Guide panel (overlay) */}
            {showGuide && (
              <div
                style={{
                  position: 'absolute',
                  inset: '12px 12px 12px 12px',
                  background: '#fff',
                  borderRadius: 10,
                  border: '1px solid var(--divider)',
                  padding: '14px 16px',
                  animation: 'demoSlideInRight 350ms cubic-bezier(.4,0,.2,1)',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="eyebrow">Switching guide · Vodafone Fibre</div>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginTop: 3 }}>4 steps · you stay in control</div>
                  </div>
                  <span style={{ fontSize: 14, color: 'var(--text-3)' }}>×</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10, fontSize: 11.5 }}>
                  {guideSteps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 9px', background: '#FAFAF7', borderRadius: 7 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.t}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 10.5, marginTop: 1, lineHeight: 1.45 }}>{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: '8px 10px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 7, fontSize: 10.5, color: '#78350F', lineHeight: 1.45, display: 'flex', gap: 7 }}>
                  <span style={{ fontSize: 12 }}>ⓘ</span>
                  <span>
                    <b>Yapily is read-only.</b> Paybacker never moves your money. You do every switch yourself — we just make it easy.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cursor */}
      <div className="cursor" style={{ left: cursor.x, top: cursor.y, opacity: cursor.o }}>
        {CURSOR_SVG}
      </div>
      {clickGuide && <div className="click-ring" style={{ left: cursor.x + 11, top: cursor.y + 11 }} key={`c1-${Math.floor(t * 10)}`} />}
    </div>
  );
}

/* ==================== DEMO 6 · PAYBACKER MCP ==================== */
export function McpDemo() {
  const { ref, t } = useInViewTicker(11);

  const prompt = 'Which of my bills went up this year and by how much?';
  const promptProgress = Math.max(0, Math.min(1, (t - 1.0) / 2.3));
  const promptTyped = prompt.slice(0, Math.floor(prompt.length * promptProgress));
  const promptDone = t > 3.3;

  const showToolCall = t > 3.5;
  const showToolResult = t > 4.5;
  const summaryText =
    'Three bills increased this year:\n\n' +
    '\u2022 Virgin Media: \u00A338 \u2192 \u00A350 (+32%) \u2014 flagged, no notice given (Ofcom C1.8 breach)\n' +
    '\u2022 British Gas: \u00A395 \u2192 \u00A3118 (+24%) \u2014 within price-cap window, legitimate\n' +
    '\u2022 Sky: \u00A328 \u2192 \u00A334 (+21%) \u2014 check your original contract\n\n' +
    'The Virgin Media hike is already draftable. Want me to open a dispute?';
  const summaryProgress = Math.max(0, Math.min(1, (t - 6.5) / 2.0));
  const summaryTyped = summaryText.slice(0, Math.floor(summaryText.length * summaryProgress));

  const chats = ['Refund hunt', 'Invoice review', 'New conversation'];
  const tools = [
    { n: 'paybacker', on: true, active: true },
    { n: 'filesystem', on: true, active: false },
    { n: 'github', on: true, active: false },
  ];

  type RowTuple = readonly [string, string, string, string, 'orange' | 'grey'];
  const rows: RowTuple[] = [
    ['Virgin Media', '£38', '£50', '+32%', 'orange'],
    ['British Gas', '£95', '£118', '+24%', 'grey'],
    ['Sky', '£28', '£34', '+21%', 'grey'],
  ];

  return (
    <div className="demo-stage dark" style={{ background: '#1a1a1a' }} ref={ref}>
      <span className="demo-label" style={{ color: 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.4)' }}>
        Paybacker MCP · 10s loop
      </span>

      <div
        style={{
          position: 'absolute',
          inset: '28px',
          background: '#1F1F1F',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.08)',
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
        }}
      >
        {/* Traffic lights bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 36,
            background: '#2A2A2A',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
            zIndex: 5,
          }}
        >
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F57' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FEBC2E' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28C840' }} />
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 500 }}>Claude</div>
        </div>

        {/* Sidebar */}
        <div style={{ paddingTop: 36, background: '#202020', borderRight: '1px solid rgba(255,255,255,.06)', padding: '44px 12px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', marginBottom: 10, padding: '0 6px' }}>
            Chats
          </div>
          {chats.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '7px 10px',
                borderRadius: 6,
                background: i === 2 ? 'rgba(255,255,255,.06)' : 'transparent',
                color: i === 2 ? '#fff' : 'rgba(255,255,255,.6)',
                fontSize: 11.5,
                marginBottom: 2,
              }}
            >
              {c}
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', margin: '22px 0 10px', padding: '0 6px' }}>
            MCP tools
          </div>
          {tools.map((m, i) => {
            const isActive = m.active && t > 3.5 && t < 6.5;
            return (
              <div
                key={i}
                style={{
                  padding: '7px 10px',
                  borderRadius: 6,
                  marginBottom: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isActive ? 'rgba(52,211,153,.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(52,211,153,.3)' : '1px solid transparent',
                  transition: 'all 200ms',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isActive ? '#34D399' : '#10B981',
                    animation: isActive ? 'demoPulse 1s infinite' : 'none',
                  }}
                />
                <span
                  style={{
                    fontSize: 11.5,
                    color: isActive ? '#6EE7B7' : 'rgba(255,255,255,.7)',
                    fontWeight: m.active ? 600 : 500,
                    fontFamily: 'JetBrains Mono,monospace',
                  }}
                >
                  {m.n}
                </span>
              </div>
            );
          })}
        </div>

        {/* Conversation */}
        <div style={{ paddingTop: 36, padding: '44px 28px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* User prompt */}
          <div
            style={{
              alignSelf: 'flex-end',
              maxWidth: '80%',
              background: '#2E2E2E',
              borderRadius: '12px 12px 2px 12px',
              padding: '10px 14px',
              fontSize: 12.5,
              color: 'rgba(255,255,255,.92)',
              marginBottom: 14,
            }}
          >
            {promptTyped}
            {!promptDone && <span className="caret" />}
          </div>

          {/* Tool call */}
          {showToolCall && (
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '85%',
                background: 'rgba(52,211,153,.08)',
                border: '1px solid rgba(52,211,153,.25)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 11,
                marginBottom: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#6EE7B7',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                animation: 'demoFadeIn 250ms ease-out',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  border: '1.5px solid #6EE7B7',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: showToolResult ? 'none' : 'demoSpin 0.8s linear infinite',
                }}
              />
              {showToolResult ? '✓' : ''} Called <b>paybacker</b>.query_transactions(year=2026, type="recurring")
            </div>
          )}

          {/* Tool result */}
          {showToolResult && (
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '95%',
                background: '#141414',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                color: 'rgba(255,255,255,.75)',
                animation: 'demoFadeIn 300ms ease-out',
              }}
            >
              <div style={{ color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>→ 3 bills with YoY increase</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 70px 60px',
                  gap: 4,
                  fontSize: 10,
                  color: 'rgba(255,255,255,.4)',
                  borderBottom: '1px solid rgba(255,255,255,.1)',
                  paddingBottom: 4,
                  marginBottom: 4,
                }}
              >
                <div>merchant</div>
                <div style={{ textAlign: 'right' }}>from</div>
                <div style={{ textAlign: 'right' }}>to</div>
                <div style={{ textAlign: 'right' }}>Δ</div>
              </div>
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 70px 60px',
                    gap: 4,
                    padding: '3px 0',
                    color: row[4] === 'orange' ? '#FCD34D' : 'rgba(255,255,255,.8)',
                  }}
                >
                  <div>{row[0]}</div>
                  <div style={{ textAlign: 'right' }}>{row[1]}</div>
                  <div style={{ textAlign: 'right' }}>{row[2]}</div>
                  <div style={{ textAlign: 'right', fontWeight: 700 }}>{row[3]}</div>
                </div>
              ))}
            </div>
          )}

          {/* Claude summary */}
          {summaryProgress > 0 && (
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '90%',
                fontSize: 12.5,
                color: 'rgba(255,255,255,.9)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {summaryTyped}
              {summaryProgress < 1 && <span className="caret" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
