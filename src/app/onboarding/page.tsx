'use client';
// src/app/onboarding/page.tsx
// Four-step onboarding wizard ported from batch5 Onboarding.
// Shown after signup — each step wires to the real OAuth endpoint
// (bank via /api/auth/truelayer, inbox via /api/auth/google or /microsoft).
// Step progress is read from live account state (has bank connection,
// has email connection, has run first scan) so refresh-and-resume works.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Check, Loader2, Mail, CreditCard, Sparkles } from 'lucide-react';

const STEPS = ['Account', 'Connect bank', 'Scan inbox', 'First win'] as const;

interface OnboardingState {
  hasAccount: boolean;
  hasBank: boolean;
  hasEmail: boolean;
  hasScan: boolean;
  userEmail: string | null;
}

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/auth/signup?redirect=/onboarding');
          return;
        }

        const [banks, emails, scans] = await Promise.all([
          supabase.from('bank_connections').select('id').eq('user_id', user.id).eq('status', 'active').limit(1),
          supabase.from('email_connections').select('id').eq('user_id', user.id).eq('status', 'active').limit(1),
          supabase.from('business_log').select('id').eq('user_id', user.id).eq('event_type', 'email_scan_completed').limit(1),
        ]);

        setState({
          hasAccount: true,
          hasBank: (banks.data?.length ?? 0) > 0,
          hasEmail: (emails.data?.length ?? 0) > 0,
          hasScan: (scans.data?.length ?? 0) > 0,
          userEmail: user.email ?? null,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase]);

  const derivedStep = useMemo(() => {
    if (!state) return 0;
    if (!state.hasAccount) return 0;
    if (!state.hasBank) return 1;
    if (!state.hasEmail) return 2;
    if (!state.hasScan) return 3;
    return 3; // max — "First win"
  }, [state]);

  const requestedStep = parseInt(searchParams.get('step') ?? '', 10);
  const activeStep = Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < STEPS.length
    ? requestedStep
    : derivedStep;

  const gotoStep = (n: number) => {
    const qs = n > 0 ? `?step=${n}` : '';
    router.replace(`/onboarding${qs}`);
  };

  const finish = () => router.replace('/dashboard');

  if (loading || !state) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: '#6B7280' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid #E5E7EB',
          background: '#fff',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#0B1220',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
          }}
        >
          P
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>Paybacker</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          Need help?{' '}
          <a href="mailto:support@paybacker.co.uk" style={{ color: '#059669', fontWeight: 600 }}>
            support@paybacker.co.uk
          </a>
        </div>
      </div>

      <div
        style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr' }}
        className="onboarding-grid"
      >
        {/* Left rail — becomes a compact horizontal step strip at
            ≤480px (see .onboarding-grid media queries in the <style jsx>
            below) so fresh phone signups don't scroll past 300px of
            sidebar before they reach the CTA. */}
        <aside
          className="onboarding-rail"
          style={{
            padding: 32,
            borderRight: '1px solid #E5E7EB',
            background: '#fff',
          }}
        >
          <div
            className="onboarding-rail__header"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: '#059669',
              marginBottom: 10,
            }}
          >
            3 minutes to set up
          </div>
          <h2
            className="onboarding-rail__heading"
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px' }}
          >
            Let&rsquo;s find your first saving
          </h2>
          <div className="onboarding-rail__steps">
            {STEPS.map((s, i) => {
              const done = i < derivedStep;
              const active = i === activeStep;
              return (
                <div
                  key={s}
                  className="onboarding-rail__step"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: done ? '#059669' : active ? '#0B1220' : '#fff',
                      border: done || active ? 'none' : '1px solid #E5E7EB',
                      color: done || active ? '#fff' : '#9CA3AF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        color: active ? '#0B1220' : done ? '#4B5563' : '#9CA3AF',
                      }}
                    >
                      {s}
                    </div>
                    {active && i === 2 && (
                      <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 3 }}>
                        We&rsquo;ll only read payment emails.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="onboarding-rail__reassure"
            style={{
              marginTop: 40,
              padding: 14,
              background: '#F9FAFB',
              borderRadius: 10,
              fontSize: 11.5,
              color: '#9CA3AF',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', marginBottom: 4 }}>
              🔒 Your data is yours
            </div>
            Bank access via <strong style={{ color: '#4B5563' }}>TrueLayer</strong> (FCA-authorised).
            Revoke anytime. We never store your login.
          </div>
        </aside>

        {/* Main content */}
        <main
          style={{
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: 720,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* OAuth error banner — the bank / Gmail / Outlook callbacks
              route back here with ?error=<code> when they fail. Before
              this, the user just saw the same step reload with no
              explanation and quietly bounced off the flow. Now we
              surface a clear recoverable message with a "try again"
              affordance (staying on the same step) so they can retry
              or skip without abandoning onboarding. */}
          {(() => {
            const errorCode = searchParams.get('error');
            if (!errorCode) return null;
            const errorMessages: Record<string, string> = {
              bank_auth_failed:
                'We couldn’t complete the bank connection. No data was shared. You can try again or skip this step.',
              gmail_auth_failed:
                'We couldn’t connect your Gmail inbox. No data was shared. You can try again or skip this step.',
              outlook_auth_failed:
                'We couldn’t connect your Outlook inbox. No data was shared. You can try again or skip this step.',
              access_denied:
                'You cancelled the authorisation. That’s fine — you can try again or skip this step.',
            };
            const message =
              errorMessages[errorCode] ??
              'Something went wrong with the connection. Your data is safe. Try again or skip this step.';
            return (
              <div
                role="alert"
                style={{
                  width: '100%',
                  maxWidth: 560,
                  padding: '14px 16px',
                  marginBottom: 24,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 10,
                  color: '#991B1B',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ display: 'block', marginBottom: 2 }}>Connection didn&rsquo;t complete</strong>
                {message}
              </div>
            );
          })()}

          {activeStep === 0 && (
            <StepWrap
              icon="👋"
              iconGradient="linear-gradient(135deg,#DCFCE7,#BBF7D0)"
              title={`Welcome${state.userEmail ? `, ${state.userEmail.split('@')[0]}` : ''}.`}
              subtitle="Your account is live. Next up: plug in a bank so we can find the money suppliers owe you back."
            >
              <button
                onClick={() => gotoStep(1)}
                className="cta"
                style={{ padding: '12px 18px', fontSize: 14 }}
              >
                Connect my bank <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            </StepWrap>
          )}

          {activeStep === 1 && (
            <StepWrap
              icon="🏦"
              iconGradient="linear-gradient(135deg,#DBEAFE,#BFDBFE)"
              title="Connect a bank"
              subtitle="Read-only access via TrueLayer (FCA-authorised). We spot silent price rises, forgotten subscriptions, and unfair charges in your transaction history."
            >
              <a
                href="/api/auth/truelayer"
                className="cta"
                style={{
                  padding: '14px 18px',
                  fontSize: 14.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CreditCard style={{ width: 16, height: 16 }} /> Connect bank via TrueLayer
              </a>
              <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 10, maxWidth: 440, lineHeight: 1.5 }}>
                You&rsquo;ll be securely redirected to your bank&rsquo;s own login screen via TrueLayer. No password ever touches Paybacker. You&rsquo;ll bounce straight back here when you&rsquo;re done.
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  onClick={() => gotoStep(2)}
                  className="onboarding-skip"
                >
                  Skip for now — I&rsquo;ll do it later
                </button>
              </div>
            </StepWrap>
          )}

          {activeStep === 2 && (
            <StepWrap
              icon="📧"
              iconGradient="linear-gradient(135deg,#FEF3C7,#FDE68A)"
              title="Scan your inbox for subscriptions"
              subtitle="We'll find every receipt, subscription, and free-trial-turned-paid in your email. Takes about 90 seconds."
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  width: '100%',
                  maxWidth: 520,
                  marginBottom: 14,
                }}
                className="onboarding-provider-grid"
              >
                {[
                  { t: 'Gmail', bg: '#EA4335', initial: 'G', href: '/api/auth/google', popular: true },
                  { t: 'Outlook', bg: '#0078D4', initial: 'O', href: '/api/auth/microsoft', popular: true },
                ].map((p) => (
                  <a
                    key={p.t}
                    href={p.href}
                    style={{
                      padding: 14,
                      border: '1px solid #E5E7EB',
                      borderRadius: 11,
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        background: p.bg,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      {p.initial}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>Connect {p.t}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                        OAuth — no password needed
                      </div>
                    </div>
                    {p.popular && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          letterSpacing: '.04em',
                          background: '#DCFCE7',
                          color: '#059669',
                          textTransform: 'uppercase',
                        }}
                      >
                        Popular
                      </span>
                    )}
                  </a>
                ))}
              </div>

              <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4, maxWidth: 440, lineHeight: 1.5, textAlign: 'center' }}>
                You&rsquo;ll authorise read-only inbox access on your provider&rsquo;s own sign-in page. We never see your password and you can revoke access any time.
              </p>

              <button
                onClick={() => gotoStep(3)}
                className="onboarding-skip"
              >
                Skip for now — I&rsquo;ll do it later
              </button>

              <div
                style={{
                  marginTop: 36,
                  width: '100%',
                  maxWidth: 520,
                  padding: 16,
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  fontSize: 12.5,
                  color: '#4B5563',
                  lineHeight: 1.55,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#9CA3AF',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  What we'll read
                </div>
                Only senders matching receipt patterns — <code style={{ background: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>receipt@</code>
                , <code style={{ background: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>no-reply@</code>
                , <code style={{ background: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>billing@</code> — plus 143 known providers. Personal mail is never opened.
              </div>
            </StepWrap>
          )}

          {activeStep === 3 && (
            <StepWrap
              icon="🎉"
              iconGradient="linear-gradient(135deg,#DCFCE7,#86EFAC)"
              title="You're ready to find wins"
              subtitle={
                state.hasBank || state.hasEmail
                  ? 'We\'re scanning your connections in the background. Your dashboard will fill in as results come through — usually within a couple of minutes.'
                  : 'You skipped the connections — you can still use manual subscription tracking and AI letters. Plug in a bank or inbox later from Profile → Connected accounts to unlock the auto-detect features.'
              }
            >
              {/* Example-win preview card — labelled "Example" because
                  per redesign/CONTENT_SOURCES_OF_TRUTH.md we can't
                  fabricate specific savings claims for this user. It
                  exists to convert the abstract promise ("your dashboard
                  will fill in") into a concrete image of what a typical
                  finding actually looks like, which the onboarding audit
                  flagged as missing — users complete step 4 hoping for
                  immediate gratification and bounce when there's just a
                  button. */}
              {(state.hasBank || state.hasEmail) && (
                <div
                  aria-label="Example saving"
                  style={{
                    width: '100%',
                    maxWidth: 440,
                    marginBottom: 18,
                    padding: 18,
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 14,
                    boxShadow: '0 8px 24px -12px rgba(11, 18, 32, 0.12)',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        color: '#059669',
                        background: '#D1FAE5',
                        padding: '3px 8px',
                        borderRadius: 999,
                      }}
                    >
                      Example · what a typical win looks like
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#1DB954',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      S
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0B1220' }}>
                        Spotify Premium &mdash; unused 4 months
                      </div>
                      <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
                        Auto-detected from bank transactions
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', fontFamily: 'JetBrains Mono, monospace' }}>
                        £11.99 / mo
                      </div>
                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 1 }}>
                        £143.88 / yr
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: 10,
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: '#065F46',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ fontWeight: 700 }}>Suggested action:</strong> one-tap cancellation email drafted, quoting CRA 2015 s.49 — you approve and we&rsquo;ll send it.
                  </div>
                </div>
              )}

              <button
                onClick={finish}
                className="cta"
                style={{
                  padding: '14px 22px',
                  fontSize: 14.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Sparkles style={{ width: 16, height: 16 }} /> Open my dashboard
              </button>
            </StepWrap>
          )}
        </main>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '16px 32px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#fff',
        }}
      >
        {activeStep > 0 ? (
          <button
            onClick={() => gotoStep(activeStep - 1)}
            style={{ fontSize: 13, color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            ← Back
          </button>
        ) : (
          <Link
            href="/dashboard"
            style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none', fontWeight: 500 }}
          >
            Skip onboarding
          </Link>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>
          Step {activeStep + 1} of {STEPS.length}
        </div>
        {activeStep < STEPS.length - 1 ? (
          <button onClick={() => gotoStep(activeStep + 1)} className="cta" style={{ padding: '8px 14px', fontSize: 13 }}>
            Continue <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        ) : (
          <button onClick={finish} className="cta" style={{ padding: '8px 14px', fontSize: 13 }}>
            Go to dashboard <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>

      <style jsx>{`
        .cta {
          background: #0B1220;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
        }
        /* Skip button — promoted from a barely-visible grey link to a
           proper outlined button so users who don't want to grant OAuth
           scope can see their out without abandoning the whole flow.
           Same tap-target size as the primary CTA. */
        :global(.onboarding-skip) {
          padding: 12px 16px;
          font-size: 13.5px;
          font-weight: 600;
          color: #334155;
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: background 150ms ease, border-color 150ms ease;
        }
        :global(.onboarding-skip:hover) {
          background: #F8FAFC;
          border-color: #CBD5E1;
        }
        @media (max-width: 820px) {
          :global(.onboarding-grid) { grid-template-columns: 1fr !important; }
          :global(.onboarding-grid aside) { border-right: none !important; border-bottom: 1px solid #E5E7EB; }
          :global(.onboarding-provider-grid) { grid-template-columns: 1fr !important; }
        }
        /* ≤480px: compact rail — hide the marketing headers and the
           privacy reassurance block (both duplicated elsewhere in the
           flow), tighten padding, and lay the step list out
           horizontally so users see the CTA above the fold instead of
           scrolling past 300px of sidebar. */
        @media (max-width: 480px) {
          :global(.onboarding-rail) {
            padding: 16px !important;
          }
          :global(.onboarding-rail__header),
          :global(.onboarding-rail__heading),
          :global(.onboarding-rail__reassure) {
            display: none;
          }
          :global(.onboarding-rail__steps) {
            display: flex;
            justify-content: space-between;
            gap: 4px;
            overflow-x: auto;
          }
          :global(.onboarding-rail__step) {
            flex: 1;
            flex-direction: column !important;
            align-items: center !important;
            padding: 4px 0 !important;
            gap: 4px !important;
            min-width: 0;
          }
          :global(.onboarding-rail__step > div:last-child) {
            padding-top: 0 !important;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}

function StepWrap({
  icon,
  iconGradient,
  title,
  subtitle,
  children,
}: {
  icon: string;
  iconGradient: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: iconGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 34,
          marginBottom: 20,
        }}
      >
        {icon}
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, color: '#4B5563', textAlign: 'center', maxWidth: 480, lineHeight: 1.5, margin: '0 0 28px' }}>
        {subtitle}
      </p>
      {children}
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingInner />
    </Suspense>
  );
}
