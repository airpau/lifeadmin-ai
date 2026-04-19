'use client';

/**
 * Homepage v2 preview — /preview/homepage
 *
 * This is PR 2 in the homepage redesign series. It ports the Claude
 * Design export at `docs/design-exports/homepage-v2/` into a single
 * Next.js client page so Paul can review the new look on a Vercel
 * preview URL before we touch the real `/` route.
 *
 * Everything lives under `.m-v2-root` so styles can't leak onto the
 * live homepage or the authenticated dashboard.
 *
 * Still to do in later PRs:
 *   PR 3 — draft FAQ + re-add Why We Exist / Pocket Agent showcase /
 *          AI Financial Assistant / Smart Subscription Tracking.
 *   PR 4 — wire the hero ticker, stats, and mini letter form to live
 *          Supabase data (agent_runs, profiles count, /api/agents/complaints).
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
  const revealContainerRef = useRef<HTMLDivElement | null>(null);

  // Nav shrinks slightly once scrolled > 20px.
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
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

  // Demo-only letter form handler. PR 4 will POST to /api/agents/complaints
  // with the real user input and open the draft in a new tab.
  const onDemoGenerate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (letterBusy) return;
    setLetterBusy(true);
    setLetterLabel('Drafting…');
    window.setTimeout(() => {
      setLetterLabel('✓ Letter ready — opening');
      window.setTimeout(() => {
        setLetterLabel('Generate letter →');
        setLetterBusy(false);
      }, 1800);
    }, 900);
  };

  const doubledTestimonials = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <div className="m-v2-root" ref={revealContainerRef}>
      <div className="preview-badge" aria-label="Preview page">
        Preview · Homepage v2
      </div>

      {/* Floating pill nav ------------------------------------------ */}
      <div className={`nav-shell${navScrolled ? ' scrolled' : ''}`} id="navShell">
        <nav className="nav-pill" aria-label="Primary">
          <a className="nav-logo" href="#">
            <span className="pay">Pay</span>
            <span className="backer">backer</span>
          </a>
          <div className="nav-links">
            <a href="#how">About</a>
            <a href="#pricing">Pricing</a>
            <a href="#deals">Deals</a>
            <a href="#">Blog</a>
            <a href="#">FAQ</a>
          </div>
          <div className="nav-cta-row">
            <a className="nav-signin" href="#">
              Sign in
            </a>
            <a className="nav-start" href="#">
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
                <a className="btn btn-mint" href="#">
                  Start free 14-day Pro trial →
                </a>
                <a className="btn btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
              <div className="hero-ticker">
                <span className="pulse" />
                {/* Members-aggregated figure — live wiring to Supabase lands in PR 4. */}
                <span>Saved for our members this month</span>
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
                  Virgin Media bill increased by <strong>£12</strong> this month — want me to draft
                  a dispute citing Ofcom&rsquo;s mid-contract price rise rules?
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
              Every £ we&rsquo;ve found
              <br />
              for real UK users.
            </h2>
            <p>
              No gamified streaks. No vague &ldquo;up to&rdquo; claims. These are live figures from
              Paybacker accounts in the last 90 days.
            </p>
          </div>
          <div className="stats-grid">
            <div className="stat-card reveal">
              <div className="label">Average potential savings</div>
              <div className="num">
                £8,029<span className="unit">/yr</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                Most came from forgotten subscriptions and quiet price hikes we flagged
                automatically — the kind nobody reads the email for.
              </div>
            </div>
            <div className="stat-card reveal">
              <div className="label">Subscriptions tracked</div>
              <div className="num">149</div>
              <div className="underline" />
              <div className="blurb">
                Across connected accounts. The median user has 11 they&rsquo;d forgotten about. The
                worst had 34 — including three streaming services with the same logo.
              </div>
            </div>
            <div className="stat-card reveal">
              <div className="label">Founding members</div>
              <div className="num">45</div>
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
                Your AI financial agent in Telegram. Ask anything, fix everything. &ldquo;Is my
                energy bill fair?&rdquo; &ldquo;Cancel my gym.&rdquo; Done.
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
                    On it — you&rsquo;ll save <strong>£432/yr</strong>.
                  </div>
                </div>
              </div>
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
              <form className="mini-form" onSubmit={onDemoGenerate}>
                <label>What&rsquo;s the issue?</label>
                <select defaultValue="Mid-contract price rise">
                  <option>Mid-contract price rise</option>
                  <option>Delayed or cancelled flight (UK261)</option>
                  <option>Faulty goods (CRA 2015)</option>
                  <option>Energy billing error (Ofgem)</option>
                </select>
                <label>Brief description</label>
                <input type="text" placeholder="My Virgin bill jumped £12 without warning…" />
                <button type="submit" disabled={letterBusy}>
                  {letterLabel}
                </button>
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
            <a className="btn btn-mint" href="#">
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
              <a className="btn btn-ghost cta" href="#" style={{ justifyContent: 'center' }}>
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
              <a className="btn btn-mint cta" href="#" style={{ justifyContent: 'center' }}>
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
              <a className="btn btn-ghost cta" href="#" style={{ justifyContent: 'center' }}>
                Go Pro →
              </a>
            </div>
          </div>
          <p className="compare-link">
            <a href="#">See the full feature comparison →</a>
          </p>
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
            <a className="btn btn-mint" href="#">
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
              <a href="#">Disputes Centre</a>
              <a href="#">Money Hub</a>
              <a href="#">Pocket Agent</a>
              <a href="#">Deals</a>
              <a href="#">Pricing</a>
            </div>
            <div className="footer-col">
              <h5>Company</h5>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Press</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Cookies</a>
              <a href="#">ICO notice</a>
              <a href="#">Complaints</a>
            </div>
            <div className="footer-col">
              <h5>Connect</h5>
              <div className="footer-socials" style={{ marginBottom: '14px' }}>
                <a href="#" aria-label="X">
                  𝕏
                </a>
                <a href="#" aria-label="Instagram">
                  ◎
                </a>
                <a href="#" aria-label="Facebook">
                  f
                </a>
                <a href="#" aria-label="TikTok">
                  ♪
                </a>
                <a href="#" aria-label="LinkedIn">
                  in
                </a>
              </div>
              <a href="#">hello@paybacker.co.uk</a>
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
