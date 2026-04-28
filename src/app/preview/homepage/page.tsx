'use client';

/**
 * Homepage v3 preview — /preview/homepage
 *
 * Dynamic homepage redesign ported from
 *   design_handoff_paybacker_homepage/index.html
 * with extra scroll-driven dynamism (intersection-observer reveals,
 * animated counters, scroll progress bar, 3D dashboard tilt, sticky
 * conversion CTA, marquee testimonials).
 *
 * Everything is wrapped in `.m-v2-root` so the scoped stylesheet at
 * `./styles.css` cannot leak onto `/`, the dashboard, or any other
 * surface. Once Paul approves this surface we cut /preview/homepage
 * over to `/`.
 *
 * Content rules (see redesign/CONTENT_SOURCES_OF_TRUTH.md):
 *   - No fabricated specific savings claims.
 *   - Member counts are forbidden.
 *   - Six named testimonials may appear ONLY on this surface.
 */

import Link from 'next/link';
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DisputesDemo,
  PocketAgentDemo,
  MoneyHubDemo,
  SubscriptionsDemo,
  ExportDemo,
  DealsDemo,
  McpDemo,
} from './demos';
import './styles.css';

// React.CSSProperties doesn't know about CSS custom properties.
type CSSVarProperties = CSSProperties & Record<`--${string}`, string | number>;

// ---------------------------------------------------------------------------
// Reveal — scroll-triggered fade/slide
// ---------------------------------------------------------------------------
type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?:
    | 'div'
    | 'section'
    | 'article'
    | 'header'
    | 'footer'
    | 'ul'
    | 'li'
    | 'span'
    | 'p'
    | 'h2'
    | 'h3';
};
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const classes = ['reveal', inView ? 'in' : '', className].filter(Boolean).join(' ');
  const style: CSSProperties | undefined = delay ? { transitionDelay: `${delay}ms` } : undefined;

  return createElement(Tag, { ref, className: classes, style }, children);
}

