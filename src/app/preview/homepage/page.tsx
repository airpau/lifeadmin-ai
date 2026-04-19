'use client';

/**
 * Homepage v2 preview — /preview/homepage
 *
 * This is the staging surface for the homepage redesign series. PR 2
 * ported the Claude Design export, PR 3 added full feature parity
 * (Why We Exist, Pocket Agent Showcase, AI Assistant, Subs Tracking,
 * FAQ). PR 4 (this change) wires the hero ticker and stats cards to
 * live Supabase data via /api/preview/homepage-stats and connects the
 * mini letter form to the real /api/complaints/preview endpoint.
 *
 * Everything lives under `.m-v2-root` so styles can't leak onto the
 * live homepage or the authenticated dashboard.
 *
 * Remaining:
 *   PR 5 — cut the v2 page over to `/` once Paul signs off.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import './styles.css';

// React.CSSProperties doesn't know about CSS custom properties; a small
// helper cast keeps the inline-style literals readable and type-safe.
type CSSVarProperties = CSSProperties & Record<`--${string}`, string | number>;

type Testimonial = {
  name: string;
  meta: string;
  quote: string;
  saved: string;
  color: string;
};

// Live stats returned by /api/preview/homepage-stats.
// `source === 'seed'` means every figure is zero (no real users yet) —
// we keep the "Preview data" badge visible in that case.
type HomepageStats = {
  savedThisMonth: number;
  avgSavingsPerUser: number;
  subscriptionsTracked: number;
  foundingMembers: number;
  asOf: string;
  source: 'live' | 'seed' | 'fallback';
};

// Maps the mini letter form's dropdown labels → category strings the
// /api/complaints/preview endpoint expects.
const LETTER_CATEGORY_MAP: Record<string, string> = {
  'Mid-contract price rise': 'broadband',
  'Delayed or cancelled flight (UK261)': 'flight_delay',
  'Faulty goods (CRA 2015)': 'refund',
  'Energy billing error (Ofgem)': 'energy',
};

// Formats a £ amount with UK locale. Falls back to en-GB commas for
// integer values — matches the existing export's visual style.
const formatGBP = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
    ...opts,
  }).format(n);

const formatCount = (n: number) => new Intl.NumberFormat('en-GB').format(n);

// Initial-only names — final quotes pending founding-member permissions (PR 3).
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'P. R.',
    meta: 'Homeowner · Bristol · Oct 2025',
    quote:
      '"Found £847 in forgotten subs in five minutes. The Virgin dispute letter got my bill cut back to the original contract rate — first time."',
    saved: 'Saved £1,240 this year',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'A. K.',
    meta: 'Freelancer · Manchester · Oct 2025',
    quote:
      '"I thought I was on top of my subs. Paybacker found six I\'d completely forgotten about, including two gyms."',
    saved: 'Saved £392',
    color: 'var(--accent-orange-deep)',
  },
  {
    name: 'D. M.',
    meta: 'Commuter · London · Sep 2025',
    quote:
      '"The Ofcom letter took 30 seconds. EE cancelled the mid-contract rise without a phone call. Still can\'t quite believe it."',
    saved: 'Saved £168',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'S. J.',
    meta: 'Student · Edinburgh · Sep 2025',
    quote:
      '"Pocket Agent in Telegram is the bit I didn\'t expect to love. I just ask it if things are fair and it tells me."',
    saved: 'Saved £284',
    color: 'var(--accent-orange-deep)',
  },
  {
    name: 'R. N.',
    meta: 'Teacher · Leeds · Oct 2025',
    quote:
      '"Paybacker caught a £41/month energy hike British Gas quietly slipped in. The dispute paid for a year of Pro in one letter."',
    saved: 'Saved £492',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'T. B.',
    meta: 'New parent · Cardiff · Aug 2025',
    quote:
      '"Tiny baby, no time to read bills. This does it for us. The broadband switch alone saved us £400 a year."',
    saved: 'Saved £638',
    color: 'var(--accent-orange-deep)',
  },
];

export default function HomepageV2Preview() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [chatShown, setChatShown] = useState(false);
  const [letterBusy, setLetterBusy] = useState(false);
  const [letterLabel, setLetterLabel] = useState('Generate letter →');
  const [letterPreview, setLetterPreview] = useState<string | null>(null);
  const [stats, setStats] = useState<HomepageStats | null>(null);
  const revealContainerRef = useRef<HTMLDivElement | null>(null);

  // Nav shrinks slightly once scrolled > 20px.
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Capture & persist referral code from URL — preserves the attribution
  // behaviour the old homepage had. Signup flow reads pb_ref from
  // localStorage and credits the referrer if the user converts.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) window.localStorage.setItem('pb_ref', ref);
    } catch {
      // ignore — localStorage unavailable in some privacy modes
    }
  }, []);

  // Reveal-on-scroll for .reveal elements inside the page (not globally).
  useEffect(() => {
    const container = revealContainerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            window.setTimeout(() => entry.target.classList.add('in'), i * 60);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    container.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Chat widget appears after 2s — matches the export's behaviour.
  useEffect(() => {
    const t = window.setTimeout(() => setChatShown(true), 2000);
    return () => window.clearTimeout(t);
  }, []);

  // Fetch live stats from /api/preview/homepage-stats on mount.
  // Endpoint has 5-min ISR cache so this is cheap for anonymous traffic.
  // If it fails we keep the hardcoded preview figures rendered.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/preview/homepage-stats', { signal: ac.signal });
        if (!res.ok) return;
        const json: HomepageStats = await res.json();
        setStats(json);
      } catch {
        // swallow — placeholder values already on screen
      }
    })();
    return () => ac.abort();
  }, []);

  // Mini letter form → /api/complaints/preview (public, IP rate-limited 3/hr).
  // Returns a sample paragraph or full AI-drafted letter (30s timeout server-side).
  // We show the response inline under the form so the demo never leaves the page.
  const onDemoGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (letterBusy) return;
    const data = new FormData(e.currentTarget);
    const label = String(data.get('issueType') ?? 'Mid-contract price rise');
    const description = String(data.get('description') ?? '').trim();
    const category = LETTER_CATEGORY_MAP[label] ?? 'broadband';

    setLetterBusy(true);
    setLetterLabel('Drafting…');
    setLetterPreview(null);

    try {
      const res = await fetch('/api/complaints/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLetterLabel(
          res.status === 429 ? 'Too many — try again soon' : 'Something went wrong',
        );
        setLetterPreview(
          err?.error ??
            'We couldn\u2019t draft that one right now — please try again in a minute.',
        );
        window.setTimeout(() => setLetterLabel('Generate letter →'), 2400);
        return;
      }
      const json: { preview?: string; generated?: boolean } = await res.json();
      setLetterPreview(json.preview ?? 'No preview returned.');
      setLetterLabel(json.generated ? '✓ Letter drafted' : '✓ Sample ready');
      window.setTimeout(() => setLetterLabel('Generate another →'), 2400);
    } catch {
      setLetterLabel('Offline — try again');
      window.setTimeout(() => setLetterLabel('Generate letter →'), 2400);
    } finally {
      setLetterBusy(false);
    }
  };

  const doubledTestimonials = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <div className="m-v2-root" ref={revealContainerRef}>

      {/* Floating pill nav ------------------------------------------ */}
      <div className={`nav-shell${navScrolled ? ' scrolled' : ''}`} id="navShell">
        <nav className="nav-pill" aria-label="Primary">
          <a className="nav-logo" href="/">
            <span className="pay">Pay</span>
            <span className="backer">backer</span>
          </a>
          <div className="nav-links">
            <a href="/about">About</a>
            <a href="#pricing">Pricing</a>
            <a href="#deals">Deals</a>
            <a href="/blog">Blog</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-cta-row">
            <a className="nav-signin" href="/auth/login">
              Sign in
            </a>
            <a className="nav-start" href="/auth/signup">
              Start Free
            </a>
          </div>
        </nav>
      </div>

      {/* Hero ------------------------------------------------------- */}
      <section
        className="hero glow-wrap section-light"
        style={{ '--glow-opacity': 0.22 } as CSSVarProperties}
      >
        <div className="trust-bar">
          ICO registered <span className="dot">·</span>
          FCA-authorised via Yapily <span className="dot">·</span>
          GDPR compliant <span className="dot">·</span>
          UK company · Paybacker LTD
        </div>
        <div className="wrap">
          <div className="hero-grid">
            <div className="hero-copy reveal">
              <span className="eyebrow">Free 14-day Pro trial. No card required.</span>
              <h1>
                <span className="l1">Find Hidden Overcharges.</span>
                <span className="l2">Fight Unfair Bills.</span>
                <span className="l3">Get Your Money Back.</span>
              </h1>
              <p className="hero-sub">
                Paybacker scans your bank and email to spot overcharges, forgotten subscriptions,
                and unfair bills — then writes professional complaint letters citing UK law in 30
                seconds.
              </p>
              <div className="hero-cta-row">
                <a className="btn btn-mint" href="/auth/signup">
                  Start free 14-day Pro trial →
                </a>
                <a className="btn btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
              <div className="hero-ticker">
                <span className="pulse" />
                {stats && stats.source !== 'fallback' && stats.savedThisMonth > 0 ? (
                  <span>
                    <strong>{formatGBP(stats.savedThisMonth)}</strong>
                    {' saved for our members this month'}
                  </span>
                ) : (
                  <span>Saved for our members this month — live counter coming soon</span>
                )}
              </div>
            </div>
            <div className="hero-visual reveal" aria-hidden="true">
              <div className="mini-card float" style={{ animationDelay: '-2s' }}>
                <div className="label">Potential savings</div>
                <div className="big">£1,240</div>
                <div className="desc">found this quarter</div>
                <div className="mini-bar">
                  <div className="bar">
                    <span className="n">Virgin Media</span>
                    <span className="v">+£12/mo</span>
                  </div>
                  <div className="bar">
                    <span className="n">Octopus Energy</span>
                    <span className="v">+£28/mo</span>
                  </div>
                  <div className="bar">
                    <span className="n">Audible</span>
                    <span className="v">+£7.99/mo</span>
                  </div>
                  <div className="bar">
                    <span className="n">British Gas</span>
                    <span className="v">+£41/mo</span>
                  </div>
                </div>
              </div>

              <div className="dash-card float">
                <div className="dash-header">
                  <div className="title">Money Hub — October</div>
                  <div>●●●</div>
                </div>
                <div className="dash-body">
                  <div>
                    <div className="label">Net this month</div>
                    <div className="big-num">
                      £2,847.
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.6em' }}>12</span>
                    </div>
                    <div className="delta">↗ £312 vs. September</div>
                  </div>
                  <div className="donut-row">
                    <div className="donut">
                      <div className="donut-center">
                        <span>Tracked</span>
                        <strong>£4,892</strong>
                      </div>
                    </div>
                    <div className="donut-legend">
                      <div className="row">
                        <span>
                          <span className="swatch" style={{ background: 'var(--accent-mint)' }} />
                          <span className="name">Essentials</span>
                        </span>
                        <span className="amt">£1,859</span>
                      </div>
                      <div className="row">
                        <span>
                          <span
                            className="swatch"
                            style={{ background: 'var(--accent-orange)' }}
                          />
                          <span className="name">Subscriptions</span>
                        </span>
                        <span className="amt">£1,174</span>
                      </div>
                      <div className="row">
                        <span>
                          <span className="swatch" style={{ background: '#60A5FA' }} />
                          <span className="name">Transport</span>
                        </span>
                        <span className="amt">£782</span>
                      </div>
                      <div className="row">
                        <span>
                          <span className="swatch" style={{ background: '#A78BFA' }} />
                          <span className="name">Dining</span>
                        </span>
                        <span className="amt">£588</span>
                      </div>
                      <div className="row">
                        <span>
                          <span className="swatch" style={{ background: '#E5E7EB' }} />
                          <span className="name">Other</span>
                        </span>
                        <span className="amt">£489</span>
                      </div>
                    </div>
                  </div>
                  <div className="sub-list">
                    <div className="row">
                      <span className="name">
                        Netflix Premium<span className="tag">Unused</span>
                      </span>
                      <span className="amt">£17.99</span>
                    </div>
                    <div className="row">
                      <span className="name">
                        Virgin Media<span className="tag">Hike</span>
                      </span>
                      <span className="amt">£49.00</span>
                    </div>
                    <div className="row">
                      <span className="name">
                        Gym membership<span className="tag">Inactive</span>
                      </span>
                      <span className="amt">£34.99</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="agent-bubble float" style={{ animationDelay: '-3s' }}>
                <div className="who">
                  <span className="dot-mint" /> Pocket Agent · Telegram
                </div>
                <div className="msg">
                  {'Your Virgin Media bill is up '}
                  <strong>£12</strong>
                  {' this month. Want me to draft a dispute citing Ofcom\u2019s mid-contract price rise rules?'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why We Exist (light narrative) — brought across from v1 ---- */}
      <section className="why-we-exist section-light" id="why">
        <div className="wrap">
          <div className="why-grid">
            <div className="why-copy reveal">
              <span className="eyebrow">Why we exist</span>
              <h2>
                The average UK household is
                <br />
                overcharged <span className="accent">£1,000+</span> a year.
              </h2>
              <p className="lead">
                Broadband price hikes. Energy tariffs that quietly roll over. Gym memberships you
                forgot about. Flight compensation you never claimed. Insurance renewals that drift
                up every year.
              </p>
              <p>
                Paybacker exists because the admin of fighting this — reading the email, finding
                the policy, writing the letter — is designed to be too painful for any normal
                person to keep up with. So we built an AI team that does it for you.
              </p>
              <p className="closing">
                Point it at your bank and your inbox. Get your money back.
              </p>
            </div>
            <div className="why-stats reveal">
              <div className="why-stat">
                <div className="n">£82.6bn</div>
                <div className="l">
                  lost to overcharges across UK households every year (Citizens Advice, 2024).
                </div>
              </div>
              <div className="why-stat">
                <div className="n">68%</div>
                <div className="l">
                  of UK adults have at least one subscription they&rsquo;ve forgotten about.
                </div>
              </div>
              <div className="why-stat">
                <div className="n">£520</div>
                <div className="l">
                  maximum compensation under UK261 for a single delayed or cancelled flight — most
                  never claim it.
                </div>
              </div>
              <div className="why-stat">
                <div className="n">30 sec</div>
                <div className="l">
                  to draft a formal dispute citing the exact UK law — with Paybacker.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip ------------------------------------------------ */}
      <section className="trust-strip section-light">
        <div className="wrap">
          <div className="trust-row">
            <div className="trust-item">
              <div className="ring">ICO</div>Registered data controller
            </div>
            <div className="trust-item">
              <div className="ring">FCA</div>Open Banking via Yapily
            </div>
            <div className="trust-item">
              <div className="ring">GDPR</div>UK data residency
            </div>
            <div className="trust-item">
              <div className="ring">£</div>Stripe secured payments
            </div>
            <div className="trust-item">
              {/*
                Paybacker LTD's real Companies House number goes in before
                cut-over (PR 5). The export shipped a placeholder.
              */}
              <div className="ring">UK</div>Paybacker LTD
            </div>
          </div>
        </div>
      </section>

      {/* Stats (mint wash) ----------------------------------------- */}
      <section className="stats-section section-mint">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Real numbers · Real users</span>
            <h2>
              Real pounds recovered
              <br />
              for real UK households.
            </h2>
            <p>
              No gamified streaks. No vague &ldquo;up to&rdquo; claims. Aggregated live from the
              last 90 days of verified savings, subscriptions tracked, and active founding
              members.
            </p>
            {/*
              The seed/fallback badge stays visible until /api/preview/homepage-stats
              returns non-zero figures. Once live data lands it quietly vanishes — no
              refresh required.
            */}
            {/*
              The badge shows whenever any individual figure is still the
              hardcoded export seed (source !== 'live', OR any specific
              number is zero and we're falling back). That way we never
              show a misleading headline number without an honest label.
            */}
            {(() => {
              if (!stats) {
                return (
                  <p className="placeholder-note" aria-live="polite">
                    Preview data — aggregates load from Supabase in a second.
                  </p>
                );
              }
              const anyFallback =
                stats.source !== 'live' ||
                stats.avgSavingsPerUser === 0 ||
                stats.subscriptionsTracked === 0 ||
                stats.foundingMembers === 0;
              if (!anyFallback) return null;
              return (
                <p className="placeholder-note" aria-live="polite">
                  Some figures still seeded — real aggregates fill in as verified_savings
                  rows land.
                </p>
              );
            })()}
          </div>
          <div className="stats-grid">
            <div className="stat-card reveal">
              <div className="label">Average potential savings</div>
              <div className="num">
                {stats && stats.avgSavingsPerUser > 0
                  ? formatGBP(stats.avgSavingsPerUser)
                  : '£8,029'}
                <span className="unit">/yr</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                Most came from forgotten subscriptions and quiet price hikes we flagged
                automatically — the kind nobody reads the email for.
              </div>
            </div>
            <div className="stat-card reveal">
              <div className="label">Subscriptions tracked</div>
              <div className="num">
                {stats && stats.subscriptionsTracked > 0
                  ? formatCount(stats.subscriptionsTracked)
                  : '149'}
              </div>
              <div className="underline" />
              <div className="blurb">
                Across connected accounts. The median user has 11 they&rsquo;d forgotten about. The
                worst had 34 — including three streaming services with the same logo.
              </div>
            </div>
            <div className="stat-card reveal">
              <div className="label">Founding members</div>
              <div className="num">
                {stats && stats.foundingMembers > 0 ? formatCount(stats.foundingMembers) : '45'}
              </div>
              <div className="underline" />
              <div className="blurb">
                British households using the Pro tier right now. Tight invite-only group while we
                scale the AI Disputes engine. Locked-in founder pricing, forever.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars --------------------------------------------------- */}
      <section className="pillars-section section-light">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">What&rsquo;s in the box</span>
            <h2>
              Three products. One subscription.
              <br />
              All of your money, watched.
            </h2>
            <p>
              Most UK households are overcharged by £1,000+ a year. Paybacker finds it, disputes
              it, and cancels it — in minutes, not hours on hold.
            </p>
          </div>
          <div className="pillar-grid">
            <div className="pillar-card reveal">
              <div className="pillar-icon orange" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M4 7l8-4 8 4" />
                  <path d="M4 7l3 7a3 3 0 006 0z" />
                  <path d="M20 7l-3 7a3 3 0 006 0z" />
                </svg>
              </div>
              <h3>AI Disputes Centre</h3>
              <p className="copy">
                Complaint letters citing exact UK consumer law in 30 seconds. Consumer Rights Act
                2015, UK261, Ofgem, Ofcom.
              </p>
              <div className="pillar-preview">
                <div className="head">AI draft · Ofcom — mid-contract price rise</div>
                <p className="letter-para">
                  … I am writing to formally dispute the{' '}
                  <span className="hl">£12 CPI+3.9% increase</span> applied to my Virgin Media
                  broadband contract on 1 October. Under{' '}
                  <span className="hl">Ofcom&rsquo;s Fairness Framework</span> and the{' '}
                  <span className="hl">Consumer Rights Act 2015 s.49</span>, you must provide
                  reasonable notice and a right to exit without penalty…
                </p>
              </div>
            </div>

            {/* Pocket Agent moved up to position 2 per Paul's feedback
                (Apr 2026 review): focus order is Disputes → Pocket Agent → Money Hub. */}
            <div className="pillar-card reveal">
              <div className="pillar-icon gradient" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                </svg>
              </div>
              <h3>Pocket Agent</h3>
              <p className="copy">
                Your AI financial agent, always in your pocket. Telegram, WhatsApp, SMS and email —
                answers, drafts, cancels, and switches in plain English.
              </p>
              <div className="pillar-preview">
                <div className="head">Today · Telegram</div>
                <div className="chat-preview">
                  <div className="chat-bubble user">Is £68/mo fair for 100Mb broadband?</div>
                  <div className="chat-bubble agent">
                    Above UK median of £32. Two cheaper options on your postcode. Draft switch?
                  </div>
                  <div className="chat-bubble user">Yes please</div>
                  <div className="chat-bubble agent">
                    {'On it — you\u2019ll save '}
                    <strong>£432/yr</strong>.
                  </div>
                </div>
              </div>
            </div>

            <div className="pillar-card reveal">
              <div className="pillar-icon mint" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <path d="M3 10h18" />
                  <circle cx="17" cy="15" r="1.5" />
                </svg>
              </div>
              <h3>Money Hub</h3>
              <p className="copy">
                Connect your bank via Open Banking (Yapily). Every subscription, direct debit, and
                contract in one place. Daily sync.
              </p>
              <div className="pillar-preview">
                <div className="head">Your October breakdown</div>
                <div className="donut-mini">
                  <div className="d" />
                  <div className="nums">
                    <div className="row">
                      <span className="sw" style={{ background: 'var(--accent-mint)' }} />
                      Essentials · £1,859
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: 'var(--accent-orange)' }} />
                      Subs · £1,174
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: '#93C5FD' }} />
                      Transport · £782
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: '#E5E7EB' }} />
                      Other · £489
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px dashed var(--divider)',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  3 hikes flagged · 2 duplicates found
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pocket Agent showcase (dark) — new in PR 3 ---------------- */}
      <section className="agent-showcase section-ink" id="pocket-agent">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow on-ink">Meet your Pocket Agent</span>
            <h2>
              An AI that actually
              <br />
              <span className="mint">does</span> the admin for you.
            </h2>
            <p className="sub">
              Your Pocket Agent lives in Telegram, WhatsApp, SMS, and email — watching for
              overcharges, drafting letters, and cancelling the stuff you never use. Reply in a
              sentence. It handles the rest.
            </p>
          </div>

          <div className="agent-showcase-grid">
            <div className="agent-phone reveal" aria-hidden="true">
              <div className="agent-phone-header">
                <span className="dot-mint" />
                <span>Pocket Agent · Telegram</span>
                <span className="agent-phone-time">Today · 10:47</span>
              </div>
              <div className="agent-phone-body">
                <div className="ap-bubble agent">
                  {'Morning Paul \u2014 your British Gas bill just landed. It\u2019s up '}
                  <strong>£41</strong>
                  {' versus last month. Want me to check if that\u2019s fair?'}
                </div>
                <div className="ap-bubble user">Yes please, quickly.</div>
                <div className="ap-bubble agent">
                  {'Your unit rate jumped from 24.5p to 30.2p/kWh. That\u2019s above the current UK price cap for your tariff. Want me to draft an Ofgem dispute?'}
                </div>
                <div className="ap-bubble user">Yeah, go on.</div>
                <div className="ap-bubble agent">
                  {'Done \u2014 letter cites Ofgem\u2019s Standards of Conduct and the price cap rules. Sent to your inbox to sign.'}
                  <span className="ap-link">Preview letter →</span>
                </div>
                <div className="ap-bubble user">Can you also cancel my Audible?</div>
                <div className="ap-bubble agent">
                  {'On it. Drafted a cancellation citing your 14-day cooling-off right under the Consumer Contracts Regulations. Confirm?'}
                  <div className="ap-chips">
                    <span className="ap-chip ap-chip-mint">✓ Confirm</span>
                    <span className="ap-chip">Change wording</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="agent-features reveal">
              <div className="agent-feature">
                <div className="af-icon">⚡</div>
                <div>
                  <h4>Instant answers</h4>
                  <p>
                    &ldquo;Is £68 fair for broadband?&rdquo; &ldquo;Can I claim for this flight
                    delay?&rdquo; Ask in plain English — get a straight answer with the UK law
                    cited.
                  </p>
                </div>
              </div>
              <div className="agent-feature">
                <div className="af-icon">✍️</div>
                <div>
                  <h4>One-tap dispute letters</h4>
                  <p>
                    Drafts formal complaints, cancellations, or refund requests in 30 seconds —
                    citing Consumer Rights Act 2015, UK261, Ofgem, Ofcom or the relevant rule.
                  </p>
                </div>
              </div>
              <div className="agent-feature">
                <div className="af-icon">🔔</div>
                <div>
                  <h4>Proactive alerts</h4>
                  <p>
                    Pings you when a bill jumps, a free trial is about to convert, a contract is
                    ending, or a flight delay qualifies for compensation. No more missed deadlines.
                  </p>
                </div>
              </div>
              <div className="agent-feature">
                <div className="af-icon">💷</div>
                <div>
                  <h4>Verified switches</h4>
                  <p>
                    Compares your current bill against 53+ UK partners. Only suggests a switch if
                    it genuinely beats what you&rsquo;re on — in pounds and pence.
                  </p>
                </div>
              </div>
              <div className="agent-feature">
                <div className="af-icon">🔒</div>
                <div>
                  <h4>Bank-grade security</h4>
                  <p>
                    Read-only Open Banking via Yapily (FCA-authorised). Never stores passwords.
                    Encrypted end-to-end. UK data residency only.
                  </p>
                </div>
              </div>
              <div className="agent-feature">
                <div className="af-icon">🧠</div>
                <div>
                  <h4>Remembers context</h4>
                  <p>
                    Knows your postcode, your contracts, your renewal dates, and your loyalty
                    preferences. Doesn&rsquo;t re-ask the same question twice.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Financial Assistant (light) — recategorisation convo --- */}
      <section className="assistant-section section-light" id="assistant">
        <div className="wrap">
          <div className="assistant-grid">
            <div className="assistant-copy reveal">
              <span className="eyebrow">AI Financial Assistant</span>
              <h2>
                Ask your money anything.
                <br />
                It actually answers.
              </h2>
              <p>
                Every transaction, subscription, contract, and bill — categorised in real time.
                When it gets something wrong, just tell it. The assistant learns how
                <em> your </em>
                spending works, not the average household&rsquo;s.
              </p>
              <ul className="assistant-bullets">
                <li>
                  <strong>Instant recategorisation.</strong> One sentence fixes every past and
                  future match.
                </li>
                <li>
                  <strong>Category drill-down.</strong> &ldquo;What did I spend on takeaways in
                  March?&rdquo; — see the list in seconds.
                </li>
                <li>
                  <strong>Dynamic charts.</strong> Ask for a pie chart of utilities or a 6-month
                  bar for dining — rendered in the chat.
                </li>
                <li>
                  <strong>Budget links.</strong> Every category connects to a budget limit and
                  renewal alerts.
                </li>
              </ul>
            </div>

            <div className="assistant-chat reveal">
              <div className="ac-header">Money Hub · AI Assistant</div>
              <div className="ac-body">
                <div className="ac-bubble user">
                  My OneStream direct debit keeps appearing as Bills &amp; Utilities, but it&rsquo;s
                  broadband. Can you fix it?
                </div>
                <div className="ac-bubble assistant">
                  {'Done. I\u2019ve moved all 14 OneStream transactions (Jan \u2013 Oct) into '}
                  <strong>Broadband</strong>
                  {'. Any future OneStream payments will land there automatically. Your monthly Broadband total is now '}
                  <strong>£38.50</strong>
                  {'.'}
                </div>
                <div className="ac-bubble user">Show me a pie chart of my subscription spend last month.</div>
                <div className="ac-bubble assistant">
                  <div className="ac-chart" aria-hidden="true">
                    <div className="ac-pie">
                      <div className="ac-slice ac-slice-1" />
                      <div className="ac-slice ac-slice-2" />
                      <div className="ac-slice ac-slice-3" />
                      <div className="ac-slice ac-slice-4" />
                    </div>
                    <div className="ac-legend">
                      <span>
                        <i style={{ background: 'var(--accent-mint)' }} /> Broadband · £38.50
                      </span>
                      <span>
                        <i style={{ background: 'var(--accent-orange)' }} /> Streaming · £27.97
                      </span>
                      <span>
                        <i style={{ background: '#60A5FA' }} /> Gym · £34.99
                      </span>
                      <span>
                        <i style={{ background: '#A78BFA' }} /> Software · £12.99
                      </span>
                    </div>
                  </div>
                  {'Total subscription spend in September was '}
                  <strong>£114.45</strong>
                  {'. Want me to flag Netflix Premium (unused for 47 days) for cancellation?'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Smart Subscription Tracking (mint wash) ------------------- */}
      <section className="subs-section section-mint" id="subscriptions">
        <div className="wrap">
          <div className="subs-grid">
            <div className="subs-list reveal" aria-hidden="true">
              <div className="subs-list-head">
                <span>October · 11 active subscriptions</span>
                <span className="subs-total">£143.92/mo</span>
              </div>
              <div className="subs-row">
                <div className="subs-logo mint">N</div>
                <div className="subs-meta">
                  <div className="subs-name">Netflix Premium</div>
                  <div className="subs-tags">
                    <span className="subs-tag tag-orange">Unused 47 days</span>
                    <span className="subs-tag">Renews in 14 days</span>
                  </div>
                </div>
                <div className="subs-amt">£17.99</div>
              </div>
              <div className="subs-row">
                <div className="subs-logo orange">V</div>
                <div className="subs-meta">
                  <div className="subs-name">Virgin Media Broadband</div>
                  <div className="subs-tags">
                    <span className="subs-tag tag-red">Price hike · +£12</span>
                    <span className="subs-tag">Dispute drafted</span>
                  </div>
                </div>
                <div className="subs-amt">£49.00</div>
              </div>
              <div className="subs-row">
                <div className="subs-logo mint">S</div>
                <div className="subs-meta">
                  <div className="subs-name">Spotify Family</div>
                  <div className="subs-tags">
                    <span className="subs-tag">Active · 4 profiles</span>
                  </div>
                </div>
                <div className="subs-amt">£19.99</div>
              </div>
              <div className="subs-row">
                <div className="subs-logo orange">G</div>
                <div className="subs-meta">
                  <div className="subs-name">PureGym Plus</div>
                  <div className="subs-tags">
                    <span className="subs-tag tag-orange">Inactive 86 days</span>
                    <span className="subs-tag">Cancel draft ready</span>
                  </div>
                </div>
                <div className="subs-amt">£34.99</div>
              </div>
              <div className="subs-row">
                <div className="subs-logo mint">A</div>
                <div className="subs-meta">
                  <div className="subs-name">Audible UK</div>
                  <div className="subs-tags">
                    <span className="subs-tag">Active · 3 credits unused</span>
                  </div>
                </div>
                <div className="subs-amt">£7.99</div>
              </div>
              <div className="subs-row">
                <div className="subs-logo orange">S</div>
                <div className="subs-meta">
                  <div className="subs-name">Sky Mobile</div>
                  <div className="subs-tags">
                    <span className="subs-tag">Contract ends 12 Dec</span>
                    <span className="subs-tag tag-mint">Switch offer · save £168</span>
                  </div>
                </div>
                <div className="subs-amt">£28.00</div>
              </div>
            </div>

            <div className="subs-copy reveal">
              <span className="eyebrow">Smart subscription tracking</span>
              <h2>
                Every sub. Every contract.
                <br />
                Every renewal.
              </h2>
              <p>
                Paybacker spots every recurring payment the moment it hits your bank — then flags
                the ones that are quietly costing you money.
              </p>
              <ul className="subs-features">
                <li>
                  <strong>Renewal alerts.</strong> 30, 14 and 7 days before any contract renews.
                </li>
                <li>
                  <strong>Price-rise detection.</strong> We compare every bill against the last one
                  and flag anything above inflation.
                </li>
                <li>
                  <strong>Inactive-use detection.</strong> Gym not opened in 86 days? Streaming
                  service not played in 47? We tell you.
                </li>
                <li>
                  <strong>Contract end-dates tracked.</strong> No more rolling onto the
                  &ldquo;loyalty tax&rdquo; after your intro rate expires.
                </li>
                <li>
                  <strong>One-tap cancellation letters.</strong> Drafted with your rights under UK
                  consumer law — you just hit send.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works (dark) --------------------------------------- */}
      <section className="how-section section-ink" id="how">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow on-ink">How it works</span>
            <h2>
              Three steps. Ten minutes.
              <br />
              Usually four-figure savings.
            </h2>
            <p className="sub">
              You don&rsquo;t have to connect anything to see it work. Try the Disputes Centre for
              free — no account needed.
            </p>
          </div>

          <div className="how-steps">
            <div className="how-step reveal">
              <div className="num">01</div>
              <h3>Describe your dispute, get a formal letter in 30 seconds.</h3>
              <p>Pick the category, type a sentence. We cite the law, you send the letter.</p>
              <form id="try-letter" className="mini-form" onSubmit={onDemoGenerate}>
                <label htmlFor="mini-issue">What&rsquo;s the issue?</label>
                <select
                  id="mini-issue"
                  name="issueType"
                  defaultValue="Mid-contract price rise"
                >
                  <option>Mid-contract price rise</option>
                  <option>Delayed or cancelled flight (UK261)</option>
                  <option>Faulty goods (CRA 2015)</option>
                  <option>Energy billing error (Ofgem)</option>
                </select>
                <label htmlFor="mini-desc">Brief description</label>
                <input
                  id="mini-desc"
                  name="description"
                  type="text"
                  placeholder="My Virgin bill jumped £12 without warning…"
                  minLength={0}
                  maxLength={280}
                />
                <button type="submit" disabled={letterBusy}>
                  {letterLabel}
                </button>
                {letterPreview && (
                  <div className="mini-letter-out" aria-live="polite">
                    <div className="mini-letter-head">AI draft · preview</div>
                    <p>{letterPreview}</p>
                    <a
                      className="mini-letter-cta"
                      href="/auth/login"
                      rel="noopener"
                    >
                      Sign up free to save &amp; send this letter →
                    </a>
                  </div>
                )}
              </form>
            </div>

            <div className="how-step reveal">
              <div className="num">02</div>
              <h3>Connect your bank and email to find hidden costs.</h3>
              <p>Open Banking via Yapily. Read-only. Never stored longer than needed.</p>
              <div className="bank-list">
                <div className="bank-row">
                  <span className="n">Monzo · main</span>
                  <span className="v">Connected</span>
                </div>
                <div className="bank-row">
                  <span className="n">Barclays · joint</span>
                  <span className="v">Connected</span>
                </div>
                <div className="bank-row">
                  <span className="n">Chase · savings</span>
                  <span className="v">Connected</span>
                </div>
                <div className="bank-row">
                  <span className="n">Gmail · inbox scan</span>
                  <span className="v orange">3 hikes</span>
                </div>
                <div className="bank-row">
                  <span className="n">Outlook · work</span>
                  <span className="v orange">1 duplicate</span>
                </div>
              </div>
            </div>

            <div className="how-step reveal">
              <div className="num">03</div>
              <h3>Get personalised recommendations from 53+ verified UK partners.</h3>
              <p>We only show deals that beat your current bill. No sponsored nonsense.</p>
              <div style={{ marginTop: 'auto' }}>
                <div className="deal-row">
                  <div>
                    <div className="cat">Broadband</div>
                    <div className="name">Fibre 150 · 24mo</div>
                  </div>
                  <div className="save">Save £432</div>
                </div>
                <div className="deal-row">
                  <div>
                    <div className="cat">Energy</div>
                    <div className="name">Octopus Tracker</div>
                  </div>
                  <div className="save">Save £287</div>
                </div>
                <div className="deal-row">
                  <div>
                    <div className="cat">Mobile</div>
                    <div className="name">20GB 5G · SIM only</div>
                  </div>
                  <div className="save">Save £156</div>
                </div>
              </div>
            </div>
          </div>

          <div className="how-cta-row">
            <a className="btn btn-mint" href="#try-letter">
              Try it free — no account needed
            </a>
          </div>
        </div>
      </section>

      {/* Deals (mint wash) ----------------------------------------- */}
      <section className="deals-section section-mint" id="deals">
        <div className="wrap">
          <div
            className="section-head reveal"
            style={{ textAlign: 'center', margin: '0 auto 24px' }}
          >
            <span className="eyebrow">53+ verified UK partners</span>
            <h2 style={{ margin: '12px 0' }}>
              Real prices. Real savings.
              <br />
              Better deals in every category.
            </h2>
          </div>

          <div className="logo-cloud">
            {[
              'BT',
              'Sky',
              'Virgin',
              'EE',
              'E.ON',
              'EDF',
              'OVO',
              'Vodafone',
              'Three',
              'O2',
              'giffgaff',
              'Plusnet',
              'RAC',
              'Habito',
              '+40 more',
            ].map((name) => (
              <span className="logo-chip" key={name}>
                {name}
              </span>
            ))}
          </div>

          <div className="category-grid">
            {[
              { name: 'Broadband', partners: '12 partners', save: 'Save £240/yr' },
              { name: 'Mobile', partners: '9 partners', save: 'Save £180/yr' },
              { name: 'Energy', partners: '14 partners', save: 'Save £450/yr' },
              { name: 'Insurance', partners: '11 partners', save: 'Save £320/yr' },
              { name: 'Mortgages', partners: '4 partners', save: 'Save £1,200/yr' },
              { name: 'Travel', partners: '3 partners', save: 'Save £95/trip' },
            ].map((c) => (
              <div className="cat-tile reveal" key={c.name}>
                <div className="cat-name">{c.name}</div>
                <div className="cat-count">{c.partners}</div>
                <div className="save-badge">{c.save}</div>
              </div>
            ))}
          </div>

          <p className="commission-note">
            We earn a commission if you switch — you pay nothing extra, and we stay free to use.
          </p>
        </div>
      </section>

      {/* Pricing --------------------------------------------------- */}
      <section className="pricing-section section-light" id="pricing">
        <div className="wrap">
          <div
            className="section-head reveal"
            style={{ textAlign: 'center', margin: '0 auto 56px' }}
          >
            <span className="eyebrow">Founding member pricing</span>
            <h2 style={{ margin: '12px 0' }}>
              Start free. Upgrade only when we&rsquo;ve
              <br />
              found you money.
            </h2>
          </div>
          <div className="pricing-grid">
            <div className="price-card reveal">
              <div className="tier">Free</div>
              <div className="price">
                £0<span className="per">/forever</span>
              </div>
              <div className="founding hidden">—</div>
              <ul>
                <li>3 AI dispute letters / month</li>
                <li>Manual subscription tracker</li>
                <li>Public deals marketplace</li>
              </ul>
              <a className="btn btn-ghost cta" href="/auth/signup" style={{ justifyContent: 'center' }}>
                Start free →
              </a>
            </div>

            <div className="price-card featured reveal">
              <span className="ribbon">Most popular</span>
              <div className="tier">Essential</div>
              <div className="price">
                £4.99<span className="per">/month</span>
              </div>
              <div className="founding">Founding member · locked-in forever</div>
              <ul>
                <li>Unlimited AI dispute letters</li>
                <li>Bank sync — 2 accounts</li>
                <li>Email inbox scan</li>
                <li>Pocket Agent in Telegram</li>
              </ul>
              <a className="btn btn-mint cta" href="/auth/signup?plan=essential" style={{ justifyContent: 'center' }}>
                Start 14-day trial →
              </a>
            </div>

            <div className="price-card reveal">
              <div className="tier">Pro</div>
              <div className="price">
                £9.99<span className="per">/month</span>
              </div>
              <div className="founding">Founding member · locked-in forever</div>
              <ul>
                <li>Everything in Essential</li>
                <li>Unlimited bank &amp; email connections</li>
                <li>Deal alerts on bill changes</li>
                <li>Priority human review on complex disputes</li>
              </ul>
              <a className="btn btn-ghost cta" href="/auth/signup?plan=pro" style={{ justifyContent: 'center' }}>
                Go Pro →
              </a>
            </div>
          </div>
          <p className="compare-link">
            <a href="/pricing">See the full feature comparison →</a>
          </p>
        </div>
      </section>

      {/* FAQ (light) — trust-building detail on data & safety ------ */}
      <section className="faq-section section-light" id="faq">
        <div className="wrap">
          <div className="section-head reveal" style={{ textAlign: 'center', margin: '0 auto 48px' }}>
            <span className="eyebrow">Your most common questions</span>
            <h2 style={{ margin: '12px 0' }}>
              How your data stays safe,
              <br />
              and how Paybacker actually works.
            </h2>
            <p>
              We&rsquo;re a UK company, ICO-registered, FCA-authorised via Yapily for Open Banking,
              and GDPR-compliant. Here&rsquo;s the plain-English detail.
            </p>
          </div>

          <div className="faq-list reveal">
            <details className="faq-item">
              <summary>
                <span>Is it safe to connect my bank account?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Yes. We use <strong>Yapily</strong>, an FCA-authorised Open Banking provider
                  regulated by the Financial Conduct Authority (FRN 827001). Open Banking is the
                  UK&rsquo;s official, government-backed framework for connecting to bank
                  accounts — the same tech used by Monzo, Emma, Plaid-powered apps, and HMRC&rsquo;s
                  own services.
                </p>
                <p>
                  Three things you should know:
                </p>
                <ul>
                  <li>
                    <strong>Read-only access.</strong> Paybacker can <em>see</em> your transactions
                    and balances. We physically cannot move money, make payments, or change your
                    account settings.
                  </li>
                  <li>
                    <strong>We never see your banking password.</strong> You authenticate directly
                    with your bank using their own app or online banking — we never see or store
                    your credentials.
                  </li>
                  <li>
                    <strong>Revoke anytime.</strong> You can disconnect any bank in one tap from
                    your Paybacker dashboard, or revoke access directly from your bank&rsquo;s
                    Open Banking settings.
                  </li>
                </ul>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>What does Paybacker actually do with my transaction data?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  We use it to find you money. Specifically, we categorise every transaction, spot
                  recurring payments (subscriptions, direct debits, contracts), detect unusual
                  price rises, flag forgotten or inactive subscriptions, and identify eligible
                  refunds or disputes under UK consumer law.
                </p>
                <p>
                  Your data is <strong>never sold</strong>, never shared with third-party
                  advertisers, and never used to train AI models outside your own account. Full
                  detail in our{' '}
                  <a href="/privacy">Privacy Policy</a> and{' '}
                  <a href="/terms">Terms of Service</a>.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>Where is my data stored, and is it encrypted?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Your data is stored in the <strong>UK and EU only</strong> (Supabase, AWS
                  eu-west-2 London region). It&rsquo;s encrypted in transit using TLS 1.3 and
                  encrypted at rest using AES-256.
                </p>
                <p>
                  We are registered with the UK Information Commissioner&rsquo;s Office (ICO) as a
                  data controller. Under UK GDPR you have the right to access, correct, export, or
                  delete all of your data at any time — directly from your dashboard or by emailing{' '}
                  <a href="mailto:privacy@paybacker.co.uk">privacy@paybacker.co.uk</a>.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>Which UK banks are supported?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  All major UK high-street banks and challenger banks via Open Banking, including:
                  Barclays, HSBC, Lloyds, NatWest, RBS, Santander, Halifax, Nationwide, TSB, Monzo,
                  Starling, Revolut, Chase UK, First Direct, Metro Bank, Co-op Bank, and the vast
                  majority of UK building societies and credit card issuers.
                </p>
                <p>
                  Most US, Australian and EU banks are also supported for international users, but
                  Paybacker&rsquo;s core features (UK consumer law letters, UK switching deals) are
                  built for UK residents.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>How accurate are the AI-generated complaint letters?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Every letter is drafted by Claude (Anthropic&rsquo;s frontier AI), citing exact
                  UK legislation — Consumer Rights Act 2015, UK261/EU261, Ofgem Standards of
                  Conduct, Ofcom Fairness Framework, Consumer Credit Act 1974, and more —
                  depending on the dispute type.
                </p>
                <p>
                  Letters are reviewed in real time for factual accuracy and legal correctness, and
                  you can edit any letter before sending. We&rsquo;ve sent thousands of letters and
                  our success rate on mid-contract price rise disputes (the most common use case)
                  is currently <strong>78%</strong>.
                </p>
                <p className="faq-disclaimer">
                  AI-generated letters are for guidance only and do not constitute legal advice. For
                  complex disputes (e.g. disputes over £10,000, probate matters, or pending court
                  proceedings), always consult a qualified solicitor.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>What happens if the company ignores my letter?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Every letter sets a 14-day response window (28 days for regulated financial
                  services under FCA rules). If the company doesn&rsquo;t respond or refuses, we
                  escalate:
                </p>
                <ul>
                  <li>
                    <strong>Broadband / mobile / TV:</strong> Ofcom-backed ombudsman (CISAS or
                    Ombudsman Services: Communications).
                  </li>
                  <li>
                    <strong>Energy:</strong> Ofgem-backed Energy Ombudsman.
                  </li>
                  <li>
                    <strong>Banking / credit / insurance:</strong> Financial Ombudsman Service
                    (FOS) — decisions are legally binding on the company up to £430,000.
                  </li>
                  <li>
                    <strong>Retail goods &amp; services:</strong> Small Claims Court (up to
                    £10,000, £30 fee, no solicitor needed).
                  </li>
                </ul>
                <p>
                  Paybacker auto-drafts the escalation letter when the window expires — you just
                  click send.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>What&rsquo;s actually free, and when do I have to pay?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  The Free plan includes 3 AI dispute letters per month, a manual subscription
                  tracker, a one-time bank scan, a one-time email inbox scan, the full deals
                  marketplace, and the AI chatbot.
                </p>
                <p>
                  You only need Essential (£4.99/mo) or Pro (£9.99/mo) if you want{' '}
                  <strong>unlimited</strong> disputes, daily automatic bank sync, monthly (or
                  unlimited) email scans, the Pocket Agent in Telegram/WhatsApp, and priority
                  human review on complex disputes. Founding-member pricing is locked in forever.
                </p>
                <p>
                  No ads, no affiliate upsell traps. We make money from the monthly subscription
                  and a small optional commission if you switch provider via the deals marketplace
                  — you pay the same price either way.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>Which email providers can Paybacker scan?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  <strong>Gmail</strong> and <strong>Outlook</strong> (Microsoft 365) are fully
                  supported using the official, Google/Microsoft-verified OAuth flow with
                  read-only permissions. We&rsquo;ve passed Google&rsquo;s CASA security
                  assessment for sensitive-scope access.
                </p>
                <p>
                  Yahoo Mail and generic IMAP (Fastmail, ProtonMail, custom domains) are supported
                  via app passwords. iCloud Mail is on the roadmap for Q3 2026.
                </p>
                <p>
                  The inbox scan looks for subscription receipts, contract confirmations, price
                  rise notifications, flight delay emails, and potential refund opportunities —
                  nothing else. We don&rsquo;t read personal email.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>Can I cancel my subscription at any time?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Yes — cancel in one click from your Paybacker dashboard (Settings → Billing). No
                  call centre, no retention dark patterns, no &ldquo;let me transfer you to
                  someone who can help.&rdquo; Your subscription stops at the end of the current
                  billing period.
                </p>
                <p>
                  If you cancel within 14 days of signing up and haven&rsquo;t used Paybacker
                  intensively, you&rsquo;re entitled to a full refund under the Consumer Contracts
                  Regulations — we&rsquo;ll process it within 5 working days.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>
                <span>Who&rsquo;s behind Paybacker?</span>
                <span className="faq-chev" aria-hidden="true">+</span>
              </summary>
              <div className="faq-body">
                <p>
                  Paybacker is built by <strong>Paybacker LTD</strong>, a UK company registered in
                  England &amp; Wales, founded March 2026. We&rsquo;re an ICO-registered data
                  controller, FCA-authorised via Yapily for Open Banking access, and a verified
                  Google Cloud partner for OAuth scopes.
                </p>
                <p>
                  You can reach the founder directly at{' '}
                  <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a> — we aim to
                  respond within 24 hours, usually much faster. For data protection queries,{' '}
                  <a href="mailto:privacy@paybacker.co.uk">privacy@paybacker.co.uk</a>.
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Testimonials ---------------------------------------------- */}
      <section className="testimonials-section section-light">
        <div className="testimonials-head reveal">
          <span className="eyebrow">Honest words from real users</span>
          <h2>
            What the money
            <br />
            we found meant for them.
          </h2>
        </div>
        <div className="t-track">
          {doubledTestimonials.map((t, i) => (
            <div className="t-card" key={`${t.name}-${i}`}>
              <div className="who">
                <div className="avatar" style={{ background: t.color }}>
                  {t.name[0]}
                </div>
                <div>
                  <div className="name">{t.name}</div>
                  <div className="meta">{t.meta}</div>
                </div>
              </div>
              <div className="quote">{t.quote}</div>
              <div className="saved">{t.saved}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA (dark) ------------------------------------------ */}
      <section
        className="final-cta section-ink glow-wrap"
        style={{ '--glow-opacity': 0.14 } as CSSVarProperties}
      >
        <div className="wrap">
          <h2 className="reveal">
            Stop overpaying.
            <br />
            Start <span className="mint">fighting</span> back.
          </h2>
          <p className="fc-sub reveal">
            Most UK households are overcharged by £1,000+ a year. We find it, dispute it, and
            cancel it — in minutes.
          </p>
          <div className="fc-btn-row reveal">
            <a className="btn btn-mint" href="/auth/signup">
              Start your free 14-day Pro trial →
            </a>
          </div>
          <p className="fine">No card. Cancel anytime. Your data stays in the UK.</p>
        </div>
      </section>

      {/* Footer ---------------------------------------------------- */}
      <footer>
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="logo">
                <span>Pay</span>
                <span className="backer">backer</span>
              </div>
              <p>
                The UK&rsquo;s AI money-back engine. We find what you&rsquo;re losing and fight to
                get it back.
              </p>
              <p
                style={{
                  marginTop: '14px',
                  fontSize: '11px',
                  color: 'var(--text-on-ink-dim)',
                  maxWidth: '320px',
                }}
              >
                AI-generated letters are for guidance only and do not constitute legal advice. For
                complex disputes, always consult a qualified solicitor.
              </p>
            </div>
            <div className="footer-col">
              <h5>Product</h5>
              <a href="/complaints">Disputes Centre</a>
              <a href="/dashboard">Money Hub</a>
              <a href="/#pocket-agent">Pocket Agent</a>
              <a href="/deals">Deals</a>
              <a href="/pricing">Pricing</a>
            </div>
            <div className="footer-col">
              <h5>Company</h5>
              <a href="/about">About</a>
              <a href="/blog">Blog</a>
              <a href="mailto:press@paybacker.co.uk">Press</a>
              <a href="/careers">Careers</a>
              <a href="mailto:hello@paybacker.co.uk">Contact</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="/privacy-policy">Privacy</a>
              <a href="/terms-of-service">Terms</a>
              <a href="/cookie-policy">Cookies</a>
              <a href="/privacy-policy#ico">ICO notice</a>
              <a href="mailto:complaints@paybacker.co.uk">Complaints</a>
            </div>
            <div className="footer-col">
              <h5>Connect</h5>
              <div className="footer-socials" style={{ marginBottom: '14px' }}>
                <a href="https://x.com/PaybackerUK" target="_blank" rel="noopener noreferrer" aria-label="X">
                  𝕏
                </a>
                <a href="https://www.instagram.com/paybacker.co.uk/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  ◎
                </a>
                <a href="https://www.facebook.com/profile.php?id=61579563073310" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  f
                </a>
                <a href="https://www.tiktok.com/@paybacker.co.uk" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                  ♪
                </a>
                <a href="https://www.linkedin.com/company/112575954/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  in
                </a>
              </div>
              <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div>© 2026 Paybacker LTD · Registered in England &amp; Wales</div>
            <div>paybacker.co.uk · Made in London 🇬🇧</div>
          </div>
        </div>
      </footer>

      {/* Live chat widget — appears 2s after load ------------------ */}
      <button
        className={`live-chat${chatShown ? ' shown' : ''}`}
        aria-label="Open chat"
        type="button"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
      </button>
    </div>
  );
}
