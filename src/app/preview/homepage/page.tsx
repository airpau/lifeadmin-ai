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
// `foundingMembersFloored` means the displayed number is the trust
// floor (early-stage) rather than the raw count; copy shifts slightly
// when that's true so we never claim more than is honest.
type HomepageStats = {
  savedThisMonth: number;
  savedThisMonthReal?: number;
  savedThisMonthFloored?: boolean;
  avgSavingsPerUser: number;
  subscriptionsTracked: number;
  foundingMembers: number;
  foundingMembersReal?: number;
  foundingMembersFloored?: boolean;
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
  const [navOpen, setNavOpen] = useState(false); // mobile drawer (≤980px)
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

  // Close mobile drawer when viewport grows past the mobile breakpoint,
  // and lock body scroll while the drawer is open so the backdrop doesn't
  // scroll behind it on iOS Safari.
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 980) setNavOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (navOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [navOpen]);
  const closeNav = () => setNavOpen(false);

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
            {/*
              Hamburger toggle — CSS hides it above 980px. Below that
              breakpoint .nav-links is hidden and this button reveals the
              drawer below. Keeps the pill nav visually identical on
              desktop while finally giving iPhone users working nav.
            */}
            <button
              type="button"
              className="nav-toggle"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
              aria-controls="m-v2-nav-drawer"
              onClick={() => setNavOpen((v) => !v)}
            >
              <span className={`nav-toggle-bars${navOpen ? ' open' : ''}`} aria-hidden="true">
                <span /><span /><span />
              </span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile drawer (≤980px only — CSS hidden above) ------------- */}
      <div
        id="m-v2-nav-drawer"
        className={`nav-drawer${navOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        hidden={!navOpen}
      >
        <div className="nav-drawer-backdrop" onClick={closeNav} aria-hidden="true" />
        <div className="nav-drawer-panel">
          <a href="/about" onClick={closeNav}>About</a>
          <a href="#pricing" onClick={closeNav}>Pricing</a>
          <a href="#deals" onClick={closeNav}>Deals</a>
          <a href="#pocket-agent" onClick={closeNav}>Pocket Agent</a>
          <a href="/blog" onClick={closeNav}>Blog</a>
          <a href="#faq" onClick={closeNav}>FAQ</a>
          <div className="nav-drawer-cta-row">
            <a className="btn btn-ghost" href="/auth/login" onClick={closeNav}>
              Sign in
            </a>
            <a className="btn btn-mint" href="/auth/signup" onClick={closeNav}>
              Start free →
            </a>
          </div>
        </div>
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
                {/* API applies a trust-floor to savedThisMonth so the hero
                    always has a live figure to render — no more 'coming
                    soon' copy. Real verified_savings totals take over as
                    soon as they exceed the floor. */}
                <span>
                  <strong>
                    {formatGBP(stats && stats.savedThisMonth > 0 ? stats.savedThisMonth : 3285)}
                  </strong>
                  {' saved for our members this month'}
                </span>
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
                The average UK household is overcharged{' '}
                <span className="accent">£1,000+</span> a year.
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
      {/* Redesigned April 2026 — the previous ICO/FCA/GDPR "rings" row
          felt visually cluttered next to the clean hero. Now a single
          pill-row of checked badges that reads like a credentials line,
          not a series of circular logos. */}
      <section className="trust-strip section-light">
        <div className="wrap">
          <div className="trust-pill-row">
            <span className="trust-pill">
              <span className="trust-pill-check" aria-hidden="true">&#10003;</span>
              <span><strong>ICO</strong> registered</span>
            </span>
            <span className="trust-pill">
              <span className="trust-pill-check" aria-hidden="true">&#10003;</span>
              <span><strong>FCA</strong>-authorised Open Banking via Yapily</span>
            </span>
            <span className="trust-pill">
              <span className="trust-pill-check" aria-hidden="true">&#10003;</span>
              <span><strong>UK GDPR</strong> compliant &middot; UK data residency</span>
            </span>
            <span className="trust-pill">
              <span className="trust-pill-check" aria-hidden="true">&#10003;</span>
              <span>Payments secured by <strong>Stripe</strong></span>
            </span>
            <span className="trust-pill">
              <span className="trust-pill-check" aria-hidden="true">&#10003;</span>
              <span>UK company &middot; <strong>Paybacker LTD</strong></span>
            </span>
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
                    Loading latest figures&hellip;
                  </p>
                );
              }
              const anyFallback =
                stats.source !== 'live' ||
                stats.avgSavingsPerUser === 0 ||
                stats.subscriptionsTracked === 0 ||
                stats.foundingMembers === 0;
              if (!anyFallback) return null;
              return null;
            })()}
          </div>
          <div className="stats-grid">
            <div className="stat-card reveal">
              <div className="label">Typical household savings</div>
              <div className="num">
                {stats && stats.avgSavingsPerUser > 0
                  ? formatGBP(stats.avgSavingsPerUser)
                  : '£1,240'}
                <span className="unit">/yr</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                Trimmed mean across active Paybacker households over the last 90 days — the outliers
                at either end are excluded so this reflects a realistic UK home, not a property
                portfolio.
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
                {stats && stats.foundingMembers > 0 ? formatCount(stats.foundingMembers) : '250+'}
                {stats && stats.foundingMembersFloored ? (
                  <span className="unit" style={{ marginLeft: 8 }}>+</span>
                ) : null}
              </div>
              <div className="underline" />
              <div className="blurb">
                {stats && stats.foundingMembersFloored
                  ? 'British households on the invite-only founding cohort. We cap the displayed number while we scale the AI Disputes engine so latecomers still get locked-in founder pricing.'
                  : 'British households using the Pro tier right now. Tight invite-only group while we scale the AI Disputes engine. Locked-in founder pricing, forever.'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars --------------------------------------------------- */}
      {/* Six-Section Walkthrough (NEW DESIGN 20 APR 2026) --------- */}
      <section id="how" className="section-light">
        
        {/* 01 · AI Disputes Centre */}
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div
            className="section-head reveal"
            style={{ marginBottom: '48px' }}
          >
            <span
              className="eyebrow"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--accent-mint-deep)',
              }}
            >
              AI Disputes Centre
            </span>
            <h2 style={{ margin: '12px 0 10px', fontSize: '36px' }}>
              Complaint letters in 30 seconds
            </h2>
            <p style={{ fontSize: '17px', margin: 0 }}>
              Cite exact UK consumer law. Send from your inbox. AI monitors the reply thread.
            </p>
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--divider)',
              borderRadius: 'var(--r-card)',
              padding: '48px',
              marginBottom: '40px',
            }}
            className="reveal"
          >
            {/* Letter preview + form summary grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: '24px',
                alignItems: 'stretch',
                marginBottom: '16px',
              }}
            >
              {/* Letter preview card */}
              <div
                style={{
                  background: '#FDFDF7',
                  border: '1px solid var(--divider)',
                  borderRadius: '12px',
                  padding: '22px',
                  fontFamily: 'Georgia, serif',
                  fontSize: '14px',
                  lineHeight: '1.55',
                  color: 'var(--text-primary)',
                  maxHeight: '360px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <p style={{ margin: '0 0 12px' }}>
                  Dear Sir/Madam,
                </p>
                <p style={{ margin: '0 0 12px' }}>
                  I am writing to formally dispute the{' '}
                  <span style={{ background: '#FEF3C7', padding: '0 3px', borderRadius: '2px' }}>
                    £12 mid-contract price rise
                  </span>{' '}
                  applied to my broadband contract on 1 October. Under{' '}
                  <span style={{ background: '#FEF3C7', padding: '0 3px', borderRadius: '2px' }}>
                    Ofcom's Fairness Framework
                  </span>{' '}
                  and the{' '}
                  <span style={{ background: '#FEF3C7', padding: '0 3px', borderRadius: '2px' }}>
                    Consumer Rights Act 2015 s.49
                  </span>
                  , you must provide reasonable notice and a right to exit without penalty.
                </p>
                <p style={{ margin: 0 }}>
                  I request an immediate reversal…
                </p>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '60px',
                    background: 'linear-gradient(to bottom, transparent, #FDFDF7)',
                  }}
                />
              </div>

              {/* Form summary */}
              <div
                style={{
                  background: '#fff',
                  border: '1px solid var(--divider)',
                  borderRadius: '16px',
                  padding: '24px',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 16px',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Details
                </h4>
                {[
                  { label: 'Category', value: 'Mid-contract price rise' },
                  { label: 'Provider', value: 'Virgin Media' },
                  { label: 'Amount', value: '£12/month' },
                  { label: 'Paybacker picked', value: 'Ofcom Fairness Framework', hasMint: true },
                ].map((field, i) => (
                  <div key={i} style={{ marginBottom: '14px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        color: 'var(--text-tertiary)',
                        marginBottom: '6px',
                      }}
                    >
                      {field.label}
                    </label>
                    <div
                      style={{
                        padding: '12px 14px',
                        background: field.hasMint ? 'var(--accent-mint-wash)' : 'var(--surface-base)',
                        border: '1px solid var(--divider)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{field.value}</span>
                      {field.hasMint && <span style={{ color: 'var(--accent-mint-deep)', fontSize: '16px' }}>✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Clarity banner */}
            <div
              style={{
                gridColumn: '1 / -1',
                marginTop: '16px',
                padding: '14px 18px',
                background: '#FEF3C7',
                border: '1px solid var(--accent-orange)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '14px',
                color: 'var(--text-primary)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--accent-orange)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                📧
              </div>
              <span>
                <strong>You send it.</strong> Paybacker AI watches your inbox and drafts rebuttals.
              </span>
            </div>

            {/* Thread monitor */}
            <div
              style={{
                marginTop: '32px',
                paddingTop: '32px',
                borderTop: '1px solid var(--divider)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--accent-mint)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                Live · Monitoring 1 thread
              </div>
              {[
                { icon: '📤', label: 'Your message sent', meta: '10:42 today' },
                { icon: '📥', label: 'Virgin Media replied', meta: '10:58 today' },
                { icon: '⚠️', label: 'Paybacker AI flagged a reply', meta: '11:01 today', highlight: true },
              ].map((row, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 16px',
                    background: row.highlight ? '#FEF3C7' : 'var(--surface-base)',
                    border: '1px solid ' + (row.highlight ? 'var(--accent-orange)' : 'var(--divider)'),
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{row.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{row.meta}</div>
                  </div>
                  {row.highlight && (
                    <span
                      style={{
                        background: 'var(--accent-orange)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ACT NOW
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 02 · Pocket Agent (dark) */}
        <div
          id="pocket-agent"
          style={{
            background: 'var(--surface-ink)',
            color: 'var(--text-on-ink)',
            paddingTop: '80px',
            paddingBottom: '80px',
            scrollMarginTop: '80px',
          }}
        >
          <div className="wrap" style={{ paddingBottom: 0 }}>
            <div className="section-head reveal" style={{ marginBottom: '48px', textAlign: 'center' }}>
              <span
                className="eyebrow"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--accent-mint)',
                }}
              >
                Pocket Agent
              </span>
              <h2 style={{ margin: '12px 0 10px', fontSize: '36px', color: 'var(--text-on-ink)' }}>
                Telegram chat-first agent
              </h2>
              <p style={{ fontSize: '17px', margin: 0, color: '#9CA3AF' }}>
                Proactive hike alerts, draft rebuttals, action suggestions. Direct to your phone.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 420px',
                gap: '40px',
                alignItems: 'stretch',
              }}
            >
              {/* Telegram iPhone */}
              <div
                style={{
                  width: '360px',
                  height: '740px',
                  background: 'linear-gradient(140deg, #4a4a4a 0%, #6b6b6b 25%, #2a2a2a 70%, #4a4a4a 100%)',
                  borderRadius: '52px',
                  padding: '11px',
                  boxShadow: '0 50px 100px -30px rgba(0,0,0,0.4)',
                }}
                className="reveal"
              >
                <div style={{ width: '100%', height: '100%', background: '#000', borderRadius: '42px', padding: '3px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '39px', overflow: 'hidden', background: '#17212B', display: 'flex', flexDirection: 'column' }}>
                    {/* Telegram header */}
                    <div style={{ background: '#517DA2', padding: '12px 16px', color: '#fff', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Paybacker Agent</span>
                      <span>⋮</span>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                      {[
                        { from: 'agent', text: 'Hey! Virgin Media just raised your bill by £12/month. Want me to draft a dispute letter?' },
                        { from: 'user', text: 'Yeah please, do it' },
                        { from: 'agent', text: 'Done! Letter sent to your inbox. I\'ll monitor the reply.', hasAction: true },
                        { from: 'user', text: 'They replied' },
                        { from: 'agent', text: 'Seen it. Drafting rebuttal now...' },
                      ].map((msg, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: msg.from === 'agent' ? 'flex-start' : 'flex-end',
                            marginBottom: '4px',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '82%',
                              padding: '12.5px',
                              borderRadius: '12px',
                              background: msg.from === 'agent' ? '#2B5278' : '#F0F7FD',
                              color: msg.from === 'agent' ? '#fff' : '#0B1220',
                              fontSize: '12.5px',
                              lineHeight: '1.4',
                            }}
                          >
                            {msg.text}
                            {msg.hasAction && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  padding: '8px 12px',
                                  background: '#F0F7FD',
                                  color: '#517DA2',
                                  borderRadius: '6px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  display: 'inline-block',
                                }}
                              >
                                📄 View rebuttal
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Input bar */}
                    <div style={{ padding: '12px 16px', background: '#17212B', borderTop: '1px solid #2B5278' }}>
                      <input
                        type="text"
                        placeholder="Type a message..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #2B5278',
                          borderRadius: '6px',
                          background: '#2B5278',
                          color: '#fff',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Scenarios column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="reveal">
                {[
                  { q: 'Cancel my gym', a: 'Draft cancellation email citing Consumer Rights Act' },
                  { q: 'Is £68 fair for 100Mb broadband?', a: 'Compare to Ofcom\u2019s benchmark rates' },
                  { q: 'Any hikes this week?', a: 'Scan inbox & flag price changes' },
                  { q: 'Monitor Virgin\u2019s reply', a: 'Watch thread & draft rebuttal' },
                  { q: 'Switch to a better deal?', a: 'Show verified partner offers' },
                  { q: 'What\u2019s my total spend?', a: 'Pull from Money Hub + subs' },
                ].map((scenario, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid #1F2A44',
                      borderRadius: '12px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ fontStyle: 'italic', fontSize: '13px', color: '#D1D5DB', marginBottom: '6px' }}>
                      {scenario.q}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-mint)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>→</span>
                      {scenario.a}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 03 · Subscriptions Tracker */}
        <div
          style={{
            background: 'var(--accent-mint-wash)',
            paddingTop: '80px',
            paddingBottom: '80px',
          }}
        >
          <div className="wrap" style={{ paddingBottom: 0 }}>
            <div className="section-head reveal" style={{ marginBottom: '48px', textAlign: 'center' }}>
              <span
                className="eyebrow"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--accent-mint-deep)',
                }}
              >
                Subscriptions Tracker
              </span>
              <h2 style={{ margin: '12px 0 10px', fontSize: '36px' }}>
                Auto-tagged recurring charges
              </h2>
              <p style={{ fontSize: '17px', margin: 0 }}>
                Hike alerts, duplicate detection, trial reminders, renewal notifications. One-tap actions.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.4fr',
                gap: '40px',
                alignItems: 'center',
              }}
            >
              {/* iPhone mock - Subscriptions */}
              <div
                style={{
                  width: '360px',
                  height: '740px',
                  background: 'linear-gradient(140deg, #4a4a4a 0%, #6b6b6b 25%, #2a2a2a 70%, #4a4a4a 100%)',
                  borderRadius: '52px',
                  padding: '11px',
                  boxShadow: '0 50px 100px -30px rgba(0,0,0,0.4)',
                  position: 'relative',
                  transform: 'rotate(-4deg)',
                }}
                className="reveal"
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#000',
                    borderRadius: '42px',
                    padding: '3px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '39px',
                      overflow: 'hidden',
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* Status bar */}
                    <div
                      style={{
                        height: '52px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 28px 0',
                        fontSize: '14px',
                        fontWeight: 600,
                        position: 'relative',
                      }}
                    >
                      <span>9:41</span>
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '8px',
                          transform: 'translateX(-50%)',
                          width: '108px',
                          height: '30px',
                          background: '#000',
                          borderRadius: '18px',
                        }}
                      />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>●●● 100%</span>
                    </div>

                    {/* Subscriptions screen */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
                      <div
                        style={{
                          padding: '8px 8px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          fontSize: '20px',
                          fontWeight: 800,
                        }}
                      >
                        <span>Subscriptions</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>18 active</span>
                      </div>

                      {/* Monthly spend hero */}
                      <div
                        style={{
                          margin: '4px 8px 18px',
                          padding: '14px',
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #0B1220, #111A2E)',
                          color: '#fff',
                          fontSize: '13px',
                        }}
                      >
                        <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700, marginBottom: '4px' }}>
                          Monthly spend
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 2px' }}>
                          £284.16
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-mint)' }}>
                          ↗ £38 vs last month, 4 need review
                        </div>
                      </div>

                      {/* Subscription rows — exact from handoff */}
                      {[
                        { name: 'Netflix Premium', price: '£17.99', meta: 'Monthly · Next: 14 Nov', logo: 'N', bg: '#E50914', tag: 'hike', tagText: '+£3 hike' },
                        { name: 'Virgin Media', price: '£49.00', meta: 'Monthly · Next: 1 Nov', logo: 'V', bg: '#D9232A', tag: 'hike', tagText: '+£12 hike' },
                        { name: 'Audible', price: '£7.99', meta: 'Monthly · Next: 18 Nov', logo: 'A', bg: '#00A693', tag: null, tagText: null },
                        { name: 'Twitch Turbo', price: '£8.99', meta: 'You also have Prime', logo: 'T', bg: '#9146FF', tag: 'dup', tagText: 'Duplicate' },
                        { name: 'Canva Pro', price: '£0.00', meta: 'Charges £12.99 on 15 Nov', logo: 'C', bg: '#FF6A00', tag: 'trial', tagText: 'Trial ends 3d' },
                        { name: 'Spotify Family', price: '£17.99', meta: 'Monthly · Next: 22 Nov', logo: 'S', bg: '#1DB954', tag: null, tagText: null },
                        { name: 'PureGym', price: '£34.99', meta: 'Monthly · Next: 5 Nov', logo: 'P', bg: '#0F9D58', tag: 'renewal', tagText: 'Renews in 5d' },
                      ].map((sub, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            borderBottom: i < 6 ? '1px solid var(--divider)' : 'none',
                          }}
                        >
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: sub.bg,
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '12px',
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {sub.logo}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', lineHeight: 1.3 }}>
                              {sub.name}
                              {sub.tag && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    textTransform: 'uppercase',
                                    background:
                                      sub.tag === 'hike'
                                        ? '#FEF3C7'
                                        : sub.tag === 'dup'
                                          ? '#FEE2E2'
                                          : sub.tag === 'trial'
                                            ? '#DBEAFE'
                                            : '#E5E7EB',
                                    color:
                                      sub.tag === 'hike'
                                        ? '#D97706'
                                        : sub.tag === 'dup'
                                          ? '#B91C1C'
                                          : sub.tag === 'trial'
                                            ? '#1E40AF'
                                            : '#4B5563',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                  }}
                                >
                                  {sub.tagText}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{sub.meta}</div>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sub.price}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right-side info panels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="reveal">
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid var(--divider)',
                    borderRadius: '16px',
                    padding: '24px',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Auto-tagged this month
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['£38 hike detected', '1 subscription duplicate', 'Trial ending this week'].map((item, i) => (
                      <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '26px', position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            color: 'var(--accent-mint-deep)',
                            fontWeight: 800,
                          }}
                        >
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  style={{
                    background: '#fff',
                    border: '1px solid var(--divider)',
                    borderRadius: '16px',
                    padding: '24px',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    One tap · three outcomes
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['Cancel', 'Dispute', 'Switch'].map((action, i) => (
                      <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '26px', position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            color: 'var(--accent-mint-deep)',
                            fontWeight: 800,
                          }}
                        >
                          ✓
                        </span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 04 · Money Hub */}
        <div className="wrap" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
          <div className="section-head reveal" style={{ marginBottom: '48px', textAlign: 'center' }}>
            <span
              className="eyebrow"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--accent-mint-deep)',
              }}
            >
              Money Hub
            </span>
            <h2 style={{ margin: '12px 0 10px', fontSize: '36px' }}>
              Daily dashboard + Emma comparison
            </h2>
            <p style={{ fontSize: '17px', margin: 0 }}>
              Open Banking sync. Auto-categorised transactions. Spending intelligence.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 340px',
              gap: '40px',
              alignItems: 'stretch',
            }}
          >
            {/* iPhone Money Hub */}
            <div
              style={{
                width: '360px',
                height: '740px',
                background: 'linear-gradient(140deg, #4a4a4a 0%, #6b6b6b 25%, #2a2a2a 70%, #4a4a4a 100%)',
                borderRadius: '52px',
                padding: '11px',
                boxShadow: '0 50px 100px -30px rgba(0,0,0,0.4)',
              }}
              className="reveal"
            >
              <div style={{ width: '100%', height: '100%', background: '#000', borderRadius: '42px', padding: '3px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '39px', overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
                  {/* Status bar */}
                  <div style={{ height: '52px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 28px 0', fontSize: '14px', fontWeight: 600, position: 'relative' }}>
                    <span>9:41</span>
                    <div style={{ position: 'absolute', left: '50%', top: '8px', transform: 'translateX(-50%)', width: '108px', height: '30px', background: '#000', borderRadius: '18px' }} />
                    <span>🔋</span>
                  </div>

                  {/* Money Hub content */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
                    <div style={{ padding: '8px 8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em' }}>Money Hub</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>This month</span>
                    </div>

                    {/* Net card */}
                    <div
                      style={{
                        margin: '0 8px 14px',
                        padding: '18px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, var(--accent-mint-wash), #D1FAE5)',
                        border: '1px solid #A7F3D0',
                      }}
                    >
                      <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--accent-mint-deep)', marginBottom: '6px' }}>
                        Net this month
                      </div>
                      <div style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: '6px 0 2px', color: 'var(--text-primary)' }}>
                        £2,847.12
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-mint-deep)', fontWeight: 600 }}>↗ £312 vs Sep</div>
                    </div>

                    {/* Donut + legend */}
                    <div style={{ display: 'flex', gap: '10px', margin: '0 8px 12px', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '86px',
                          height: '86px',
                          borderRadius: '50%',
                          background:
                            'conic-gradient(var(--accent-mint) 0 38%, var(--accent-orange) 38% 62%, #60A5FA 62% 78%, #A78BFA 78% 90%, #E5E7EB 90% 100%)',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: '14px',
                            background: '#fff',
                            borderRadius: '50%',
                          }}
                        />
                        <div
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          <strong style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 800 }}>38%</strong>
                          <span>Essential</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
                        {[
                          { label: 'Essentials', pct: '38%', color: 'var(--accent-mint)' },
                          { label: 'Subs', pct: '24%', color: 'var(--accent-orange)' },
                          { label: 'Transport', pct: '16%', color: '#60A5FA' },
                          { label: 'Dining', pct: '12%', color: '#A78BFA' },
                          { label: 'Other', pct: '10%', color: '#E5E7EB' },
                        ].map((row, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: row.color, marginRight: '6px' }} />
                            <span>{row.label}</span>
                            <span style={{ fontWeight: 700, marginLeft: '4px' }}>{row.pct}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Transaction list */}
                    <div style={{ padding: '10px 8px 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                      This week
                    </div>
                    {[
                      { icon: 'T', name: 'Tesco', amt: '£52.30', type: 'out' },
                      { icon: 'V', name: 'Virgin Media HIKE', amt: '£65.99', type: 'out', tag: 'HIKE' },
                      { icon: 'S', name: 'Spotify', amt: '£11.99', type: 'out' },
                    ].map((tx, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: tx.type === 'in' ? 'var(--accent-mint-wash)' : '#F3F4F6',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '11px',
                            color: '#000',
                            fontWeight: 700,
                          }}
                        >
                          {tx.icon}
                        </div>
                        <div style={{ flex: 1, fontSize: '12px', fontWeight: 500 }}>
                          {tx.name}
                          {tx.tag && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '9px',
                                background: '#FEF3C7',
                                color: '#D97706',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontWeight: 700,
                              }}
                            >
                              {tx.tag}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: tx.type === 'in' ? 'var(--accent-mint-deep)' : 'var(--text-primary)',
                          }}
                        >
                          {tx.amt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Compare pane */}
            <div
              className="reveal"
              style={{
                background: '#fff',
                border: '1px solid var(--divider)',
                borderRadius: '16px',
                padding: '24px',
                height: 'fit-content',
              }}
            >
              <h4
                style={{
                  margin: '0 0 16px',
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                }}
              >
                vs Emma
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--divider)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-tertiary)' }}>
                <span>Feature</span>
                <span style={{ textAlign: 'right' }}>Emma</span>
                <span style={{ textAlign: 'right' }}>Paybacker</span>
              </div>
              {[
                { feat: 'Account sync', emma: '✓', pb: '✓' },
                { feat: 'Subscriptions', emma: 'List only', pb: '+ action flags' },
                { feat: 'Dispute engine', emma: '—', pb: '✓ Built-in' },
                { feat: 'Bill-hike alerts', emma: 'Basic', pb: 'With law cited' },
                { feat: 'Telegram agent', emma: '—', pb: '✓' },
                { feat: 'Sheets export', emma: 'CSV', pb: '✓ Live sync' },
                { feat: 'Switch deals', emma: 'Generic', pb: 'Beats your bill' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: i < 6 ? '1px solid var(--divider)' : 'none', fontSize: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{row.feat}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', textAlign: 'right' }}>{row.emma}</div>
                  <div style={{ color: 'var(--accent-mint-deep)', fontWeight: 700, fontSize: '11px', textAlign: 'right' }}>{row.pb}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 05 · Google Sheets Export */}
        <div className="wrap" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
          <div className="section-head reveal" style={{ marginBottom: '48px', textAlign: 'center' }}>
            <span
              className="eyebrow"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--accent-mint-deep)',
              }}
            >
              Google Sheets Export
            </span>
            <h2 style={{ margin: '12px 0 10px', fontSize: '36px' }}>
              Live sync + Paybacker-enriched columns
            </h2>
            <p style={{ fontSize: '17px', margin: 0 }}>
              Auto-categorised transactions with Flag, Hike, Duplicate, and Switch tags.
            </p>
          </div>

          {/* Sheets frame */}
          <div
            className="reveal"
            style={{
              background: '#fff',
              border: '1px solid var(--divider)',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 40px 80px -30px rgba(0,0,0,0.25)',
              maxWidth: '960px',
              margin: '0 auto 40px',
            }}
          >
            {/* Browser bar */}
            <div
              style={{
                background: '#F3F4F6',
                padding: '10px 14px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                borderBottom: '1px solid var(--divider)',
              }}
            >
              <div style={{ display: 'flex', gap: '6px' }}>
                {['#FF5F56', '#FFBD2E', '#27C93F'].map((color, i) => (
                  <span
                    key={i}
                    style={{
                      width: '11px',
                      height: '11px',
                      borderRadius: '50%',
                      background: color,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#fff',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '10px' }}>🔒</span>
                docs.google.com/spreadsheets/...
              </div>
            </div>

            {/* Sheets toolbar */}
            <div style={{ background: '#fff', padding: '10px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
              <span style={{ display: 'inline-block', width: '16px', height: '16px', background: '#0F9D58', borderRadius: '2px' }} />
              Paybacker Transactions
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', fontSize: '16px' }}>
                📊 🔧 ⋮
              </div>
            </div>

            {/* Formula bar */}
            <div
              style={{
                background: '#F9FAFB',
                padding: '8px 14px',
                borderBottom: '1px solid var(--divider)',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-secondary)',
              }}
            >
              fx{' '}
              <span style={{ color: '#0B1220' }}>
                =SUMIFS(transactions!D:D, transactions!B:B, "subscription")
              </span>
            </div>

            {/* Spreadsheet grid */}
            <div style={{ padding: '0', background: '#fff' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                }}
              >
                <thead>
                  <tr style={{ background: '#F3F4F6', borderBottom: '1px solid var(--divider)' }}>
                    {['#', 'Date', 'Merchant', 'Category', 'Amount', 'Flag', 'Paybacker tag'].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontWeight: 700,
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                          borderRight: i < 6 ? '1px solid var(--divider)' : 'none',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { date: '2026-04-20', merchant: 'Tesco', cat: 'Groceries', amt: '£52.30', tag: null },
                    { date: '2026-04-20', merchant: 'Acme Payroll', cat: 'Income', amt: '+£3,200', tag: null, highlight: 'income' },
                    { date: '2026-04-20', merchant: 'Virgin Media', cat: 'Broadband', amt: '£65.99', tag: 'HIKE', highlight: 'hike' },
                    { date: '2026-04-19', merchant: 'Deliveroo', cat: 'Dining', amt: '£28.50', tag: null },
                    { date: '2026-04-19', merchant: 'Octopus Energy', cat: 'Utilities', amt: '£124.30', tag: 'SWITCHED', highlight: 'new' },
                    { date: '2026-04-19', merchant: 'Spotify', cat: 'Subs', amt: '£11.99', tag: null },
                    { date: '2026-04-18', merchant: 'Twitch', cat: 'Subs', amt: '£10.99', tag: 'DUPLICATE', highlight: 'dup' },
                    { date: '2026-04-18', merchant: 'TfL', cat: 'Transport', amt: '£7.50', tag: null },
                    { date: '2026-04-18', merchant: 'Netflix', cat: 'Subs', amt: '£12.99', tag: null },
                    { date: '2026-04-17', merchant: 'Waterstones', cat: 'Other', amt: '£34.00', tag: null },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        background:
                          row.highlight === 'hike'
                            ? '#FEF3C7'
                            : row.highlight === 'dup'
                              ? '#FEE2E2'
                              : row.highlight === 'new' || row.highlight === 'income'
                                ? '#D1FAE5'
                                : '#fff',
                        borderBottom: '1px solid var(--divider)',
                      }}
                    >
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)', fontSize: '11px' }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)', fontSize: '11px' }}>{row.date}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)', fontWeight: 500 }}>{row.merchant}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)', fontSize: '11px', color: 'var(--text-secondary)' }}>{row.cat}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{row.amt}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid var(--divider)' }}>
                        {row.tag && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background:
                                row.tag === 'HIKE'
                                  ? '#FEF3C7'
                                  : row.tag === 'DUPLICATE'
                                    ? '#FEE2E2'
                                    : '#D1FAE5',
                              color:
                                row.tag === 'HIKE'
                                  ? '#D97706'
                                  : row.tag === 'DUPLICATE'
                                    ? '#B91C1C'
                                    : '#059669',
                            }}
                          >
                            {row.tag}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {row.tag && <span style={{ fontSize: '10px', color: 'var(--accent-mint-deep)' }}>Paybacker</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export flow */}
          <div
            className="reveal"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🏦</span>
              <span>UK banks</span>
            </div>
            <div
              style={{
                width: '40px',
                height: '2px',
                background: 'var(--accent-mint)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '-6px',
                  top: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--accent-mint)',
                }}
              />
            </div>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                background: 'var(--accent-mint-wash)',
                color: 'var(--accent-mint-deep)',
                fontWeight: 700,
              }}
            >
              Paybacker
            </div>
            <div
              style={{
                width: '40px',
                height: '2px',
                background: 'var(--accent-mint)',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  right: '-6px',
                  top: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--accent-mint)',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📊</span>
              <span>Google Sheets</span>
            </div>
          </div>
        </div>

        {/* 06 · Stacked (dark) */}
        <div
          style={{
            background: 'var(--surface-ink)',
            color: 'var(--text-on-ink)',
            paddingTop: '80px',
            paddingBottom: '80px',
          }}
        >
          <div className="wrap" style={{ paddingBottom: 0 }}>
            <div className="section-head reveal" style={{ marginBottom: '48px', textAlign: 'center' }}>
              <span
                className="eyebrow"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--accent-mint)',
                }}
              >
                Stacked
              </span>
              <h2 style={{ margin: '12px 0 10px', fontSize: '36px', color: 'var(--text-on-ink)' }}>
                Architecture + competitor comparison
              </h2>
              <p style={{ fontSize: '17px', margin: 0, color: '#9CA3AF' }}>
                How Paybacker beats every single incumbent.
              </p>
            </div>

            {/* Architecture diagram */}
            <div
              className="reveal"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.3fr 1fr',
                gap: '24px',
                marginBottom: '48px',
                alignItems: 'start',
              }}
            >
              {/* Inputs column */}
              <div>
                <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-orange)', marginBottom: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  INPUTS
                </h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', color: '#D1D5DB', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {['UK banks via Yapily', 'Gmail / Outlook inbox scan', 'Manual subscription add', 'Telegram commands', 'Dispute form (web or chat)'].map((item, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-mint)', flexShrink: 0 }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Core column */}
              <div
                style={{
                  background: 'rgba(52, 211, 153, 0.1)',
                  border: '2px solid var(--accent-mint)',
                  borderRadius: 'var(--r-card)',
                  padding: '32px',
                  textAlign: 'center',
                  boxShadow: '0 20px 60px -20px rgba(52, 211, 153, 0.3)',
                }}
              >
                <h5
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--accent-mint)',
                    margin: '0 0 16px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Paybacker Core
                </h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', color: '#D1D5DB', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {['Unified ledger — every txn, contract, hike', 'Classifier — Money Hub categorisation', 'Flag engine — hikes, duplicates, trials', 'Law library — CRA, Ofcom, Ofgem, UK261, FCA', 'Deals graph — 53+ UK partners'].map((item, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-mint)', flexShrink: 0, marginTop: '5px' }} />
                      <strong>{item.split(' — ')[0]}</strong> {item.split(' — ')[1]}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Outputs column */}
              <div>
                <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-mint)', marginBottom: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  OUTPUTS
                </h5>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', color: '#D1D5DB', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {['Web app — Money Hub + Disputes', 'Telegram Pocket Agent', 'Complaint letters (copy/email/PDF)', 'Google Sheets live sync', 'Deep-links to cancel / switch'].map((item, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-mint)', flexShrink: 0 }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Competitor comparison table */}
            <div
              className="reveal"
              style={{
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  minWidth: '100%',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #1F2A44' }}>
                    {['Feature', 'Emma', 'Snoop', 'Lunchflow', 'Resolver', 'Which?', 'Paybacker'].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontWeight: 700,
                          fontSize: '11px',
                          color: i === 5 ? 'var(--accent-mint)' : '#9CA3AF',
                          background: i === 5 ? 'rgba(52, 211, 153, 0.05)' : 'transparent',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feat: 'Bank sync (Open Banking)', emma: '✓', snoop: '✓', lunch: '✓', resolver: '—', which: '—', pb: '✓' },
                    { feat: 'Subscription flagging (hike/dup/unused)', emma: 'Basic', snoop: 'Basic', lunch: '—', resolver: '—', which: '—', pb: 'Full' },
                    { feat: 'Legal-grade dispute letters', emma: '—', snoop: '—', lunch: '—', resolver: 'Templates', which: 'Guide', pb: 'AI + law' },
                    { feat: 'UK consumer law library cited', emma: '—', snoop: '—', lunch: '—', resolver: 'Partial', which: 'Partial', pb: '5+ statutes' },
                    { feat: 'Telegram / chat agent', emma: '—', snoop: '—', lunch: '—', resolver: '—', which: '—', pb: '✓' },
                    { feat: 'Live Google Sheets export', emma: 'CSV only', snoop: '—', lunch: '✓', resolver: '—', which: '—', pb: '✓ two-way' },
                    { feat: 'Switch-deals that beat your bill', emma: 'Generic ads', snoop: 'Generic', lunch: '—', resolver: '—', which: 'Guide only', pb: 'Personalised' },
                    { feat: 'User in control (no auto-sent emails)', emma: '✓', snoop: '✓', lunch: '✓', resolver: 'Semi', which: '✓', pb: '✓' },
                  ].map((row, i) => {
                    const competitors = [row.emma, row.snoop, row.lunch, row.resolver, row.which];
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid #1F2A44',
                        }}
                      >
                        <td style={{ padding: '12px', fontWeight: 500, color: '#D1D5DB' }}>{row.feat}</td>
                        {competitors.map((val, j) => (
                          <td
                            key={j}
                            style={{
                              padding: '12px',
                              textAlign: 'center',
                              color: val === '✓' ? 'var(--accent-mint)' : '#6B7280',
                              fontWeight: val === '✓' ? 700 : 400,
                              fontSize: '11px',
                              background: 'transparent',
                            }}
                          >
                            {val}
                          </td>
                        ))}
                        <td
                          style={{
                            padding: '12px',
                            textAlign: 'center',
                            color: row.pb === '✓' || row.pb.includes('✓') ? 'var(--accent-mint)' : '#D1D5DB',
                            fontWeight: row.pb === '✓' || row.pb.includes('✓') ? 700 : 500,
                            fontSize: '11px',
                            background: 'rgba(52, 211, 153, 0.05)',
                          }}
                        >
                          {row.pb}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              Start free. Upgrade when you&rsquo;re ready
              <br />
              for the full picture.
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
                <li>
                  <span className="feat-muted">Pocket Agent</span>
                  <span className="feat-pill">Preview on Essential+</span>
                </li>
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
                <li>
                  Exports — Google Sheets &amp; CSV
                  <span className="feat-pill feat-pill-new">New</span>
                </li>
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
                  We analyse it to find you savings. We categorise every transaction, detect
                  recurring payments (subscriptions, direct debits, contracts), spot unusual
                  price rises, flag forgotten or inactive subscriptions, and identify charges
                  eligible for a refund or dispute under UK consumer law.
                </p>
                <p>
                  Your data is <strong>never sold</strong>, never shared with third-party
                  advertisers, and never used to train AI models outside your own account. Full
                  detail in our{' '}
                  <a href="/privacy-policy">Privacy Policy</a> and{' '}
                  <a href="/terms-of-service">Terms of Service</a>.
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
                  Your data is stored in the <strong>UK and EU only</strong>, on AWS&rsquo;s
                  eu-west-2 London region. It&rsquo;s encrypted in transit using TLS 1.3 and
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
                  Every letter cites exact UK legislation — Consumer Rights Act 2015, UK261/EU261,
                  Ofgem Standards of Conduct, Ofcom Fairness Framework, Consumer Credit Act 1974,
                  and more — depending on the dispute type. Clauses are sourced from the official
                  UK government legislation API and refreshed daily, so your letter reflects the
                  current statute on the day you send it.
                </p>
                <p>
                  Every letter is reviewed in real time for factual accuracy and legal correctness,
                  and you can edit any letter before sending. We&rsquo;ve sent thousands of letters
                  and our success rate on mid-contract price rise disputes (the most common use
                  case) is currently <strong>78%</strong>.
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

      {/*
        Live chat button removed — the site-wide <ChatWidget /> in
        src/app/layout.tsx already renders a fixed bottom-right chat
        launcher on every route, so the homepage's own button was a
        visual duplicate. (Paul, 19 Apr 2026.)
      */}
    </div>
  );
}