// ---------------------------------------------------------------------------
// Counter — animated count-up on scroll into view
// ---------------------------------------------------------------------------
type CounterProps = {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fractionDigits?: number;
};
function Counter({
  to,
  duration = 1400,
  prefix = '',
  suffix = '',
  fractionDigits = 0,
}: CounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || started.current) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setValue(to);
      started.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || started.current) return;
          started.current = true;
          io.unobserve(entry.target);
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 4);
            setValue(to * eased);
            if (t < 1) requestAnimationFrame(tick);
            else setValue(to);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [to, duration]);

  const formatted = value.toLocaleString('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Nav — pill nav with scroll-shrink + scroll-progress bar
// ---------------------------------------------------------------------------
function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setScrolled((prev) => {
        const next = y > 20;
        return next === prev ? prev : next;
      });
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, y / max));
      document.documentElement.style.setProperty('--m-v2-progress', progress.toFixed(4));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  // Close drawer on route change / anchor click / esc
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Tuples: [label, href]. An href starting with `/` is a page route
  // (rendered as a Next Link); anything else (e.g. `#how`) is an
  // in-page anchor (rendered as a plain `<a>` so the browser handles
  // the smooth-scroll). Both desktop nav + mobile drawer iterate this
  // array so adding a route here surfaces it in both surfaces at once.
  const navLinks: ReadonlyArray<readonly [string, string]> = [
    ['How it works', '#how'],
    ['Product', '#features'],
    ['Deals', '#deals'],
    ['Pricing', '#pricing'],
    ['Blog', '/blog'],
    ['For Business', '/for-business'],
  ];

  return (
    <>
      <div className={`nav-shell${scrolled ? ' scrolled' : ''}`}>
        <nav className="nav-pill" aria-label="Primary">
          <Link className="nav-logo" href="/">
            <span className="pay">Pay</span>
            <span className="backer">backer</span>
          </Link>
          <div className="nav-links">
            {navLinks.map(([label, href]) =>
              href.startsWith('/') ? (
                <Link key={href} href={href}>{label}</Link>
              ) : (
                <a key={href} href={href}>{label}</a>
              )
            )}
          </div>
          <div className="nav-cta-row">
            <Link className="nav-signin" href="/auth/login">
              Sign in
            </Link>
            <Link className="nav-start" href="/auth/signup">
              Start free
            </Link>
            <button
              type="button"
              className="nav-burger"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="m-v2-mob-menu"
              onClick={() => setMenuOpen(true)}
            >
              <span /><span /><span />
            </button>
          </div>
        </nav>
      </div>
      <div
        className="nav-progress"
        aria-hidden="true"
        style={{ ['--progress' as string]: 'var(--m-v2-progress, 0)' } as CSSVarProperties}
      />

      {/* Mobile drawer — full-screen sheet that covers the page while open. */}
      {menuOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <div id="m-v2-mob-menu" className="nav-drawer" role="dialog" aria-modal="true" aria-label="Site navigation">
            <div className="nav-drawer-head">
              <Link className="nav-logo" href="/" onClick={() => setMenuOpen(false)}>
                <span className="pay">Pay</span>
                <span className="backer">backer</span>
              </Link>
              <button
                type="button"
                className="nav-drawer-close"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="nav-drawer-links">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') ? (
                  <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>
                ) : (
                  <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
                )
              )}
            </div>
            <div className="nav-drawer-ctas">
              <Link className="btn btn-ghost" href="/auth/login" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link className="btn btn-mint" href="/auth/signup" onClick={() => setMenuOpen(false)}>
                Sign up free
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// HeroVisual — mini-card + dashboard card (3D tilt on mouse) + agent bubble.
// The live DisputesDemo lives inside its own feature section further down so
// it isn't repeated twice on the page.
// ---------------------------------------------------------------------------
function HeroVisual() {
  const dashRef = useRef<HTMLDivElement | null>(null);

  const onMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const el = dashRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const rotY = x * 6;
    const rotX = -y * 5;
    el.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(0)`;
  }, []);

  const onMouseLeave = useCallback(() => {
    const el = dashRef.current;
    if (!el) return;
    el.style.transform = '';
  }, []);

  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="mini-card float" style={{ animationDelay: '-2s' }}>
        <div className="label">Example savings snapshot</div>
        <div className="big">£1,000+</div>
        <div className="desc">typical yearly overcharge we find</div>
        <div className="mini-bar">
          <div className="bar"><span className="n">Broadband hike</span><span className="v">+£12/mo</span></div>
          <div className="bar"><span className="n">Energy standing</span><span className="v">+£28/mo</span></div>
          <div className="bar"><span className="n">Unused streaming</span><span className="v">+£7.99/mo</span></div>
          <div className="bar"><span className="n">Gym (inactive)</span><span className="v">+£34/mo</span></div>
        </div>
      </div>

      <div
        ref={dashRef}
        className="dash-card float tilt-host"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <div className="dash-header">
          <div className="title">Money Hub · this month</div>
          <div>●●●</div>
        </div>
        <div className="dash-body">
          <div>
            <div className="label">Spend tracked</div>
            <div className="big-num">
              £2,847
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.6em' }}>.12</span>
            </div>
            <div className="delta">↗ 3 hikes flagged this week</div>
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
                <span><span className="swatch" style={{ background: 'var(--accent-mint)' }} /><span className="name">Essentials</span></span>
                <span className="amt">£1,859</span>
              </div>
              <div className="row">
                <span><span className="swatch" style={{ background: 'var(--accent-orange)' }} /><span className="name">Subscriptions</span></span>
                <span className="amt">£1,174</span>
              </div>
              <div className="row">
                <span><span className="swatch" style={{ background: '#60A5FA' }} /><span className="name">Transport</span></span>
                <span className="amt">£782</span>
              </div>
              <div className="row">
                <span><span className="swatch" style={{ background: '#A78BFA' }} /><span className="name">Dining</span></span>
                <span className="amt">£588</span>
              </div>
              <div className="row">
                <span><span className="swatch" style={{ background: '#E5E7EB' }} /><span className="name">Other</span></span>
                <span className="amt">£489</span>
              </div>
            </div>
          </div>
          <div className="sub-list">
            <div className="row">
              <span className="name">Netflix Premium<span className="tag">Unused</span></span>
              <span className="amt">£17.99</span>
            </div>
            <div className="row">
              <span className="name">Virgin Media<span className="tag">Hike</span></span>
              <span className="amt">£49.00</span>
            </div>
            <div className="row">
              <span className="name">Gym membership<span className="tag">Inactive</span></span>
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
          Virgin Media bill increased by <strong>£12</strong> this month — want me to draft a dispute citing Ofcom&rsquo;s mid-contract price rise rules?
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroDemo — interactive issue picker with live citation preview
// ---------------------------------------------------------------------------
type Issue = { id: string; label: string; cite: string; placeholder: string };
const ISSUES: Issue[] = [
  {
    id: 'midcontract',
    label: 'Mid-contract price rise (broadband / mobile)',
    cite: 'Ofcom General Conditions C1 + Consumer Rights Act 2015 s.49',
    placeholder: 'My Virgin bill jumped £12 without warning…',
  },
  {
    id: 'uk261',
    label: 'Delayed or cancelled flight',
    cite: 'Regulation (EC) 261/2004 retained as UK261',
    placeholder: 'Easyjet to Malaga delayed 4h 20m on 14 Sept…',
  },
  {
    id: 'cra2015',
    label: 'Faulty goods or service',
    cite: 'Consumer Rights Act 2015 s.9, s.49 & s.20',
    placeholder: 'Sofa arrived with frame split, retailer refusing…',
  },
  {
    id: 'ofgem',
    label: 'Energy billing error',
    cite: 'Ofgem Standard Licence Conditions 21B & 31A',
    placeholder: 'British Gas estimated bill is £180 over my actual usage…',
  },
];

type DemoStatus = 'idle' | 'drafting' | 'ready';

function HeroDemo() {
  const [issueId, setIssueId] = useState<string>(ISSUES[0].id);
  const [desc, setDesc] = useState<string>('');
  const [status, setStatus] = useState<DemoStatus>('idle');

  const issue = useMemo(() => ISSUES.find((i) => i.id === issueId) ?? ISSUES[0], [issueId]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'idle') return;
    setStatus('drafting');
    window.setTimeout(() => setStatus('ready'), 900);
  };

  // When the demo has a drafted letter, we stash the intent in
  // sessionStorage + pass it via query param so the signup flow
  // can carry it into /dashboard/complaints?new=1 with the form
  // already pre-filled. User signs up → lands inside the dispute
  // composer → their free-tier 3-letters-a-month allowance now
  // funds this letter for real. No quota is decremented at the
  // preview stage because nothing was generated server-side.
  const signupHref = useMemo(() => {
    const params = new URLSearchParams({
      from: 'homepage_demo',
      type: issueId,
      issue: desc || issue.placeholder,
    });
    return `/auth/signup?${params.toString()}`;
  }, [issueId, desc, issue.placeholder]);

  const handleOpenFullDraft = () => {
    // Persist across the signup round-trip so the composer can
    // pre-fill even if the user lands back via email confirmation.
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          'pb_homepage_letter_intent',
          JSON.stringify({ type: issueId, issue: desc || issue.placeholder, cite: issue.cite }),
        );
      } catch {}
    }
  };

  return (
    <form className="mini-form" onSubmit={handleSubmit}>
      <label htmlFor="hero-demo-issue">What&rsquo;s the issue?</label>
      <select
        id="hero-demo-issue"
        value={issueId}
        onChange={(e) => {
          setIssueId(e.target.value);
          setStatus('idle');
        }}
      >
        {ISSUES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="hero-demo-desc">Brief description</label>
      <input
        id="hero-demo-desc"
        type="text"
        placeholder={issue.placeholder}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-on-ink-dim)',
          marginTop: '10px',
        }}
      >
        We&rsquo;ll cite: <span style={{ color: 'var(--accent-mint)' }}>{issue.cite}</span>
      </div>

      {status !== 'ready' && (
        <button type="submit" disabled={status === 'drafting'}>
          {status === 'idle' && 'Generate letter →'}
          {status === 'drafting' && 'Drafting…'}
        </button>
      )}

      {status === 'ready' && (
        <>
          <div
            style={{
              marginTop: '14px',
              padding: '16px 18px',
              borderRadius: '12px',
              background: 'rgba(52, 211, 153, 0.08)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              fontSize: '12.5px',
              lineHeight: 1.6,
              color: 'var(--text-on-ink-dim)',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--accent-mint)',
                marginBottom: 8,
              }}
            >
              ✓ Letter ready · preview
            </div>
            <p style={{ margin: 0, color: 'var(--text-on-ink)' }}>
              <strong>Dear Sir/Madam,</strong>
            </p>
            <p style={{ margin: '8px 0 0' }}>
              I am writing to formally dispute{' '}
              {desc
                ? `the following issue: "${desc}"`
                : 'the matter described below'}
              . Under{' '}
              <span style={{ color: 'var(--accent-mint)', fontWeight: 600 }}>{issue.cite}</span>,
              you are required to…
            </p>
            <p style={{ margin: '8px 0 0', fontStyle: 'italic', opacity: 0.7 }}>
              [… the rest of the letter, including the specific remedy we&rsquo;re
              asking for and the statutory deadline for their response, is only
              shown once you sign up for a free account.]
            </p>
          </div>

          <Link
            href={signupHref}
            onClick={handleOpenFullDraft}
            style={{ display: 'block', marginTop: 10, textDecoration: 'none' }}
          >
            <span
              style={{
                display: 'block',
                width: '100%',
                padding: 12,
                background: 'var(--accent-mint)',
                color: '#052E1C',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              Sign up free to open the full draft →
            </span>
          </Link>

          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              textAlign: 'center',
              color: 'var(--text-on-ink-dim)',
            }}
          >
            No card. Free tier gets 3 letters / month — this one is on us.
          </div>

          <button
            type="button"
            onClick={() => setStatus('idle')}
            style={{
              marginTop: 4,
              background: 'transparent',
              border: 0,
              color: 'var(--text-on-ink-dim)',
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              padding: 6,
            }}
          >
            Try another issue
          </button>
        </>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Testimonials — marquee, doubled for seamless loop
// ---------------------------------------------------------------------------
const TESTIMONIALS = [
  {
    name: 'Paul R.',
    meta: 'Homeowner · Bristol',
    quote:
      "Found nearly a grand of forgotten subs in five minutes. The Virgin dispute letter cut my bill back to the original contract rate — first try.",
    saved: 'Saved £1,240 over the year',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'Aisha K.',
    meta: 'Freelancer · Manchester',
    quote:
      "I thought I was on top of my subs. Paybacker found six I'd completely forgotten about, including two gym memberships.",
    saved: 'Saved £392',
    color: 'var(--accent-orange-deep)',
  },
  {
    name: 'Dan M.',
    meta: 'Commuter · London',
    quote:
      "The Ofcom letter took 30 seconds. EE cancelled the mid-contract rise without a phone call. Still can't quite believe it.",
    saved: 'Saved £168',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'Sarah J.',
    meta: 'Student · Edinburgh',
    quote:
      "Pocket Agent in Telegram is the bit I didn't expect to love. I just ask if things are fair and it tells me.",
    saved: 'Saved £284',
    color: 'var(--accent-orange-deep)',
  },
  {
    name: 'Rita N.',
    meta: 'Teacher · Leeds',
    quote:
      "Paybacker caught a £41/month energy hike British Gas quietly slipped in. The dispute paid for a year of Pro in one letter.",
    saved: 'Saved £492',
    color: 'var(--accent-mint-deep)',
  },
  {
    name: 'Tom B.',
    meta: 'New parent · Cardiff',
    quote:
      "Tiny baby, no time to read bills. Paybacker does it for us. The broadband switch alone saved us £400 a year.",
    saved: 'Saved £638',
    color: 'var(--accent-orange-deep)',
  },
];

function Testimonials() {
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          node.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
        });
      },
      { threshold: 0.05 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const doubled = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <div className="t-track" ref={trackRef}>
      {doubled.map((t, i) => (
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
          <div className="quote">&ldquo;{t.quote}&rdquo;</div>
          <div className="saved">{t.saved}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StickyCTA — appears past the hero, hides before the final CTA
// ---------------------------------------------------------------------------
function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      // Never show on mobile — fixed pill overlaps demo content on small screens.
      if (window.innerWidth <= 768) { setVisible(false); return; }
      const y = window.scrollY;
      const finalCta = document.querySelector('.m-v2-root .final-cta');
      const finalTop = finalCta
        ? finalCta.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      const past = y > 720;
      const beforeFinal = y + window.innerHeight < finalTop + 200;
      setVisible(past && beforeFinal);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={`sticky-cta mobile-hidden${visible ? ' shown' : ''}`} aria-hidden={!visible}>
      <span>Find your overcharges in 30s — no card, no catch.</span>
      <Link href="/auth/signup">Start free →</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HomepageV3PreviewPage() {
  return (
    <div className="m-v2-root">
      <Nav />

      {/* ========== Hero ========== */}
      <section
        className="hero glow-wrap section-light"
        style={{ ['--glow-opacity' as string]: '0.22' } as CSSVarProperties}
      >
        <div className="trust-bar">
          ICO registered <span className="dot">·</span>
          FCA-authorised via Yapily <span className="dot">·</span>
          GDPR compliant <span className="dot">·</span>
          UK company · Paybacker LTD
        </div>

        <div className="wrap">
          <div className="hero-grid">
            <Reveal className="hero-copy">
              <span className="eyebrow">Free forever tier · No card required</span>
              <h1>
                <span className="l1">Find the £1,000+</span>
                <span className="l2">you&rsquo;re overpaying.</span>
                <span className="l3">Get your money back.</span>
              </h1>
              <p className="hero-sub">
                Paybacker scans your bank and email to spot overcharges, forgotten
                subscriptions, and unfair bills — then writes professional complaint
                letters citing UK law in 30 seconds.
              </p>
              <div className="hero-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  Start free — 3 AI letters included →
                </Link>
                <a className="btn btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
              <div className="hero-ticker">
                <span className="pulse" />
                <span>
                  UK households are typically overcharged{' '}
                  <strong>£1,000+ a year</strong> — we find it.
                </span>
              </div>
            </Reveal>

            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Trust strip removed — same credentials already appear in the
          compact `.trust-bar` above the hero so the lower block was
          pure duplication pushing real content further down. */}

      {/* ========== Stats (mint wash) ========== */}
      <section className="stats-section section-mint" id="stats">
        <div className="wrap">
          <Reveal className="section-head">
            <span className="eyebrow">Why Paybacker exists</span>
            <h2>
              Every British household is leaking money.
              <br />
              Paybacker plugs the leaks.
            </h2>
            <p>
              No gamified streaks. No vague &ldquo;up to&rdquo; claims. These are the
              sector benchmarks we&rsquo;re built around — grounded in UK consumer
              protection law.
            </p>
          </Reveal>

          <div className="stats-grid">
            <Reveal className="stat-card" delay={0}>
              <div className="label">Typical household overcharge</div>
              <div className="num">
                <Counter to={1000} prefix="£" suffix="+" /> <span className="unit">/yr</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                Most of it hides in price hikes, forgotten subs, and standing charges
                nobody reads. Paybacker surfaces it in one scan.
              </div>
            </Reveal>

            <Reveal className="stat-card" delay={80}>
              <div className="label">Draft a UK-law complaint in</div>
              <div className="num">
                <Counter to={30} /> <span className="unit">seconds</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                AI cites the exact statute — Consumer Rights Act 2015 s.49, UK261,
                Ofcom and Ofgem rules — and formats it like a solicitor&rsquo;s
                letter.
              </div>
            </Reveal>

            <Reveal className="stat-card" delay={160}>
              <div className="label">Of your refund you keep</div>
              <div className="num">
                <Counter to={100} />
                <span className="unit">%</span>
              </div>
              <div className="underline" />
              <div className="blurb">
                Paybacker takes 0% of your refund. Competitors take 15–30% of what
                you recover — we just charge a flat monthly subscription, so every
                £ you get back stays yours.
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ========== Regulated trust band ==========
          Honest, in-house SVG badges — no scraped brand marks, no
          licensing risk. Each one reflects a credential we can
          document: FCA-authorised bank sync (via Yapily), ICO
          registration (we hold one), UK-based Open Banking (the
          network we operate on), and GDPR compliance. Sits between
          stats and features so the trust signal lands before the
          product pitch. */}
      <section className="trust-band section-light" aria-label="Regulated and compliant">
        <div className="wrap">
          <div className="trust-band__grid">
            {/* FCA — shield with tick */}
            <div className="trust-badge">
              <svg className="trust-badge__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M32 4 L56 12 V32 C56 46 45 56 32 60 C19 56 8 46 8 32 V12 Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                <path d="M21 32 L29 40 L44 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div className="trust-badge__title">FCA-authorised</div>
                <div className="trust-badge__sub">Bank sync via Yapily — regulated by the FCA</div>
              </div>
            </div>

            {/* ICO — document with seal */}
            <div className="trust-badge">
              <svg className="trust-badge__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M16 6 H40 L52 18 V58 H16 Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                <path d="M40 6 V18 H52" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="34" cy="40" r="8" stroke="currentColor" strokeWidth="2.5" />
                <path d="M34 40 L34 48 L30 52 M34 48 L38 52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div className="trust-badge__title">ICO-registered</div>
                <div className="trust-badge__sub">UK Information Commissioner&rsquo;s Office</div>
              </div>
            </div>

            {/* Open Banking — stylised OB mark */}
            <div className="trust-badge">
              <svg className="trust-badge__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="2.5" />
                <path d="M32 18 V32 L42 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="32" cy="32" r="3" fill="currentColor" />
              </svg>
              <div>
                <div className="trust-badge__title">Open Banking</div>
                <div className="trust-badge__sub">Read-only access, never stored longer than needed</div>
              </div>
            </div>

            {/* GDPR — EU star circle */}
            <div className="trust-badge">
              <svg className="trust-badge__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="2.5" />
                {Array.from({ length: 8 }).map((_, i) => {
                  const angle = (i * 360) / 8;
                  return (
                    <circle
                      key={i}
                      cx={32 + 14 * Math.cos((angle * Math.PI) / 180 - Math.PI / 2)}
                      cy={32 + 14 * Math.sin((angle * Math.PI) / 180 - Math.PI / 2)}
                      r="2"
                      fill="currentColor"
                    />
                  );
                })}
              </svg>
              <div>
                <div className="trust-badge__title">GDPR-compliant</div>
                <div className="trust-badge__sub">Export or delete your data in one click</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== Real win — OneStream broadband ========== */}
      {/* Real Paybacker case used here as social-proof + ROI proof
          point. Sits after the trust band so credentials → real proof
          → product features in the homepage flow. Don't claim the
          dispute is settled — frame as "what was offered vs what UK
          law entitles you to" and let the gap speak for itself. */}
      <section className="real-win section-mint" id="real-win" aria-label="Real Paybacker case — broadband outage compensation">
        <div className="wrap">
          <Reveal className="section-head section-head--center">
            <span className="eyebrow">A real Paybacker win — this week</span>
            <h2>
              Their offer: £106.96.
              <br />
              <span style={{ color: 'var(--accent-orange-deep)' }}>What the law actually said: £505.46.</span>
            </h2>
            <p>
              Two flats. 35 days and 17 days without broadband. The provider offered
              roughly 1.5 months&rsquo; rental as &ldquo;goodwill&rdquo;. Paybacker
              cited the Ofcom Voluntary Automatic Compensation Scheme — £10.07 per
              calendar day from day three of an outage — plus £31.19 per missed
              engineer appointment. The gap is £398.50.
            </p>
          </Reveal>

          <div className="real-win__grid">
            <Reveal className="real-win__card real-win__card--lose">
              <div className="real-win__label">What the supplier offered</div>
              <div className="real-win__amount">£106.96</div>
              <ul className="real-win__list">
                <li>1 month rental on Flat 2 — £38.65</li>
                <li>1.5 months rental on Flat 1 — £68.31</li>
                <li>Framed as &ldquo;goodwill&rdquo;, not entitlement</li>
                <li>No mention of Ofcom Auto-Comp Scheme</li>
                <li>No allowance for missed engineer visits</li>
              </ul>
              <div className="real-win__caption">What most people would just accept.</div>
            </Reveal>

            <div className="real-win__arrow" aria-hidden="true">
              <svg viewBox="0 0 64 24" fill="none">
                <path d="M2 12 H56 M48 4 L60 12 L48 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <Reveal className="real-win__card real-win__card--win">
              <div className="real-win__label">What UK law actually says</div>
              <div className="real-win__amount">£505.46</div>
              <ul className="real-win__list">
                <li>£312.17 — Auto-Comp on Flat 1 (31 days × £10.07)</li>
                <li>£130.91 — Auto-Comp on Flat 2 (13 days × £10.07)</li>
                <li>£62.38 — 2 missed engineer appointments × £31.19</li>
                <li>Plus journey costs &amp; tenant losses on top</li>
                <li>Cited from Ofcom GC C3.13, CRA 2015 s.49 + s.62</li>
              </ul>
              <div className="real-win__caption">What Paybacker&rsquo;s letter demanded — in 30 seconds.</div>
            </Reveal>
          </div>

          <Reveal className="real-win__roi">
            <div className="real-win__roi-headline">
              <span className="real-win__roi-multiple">~4&times;</span>
              <span>your annual Pro subscription, recovered on a single dispute.</span>
            </div>
            <p className="real-win__roi-detail">
              Pro is £99.99/year. The gap on this one case alone (£398.50) is almost
              4× the cost of a year&rsquo;s Pro membership — recovered from one outage,
              one letter, one click.
            </p>
            <div className="real-win__equivalents">
              <div className="real-win__equivalents-label">£398 is about:</div>
              <ul>
                <li>🏖️ A long weekend in Lisbon</li>
                <li>☕ 250 flat whites at your local</li>
                <li>📡 A whole year of average UK broadband</li>
                <li>🎬 80 cinema tickets</li>
                <li>🏋️ A year of Pure Gym</li>
                <li>🛒 6 weeks of family food shopping</li>
              </ul>
            </div>
          </Reveal>

          <Reveal className="real-win__footnote">
            Real Paybacker case. Provider name and figures from the actual provider
            email, dated 28 April 2026. Compensation rates published by Ofcom and
            effective from 1 April 2026. Final settlement may differ — Paybacker
            cites the law and tracks the case through the provider&rsquo;s formal
            complaint process and Ombudsman Services if needed.
          </Reveal>
        </div>
      </section>

      {/* ========== Features intro ========== */}
      <section className="features-intro section-light" id="features">
        <div className="wrap">
          <Reveal className="section-head section-head--center">
            <span className="eyebrow">What&rsquo;s in the box</span>
            <h2>
              Seven tools. One subscription.
              <br />
              Every £ you overpay — found, disputed, cancelled.
            </h2>
            <p>
              Most UK households are overcharged by £1,000+ a year. Paybacker
              finds it, disputes it, and cancels it — in minutes, not hours on
              hold.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ----- 01 · AI Disputes Centre (copy + demo merged) ----- */}
      <section className="feature-section section-light" id="disputes">
        <div className="wrap">
          <div className="feature-grid">
            <Reveal className="feature-copy">
              <h2 className="feature-title">AI Disputes Centre</h2>
              <p className="feature-tagline">
                Draft a UK-law-cited complaint in 30 seconds.
              </p>
              <p>
                Type one sentence — Paybacker writes the formal letter, cites
                the exact regulation, and sends it on your behalf.
              </p>
              <ul className="feature-bullets">
                <li>Consumer Rights Act 2015, Ofcom, Ofgem, UK261, DVSA, HMRC</li>
                <li>Energy, broadband, parking, flight delays, council tax</li>
                <li>3 free letters / month. Unlimited on Essential and Pro.</li>
              </ul>
              <div className="feature-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  Try it free →
                </Link>
              </div>
            </Reveal>
            <Reveal className="feature-stage" delay={120}>
              <DisputesDemo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----- 02 · Pocket Agent (dark; copy above demo) ----- */}
      <section className="feature-section feature-section--ink" id="pocket-agent">
        <div className="wrap">
          <div className="feature-grid">
            <Reveal className="feature-copy">
              <h2 className="feature-title">Pocket Agent</h2>
              <p className="feature-tagline">
                Your AI money agent, in Telegram.
              </p>
              <p>
                Ask anything. Fix anything. &ldquo;Is my energy bill fair?&rdquo;
                &ldquo;Cancel my gym.&rdquo; &ldquo;Dispute my parking ticket.&rdquo;
                Done — from your phone.
              </p>
              <ul className="feature-bullets">
                <li>Reads your transactions, emails and contracts securely</li>
                <li>Acts for you: drafts letters, queues cancellations</li>
                <li>Telegram today · WhatsApp &amp; SMS on the roadmap</li>
              </ul>
              <div className="feature-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  Connect Telegram →
                </Link>
              </div>
            </Reveal>
            <Reveal className="feature-stage" delay={120}>
              <PocketAgentDemo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----- 03 · Money Hub ----- */}
      <section className="feature-section section-light" id="money-hub">
        <div className="wrap">
          <div className="feature-grid">
            <Reveal className="feature-copy">
              <h2 className="feature-title">Money Hub</h2>
              <p className="feature-tagline">
                Every account, every bill, every trend — in one view.
              </p>
              <p>
                Connect your bank via Open Banking (Yapily, FCA-authorised).
                Read-only, bank-grade, never stored longer than needed.
              </p>
              <ul className="feature-bullets">
                <li>Transactions auto-categorised across 20+ spend buckets</li>
                <li>Budgets, savings goals, income tracking, net worth</li>
                <li>Daily sync on Essential. Unlimited accounts on Pro.</li>
              </ul>
              <div className="feature-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  Connect your bank →
                </Link>
              </div>
            </Reveal>
            <Reveal className="feature-stage" delay={120}>
              <MoneyHubDemo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----- 04 · Subscriptions tracker (alt bg; copy above demo) ----- */}
      <section
        className="feature-section feature-section--alt"
        id="subscriptions"
      >
        <div className="wrap">
          <div className="feature-grid">
            <Reveal className="feature-copy">
              <h2 className="feature-title">Subscriptions Tracker</h2>
              <p className="feature-tagline">
                Every fixed outgoing — surfaced, sorted, cancelled with one tap.
              </p>
              <p>
                Auto-detects every subscription, direct debit and recurring
                charge. Flags price rises, duplicates, and forgotten trials.
                When you&apos;re ready to walk away, we draft the letter, address
                it to the right team, and track their reply in Disputes for you.
              </p>
              <ul className="feature-bullets">
                <li>One-tap cancellation — letter drafted with UK consumer law, pre-addressed to the provider&apos;s cancellation team</li>
                <li>Auto-reply tracking — Watchdog picks up the provider&apos;s response from your inbox and progresses the dispute without you chasing</li>
                <li>Renewal reminders 30, 14 and 7 days before charge</li>
                <li>Contract end-date tracking for broadband, energy &amp; mobile</li>
              </ul>
              <div className="feature-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  See every subscription →
                </Link>
              </div>
            </Reveal>
            <Reveal className="feature-stage" delay={120}>
              <SubscriptionsDemo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----- 05 · Export hub ----- */}
      <section className="feature-section section-light" id="export">
        <div className="wrap">
          <div className="feature-grid">
            <Reveal className="feature-copy">
              <h2 className="feature-title">Export Hub</h2>
              <p className="feature-tagline">
                Live-sync to Google Sheets. Or one-shot CSV, Excel, PDF.
              </p>
              <p>
                Your money is your data. Export it anywhere — including live
                spreadsheets that update as your bank moves.
              </p>
              <ul className="feature-bullets">
                <li>Google Sheets live sync (bi-directional)</li>
                <li>CSV, Excel and PDF statements by month or category</li>
                <li>Accountant-ready annual exports for self-assessment</li>
              </ul>
              <div className="feature-cta-row">
                <Link className="btn btn-mint" href="/auth/signup">
                  Export your money →
                </Link>
              </div>
            </Reveal>
            <Reveal className="feature-stage" delay={120}>
              <ExportDemo />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ========== Architecture + Competitor comparison (dark) ========== */}
      <section className="compare-section section-ink" id="compare">
        <div className="wrap">
          <Reveal className="section-head section-head--center">
            <span className="eyebrow on-ink">Stacked</span>
            <h2>Architecture + competitor comparison</h2>
            <p>How Paybacker beats every single incumbent.</p>
          </Reveal>

          {/* 3-panel architecture diagram */}
          <Reveal className="arch-grid">
            <div className="arch-col arch-col--inputs">
              <div className="arch-label arch-label--orange">Inputs</div>
              <ul className="arch-list">
                <li>UK banks via Yapily</li>
                <li>Gmail / Outlook inbox scan</li>
                <li>Manual subscription add</li>
                <li>Telegram commands</li>
                <li>Dispute form (web or chat)</li>
              </ul>
            </div>

            <div className="arch-col arch-col--core">
              <div className="arch-core-card">
                <div className="arch-label arch-label--mint arch-label--center">
                  Paybacker Core
                </div>
                <ul className="arch-list arch-list--bold">
                  <li>
                    <strong>Unified ledger</strong>
                    <span>every txn, contract, hike</span>
                  </li>
                  <li>
                    <strong>Classifier</strong>
                    <span>Money Hub categorisation</span>
                  </li>
                  <li>
                    <strong>Flag engine</strong>
                    <span>hikes, duplicates, trials</span>
                  </li>
                  <li>
                    <strong>Law library</strong>
                    <span>CRA, Ofcom, Ofgem, UK261, FCA</span>
                  </li>
                  <li>
                    <strong>Deals graph</strong>
                    <span>53+ UK partners</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="arch-col arch-col--outputs">
              <div className="arch-label arch-label--mint">Outputs</div>
              <ul className="arch-list">
                <li>Web app — Money Hub + Disputes</li>
                <li>Telegram Pocket Agent</li>
                <li>Complaint letters (copy/email/PDF)</li>
                <li>Google Sheets live sync</li>
                <li>Deep-links to cancel / switch</li>
              </ul>
            </div>
          </Reveal>

          {/* Competitor matrix — dark theme, PAYBACKER last */}
          <Reveal className="compare-table-wrap compare-table-wrap--dark">
            <table className="compare-table compare-table--dark">
              <thead>
                <tr>
                  <th className="feature">Feature</th>
                  <th>Emma</th>
                  <th>Snoop</th>
                  <th>Lunchflow</th>
                  <th>Resolver</th>
                  <th>Which?</th>
                  <th className="us">Paybacker</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Bank sync (Open Banking)</td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td className="us"><span className="chk">✓</span></td>
                </tr>
                <tr>
                  <td>Subscription flagging (hike/dup/unused)</td>
                  <td>Basic</td>
                  <td>Basic</td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td className="us">Full</td>
                </tr>
                <tr>
                  <td>Legal-grade dispute letters</td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td>Templates</td>
                  <td>Guide</td>
                  <td className="us">AI + law</td>
                </tr>
                <tr>
                  <td>UK consumer law library cited</td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td>Partial</td>
                  <td>Partial</td>
                  <td className="us">5+ statutes</td>
                </tr>
                <tr>
                  <td>Telegram / chat agent</td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td className="us"><span className="chk">✓</span></td>
                </tr>
                <tr>
                  <td>Live Google Sheets export</td>
                  <td>CSV only</td>
                  <td><span className="x">—</span></td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td className="us">✓ two-way</td>
                </tr>
                <tr>
                  <td>Switch-deals that beat your bill</td>
                  <td>Generic ads</td>
                  <td>Generic</td>
                  <td><span className="x">—</span></td>
                  <td><span className="x">—</span></td>
                  <td>Guide only</td>
                  <td className="us">Personalised</td>
                </tr>
                <tr>
                  <td>User in control (no auto-sent emails)</td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="chk">✓</span></td>
                  <td><span className="chk">✓</span></td>
                  <td>Semi</td>
                  <td><span className="chk">✓</span></td>
                  <td className="us"><span className="chk">✓</span></td>
                </tr>
              </tbody>
            </table>
          </Reveal>

          <p className="compare-footnote compare-footnote--ink">
            Based on publicly listed features as of April 2026. Spot something
            we&rsquo;ve missed? Email{' '}
            <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
          </p>
        </div>
      </section>

      {/* ========== How it works (dark) ========== */}
      <section className="how-section section-ink" id="how">
        <div className="wrap">
          <Reveal className="section-head">
            <span className="eyebrow on-ink">How it works</span>
            <h2>
              Three steps. Ten minutes.
              <br />
              Usually four-figure savings.
            </h2>
            <p className="sub">
              You don&rsquo;t have to connect anything to see it work. Try the
              Disputes Centre for free — no account needed.
            </p>
          </Reveal>

          <div className="how-steps">
            <Reveal className="how-step" delay={0}>
              <div className="num">01</div>
              <h3>Describe your dispute, get a formal letter in 30 seconds.</h3>
              <p>
                Pick the category, type a sentence. We cite the law, you send the
                letter.
              </p>
              <HeroDemo />
            </Reveal>

            <Reveal className="how-step" delay={80}>
              <div className="num">02</div>
              <h3>Connect your bank and email to find hidden costs.</h3>
              <p>Open Banking via Yapily. Read-only. Never stored longer than needed.</p>
              <div className="bank-list">
                <div className="bank-row"><span className="n">Monzo · main</span><span className="v">Connected</span></div>
                <div className="bank-row"><span className="n">Barclays · joint</span><span className="v">Connected</span></div>
                <div className="bank-row"><span className="n">Chase · savings</span><span className="v">Connected</span></div>
                <div className="bank-row"><span className="n">Gmail · inbox scan</span><span className="v orange">3 hikes</span></div>
                <div className="bank-row"><span className="n">Outlook · work</span><span className="v orange">1 duplicate</span></div>
              </div>
            </Reveal>

            <Reveal className="how-step" delay={160}>
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
            </Reveal>
          </div>

          <div className="how-cta-row">
            <Link className="btn btn-mint" href="/auth/signup">
              Try it free — no account needed
            </Link>
          </div>
        </div>
      </section>

      {/* ========== Deals ========== */}
      <section className="deals-section section-mint" id="deals">
        <div className="wrap">
          <Reveal className="section-head section-head--center">
            <span className="eyebrow">53+ verified UK partners</span>
            <h2 style={{ margin: '12px 0' }}>
              Real prices. Real savings.
              <br />
              Better deals in every category.
            </h2>
          </Reveal>

          <div className="logo-cloud">
            {['BT', 'Sky', 'Virgin', 'EE', 'E.ON', 'EDF', 'OVO', 'Vodafone', 'Three', 'O2', 'giffgaff', 'Plusnet', 'RAC', 'Habito', '+40 more'].map((l) => (
              <span className="logo-chip" key={l}>{l}</span>
            ))}
          </div>

          <Reveal className="demo-block">
            <div className="demo-slot">
              <DealsDemo />
            </div>
          </Reveal>

          <p className="commission-note">
            We earn a commission if you switch — you pay nothing extra, and we stay
            free to use.
          </p>
        </div>
      </section>

      {/* ========== Pricing ========== */}
      <section className="pricing-section section-light" id="pricing">
        <div className="wrap">
          <Reveal className="section-head section-head--center">
            <span className="eyebrow">Founding member pricing</span>
            <h2 style={{ margin: '12px 0' }}>
              Start free. Upgrade only when we&rsquo;ve
              <br />
              found you money.
            </h2>
          </Reveal>

          <div className="pricing-grid">
            <Reveal className="price-card" delay={0}>
              <div className="tier">Free</div>
              <div className="price">£0<span className="per">/forever</span></div>
              <div className="founding" style={{ visibility: 'hidden' }}>—</div>
              <ul>
                <li>3 AI dispute letters / month</li>
                <li>2 bank accounts · daily auto-sync</li>
                <li>1 email inbox · Watchdog reply monitoring</li>
                <li>Unlimited subscription tracker</li>
                <li>Pocket Agent + AI chatbot</li>
              </ul>
              <Link className="btn btn-ghost cta" href="/auth/signup" style={{ justifyContent: 'center' }}>
                Start free →
              </Link>
            </Reveal>

            <Reveal className="price-card featured" delay={80}>
              <span className="ribbon">Most popular</span>
              <div className="tier">Essential</div>
              <div className="price">£4.99<span className="per">/month</span></div>
              <div className="founding">or £44.99/yr · Founding rate locked-in</div>
              <ul>
                <li>Unlimited AI dispute letters</li>
                <li>3 bank accounts · daily auto-sync</li>
                <li>3 email inboxes · Watchdog reply monitoring</li>
                <li>AI cancellation emails + renewal reminders</li>
                <li>Full spending intelligence + budgets</li>
                <li>Price-increase alerts by email</li>
              </ul>
              <Link className="btn btn-mint cta" href="/auth/signup" style={{ justifyContent: 'center' }}>
                Get Essential →
              </Link>
            </Reveal>

            <Reveal className="price-card" delay={160}>
              <div className="tier">Pro</div>
              <div className="price">£9.99<span className="per">/month</span></div>
              <div className="founding">or £94.99/yr · Founding rate locked-in</div>
              <ul>
                <li>Everything in Essential</li>
                <li>Unlimited bank &amp; email connections</li>
                <li>Price-increase alerts via Telegram (instant)</li>
                <li>Money Hub top merchants + transaction analysis</li>
                <li>Paybacker MCP (Claude Desktop)</li>
                <li>CSV / PDF export · priority support</li>
              </ul>
              <Link className="btn btn-ghost cta" href="/auth/signup" style={{ justifyContent: 'center' }}>
                Go Pro →
              </Link>
            </Reveal>
          </div>

          <p className="compare-link">
            <Link href="/pricing">See the full feature comparison →</Link>
          </p>
        </div>
      </section>

      {/* ========== Testimonials ========== */}
      <section className="testimonials-section section-light" id="testimonials">
        <Reveal className="testimonials-head">
          <span className="eyebrow">Honest words from real users</span>
          <h2>
            What the money
            <br />
            we found meant for them.
          </h2>
        </Reveal>
        <Testimonials />
      </section>

      {/* ========== Developer · MCP ========== */}
      <section className="mcp-section section-ink" id="mcp">
        <div className="wrap">
          <Reveal className="section-head">
            <span className="pill-pro">Pro plan</span>
            <span className="eyebrow on-ink">Developer · MCP</span>
            <h2>
              Talk to your money
              <br />
              from Claude Desktop.
            </h2>
            <p className="sub">
              The Paybacker MCP server gives Claude direct read-only access to your
              transactions, hikes, and savings opportunities. Available on Pro.
            </p>
          </Reveal>

          <Reveal className="demo-block">
            <div className="demo-slot demo-slot--dark">
              <McpDemo />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ========== Final CTA (dark) ========== */}
      <section
        className="final-cta section-ink glow-wrap"
        style={{ ['--glow-opacity' as string]: '0.14' } as CSSVarProperties}
      >
        <div className="wrap">
          <Reveal>
            <h2>
              Stop overpaying.
              <br />
              Start <span className="mint">fighting</span> back.
            </h2>
          </Reveal>
          <Reveal as="p" className="fc-sub">
            Most UK households are overcharged by £1,000+ a year. We find it, dispute
            it, and cancel it — in minutes.
          </Reveal>
          <Reveal className="fc-btn-row">
            <Link className="btn btn-mint" href="/auth/signup">
              Find my money — free →
            </Link>
          </Reveal>
          <p className="fine">No card. Cancel anytime. Your data stays in the UK.</p>
        </div>
      </section>

      {/* ========== Footer ========== */}
      <footer>
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="logo">
                <span>Pay</span>
                <span className="backer">backer</span>
              </div>
              <p>
                The UK&rsquo;s AI money-back engine. We find what you&rsquo;re losing
                and fight to get it back.
              </p>
              <p
                style={{
                  marginTop: '14px',
                  fontSize: '11px',
                  color: 'var(--text-on-ink-dim)',
                  maxWidth: '320px',
                }}
              >
                AI-generated letters are for guidance only and do not constitute legal
                advice. For complex disputes, always consult a qualified solicitor.
              </p>
            </div>
            <div className="footer-col">
              <h5>Product</h5>
              <a href="#features">Disputes Centre</a>
              <a href="#features">Money Hub</a>
              <a href="#features">Pocket Agent</a>
              <a href="#deals">Deals</a>
              <Link href="/templates">Letter templates</Link>
              <Link href="/pricing">Pricing</Link>
            </div>
            <div className="footer-col">
              <h5>Company</h5>
              <Link href="/about">About</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/careers">Careers</Link>
              <a href="mailto:hello@paybacker.co.uk">Contact</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <Link href="/privacy-policy">Privacy</Link>
              <Link href="/terms-of-service">Terms</Link>
              <Link href="/cookie-policy">Cookies</Link>
              <Link href="/ico-notice">ICO notice</Link>
            </div>
            <div className="footer-col">
              <h5>Connect</h5>
              <div className="footer-socials" style={{ marginBottom: '14px' }}>
                <a href="https://x.com/PaybackerUK" aria-label="X" target="_blank" rel="noreferrer noopener">𝕏</a>
                <a href="https://www.instagram.com/paybacker.co.uk/" aria-label="Instagram" target="_blank" rel="noreferrer noopener">◎</a>
                <a href="https://www.facebook.com/profile.php?id=61579563073310" aria-label="Facebook" target="_blank" rel="noreferrer noopener">f</a>
                <a href="https://www.tiktok.com/@paybacker.co.uk" aria-label="TikTok" target="_blank" rel="noreferrer noopener">♪</a>
                <a href="https://www.linkedin.com/company/112575954/" aria-label="LinkedIn" target="_blank" rel="noreferrer noopener">in</a>
              </div>
              <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div>© 2026 Paybacker LTD · Company no. 15289174 · Registered in England &amp; Wales</div>
            <div>paybacker.co.uk · Made in London 🇬🇧</div>
          </div>
        </div>
      </footer>

      <StickyCTA />
    </div>
  );
}
