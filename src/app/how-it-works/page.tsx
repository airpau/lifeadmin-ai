import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { MarkNav, MarkFoot, SIGNUP_HREF } from '../blog/_shared';
import './styles.css';

/**
 * /how-it-works — marketing redesign.
 *
 * Design source: design-zip/design_handoff_paybacker_homepage/Paybacker How It Works.html
 * Scoped under `.m-how-root`.
 *
 * Six numbered demo sections walk through the product surface by surface:
 *   01 Disputes Centre     — LIVE
 *   02 Subscriptions       — LIVE
 *   03 Money Hub           — LIVE
 *   04 Telegram agent      — COMING SOON (per CLAUDE.md roadmap)
 *   05 Google Sheets sync  — COMING SOON
 *   06 Stacked             — comparison with Emma / Snoop / Resolver / Which? / Lunchflow
 *
 * The design's JS-driven filter tagbar is replaced with anchor-link
 * jump nav — every section is rendered and links scroll to it.
 *
 * Content-accuracy deviations vs the design file:
 * - Telegram + Sheets marked "Coming soon" (CLAUDE.md: both on roadmap, not live).
 * - "53+ UK partners" replaced with "UK partner network" (no specific count to commit to).
 * - Bank connection copy references Yapily (current provider) rather than TrueLayer.
 */

export const metadata: Metadata = {
  title: 'How Paybacker works — the five tools in one app',
  description:
    'AI-drafted legal dispute letters, subscription tracking, a bank-connected Money Hub, a Telegram pocket agent and a live Google Sheets export. All from one app, citing real UK consumer law.',
  alternates: { canonical: 'https://paybacker.co.uk/how-it-works' },
  openGraph: {
    title: 'How Paybacker works',
    description:
      'The five tools, side by side. Disputes, subscriptions, Money Hub, Telegram agent, Sheets sync.',
    url: 'https://paybacker.co.uk/how-it-works',
    siteName: 'Paybacker',
    type: 'website',
  },
};

export default function HowItWorksPage() {
  return (
    <div className="m-how-root">
      <MarkNav />

      <header className="hero">
        <nav className="jump" aria-label="Jump to section">
          <Link href="#disputes">Disputes</Link>
          <Link href="#subs">Subscriptions</Link>
          <Link href="#hub">Money Hub</Link>
          <Link href="#agent">Telegram agent</Link>
          <Link href="#sheets">Sheets export</Link>
          <Link href="#stacked">Stacked</Link>
        </nav>
        <h1>
          One app. Everything{' '}
          <span style={{ color: 'var(--accent-mint-deep)' } as CSSProperties}>Emma</span>,{' '}
          <span style={{ color: 'var(--accent-orange-deep)' } as CSSProperties}>Lunchflow</span>{' '}
          and a letter-writing lawyer can do.
        </h1>
        <p>
          Paybacker&rsquo;s five tools work brilliantly on their own &mdash; and become
          unstoppable stacked together. Here&rsquo;s how each one fits into your day.
        </p>
      </header>

      {/* 01 — DISPUTES */}
      <Section1Disputes />

      {/* 02 — SUBSCRIPTIONS */}
      <Section2Subscriptions />

      {/* 03 — MONEY HUB */}
      <Section3MoneyHub />

      {/* 04 — TELEGRAM */}
      <Section4Telegram />

      {/* 05 — SHEETS */}
      <Section5Sheets />

      {/* 06 — STACKED */}
      <Section6Stacked />

      <section style={{ padding: '40px 0 0' } as CSSProperties}>
        <div className="wrap" style={{ textAlign: 'center', padding: '60px 0' } as CSSProperties}>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: 'var(--track-tight)',
              margin: '0 0 14px',
            } as CSSProperties}
          >
            Ready to see it in your own numbers?
          </h2>
          <p
            style={{
              fontSize: 17,
              color: 'var(--text-secondary)',
              maxWidth: 560,
              margin: '0 auto 28px',
            } as CSSProperties}
          >
            Connect a UK bank account in under a minute. Free forever on the starter plan.
          </p>
          <Link href={SIGNUP_HREF} className="btn btn-mint">
            Start free &rarr;
          </Link>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}

/* ==================================================================== */
/* 01 — AI Disputes Centre                                              */
/* ==================================================================== */

function Section1Disputes() {
  return (
    <section className="demo" id="disputes">
      <div className="demo-head">
        <div>
          <div className="demo-num">01 &middot; AI DISPUTES CENTRE</div>
          <h2 className="demo-title">
            Formal complaint letters citing exact UK law, in 30 seconds.{' '}
            <span style={{ color: 'var(--accent-orange-deep)' } as CSSProperties}>
              You send them. We track the replies.
            </span>
          </h2>
          <p className="demo-sub">
            We write the letter, you send it from your own inbox &mdash; then Paybacker&rsquo;s
            AI watches the email thread for you. When the provider replies, we analyse it,
            draft your rebuttal, and alert you in-app when action is needed.
          </p>
        </div>
        <span className="vs-badge">vs. Which? / Resolver</span>
      </div>

      <div className="stage plain">
        <div className="dispute-flow">
          <div className="dispute-card">
            <h4>Letter preview</h4>
            <div className="letter-preview">
              <div className="letter-meta">
                &#x2728; Generated in 0:28 &middot; CRA 2015 s.49 &middot; Ofcom Fairness Framework
              </div>
              <p style={{ margin: '0 0 10px' } as CSSProperties}>
                <strong>To:</strong> complaints@virginmedia.co.uk<br />
                <strong>Subject:</strong> Formal dispute &mdash; mid-contract price increase of
                £12 applied 1 October
              </p>
              <p style={{ margin: '0 0 10px' } as CSSProperties}>Dear Virgin Media Customer Relations,</p>
              <p style={{ margin: '0 0 10px' } as CSSProperties}>
                I am writing to formally dispute the{' '}
                <span className="hl">£12 CPI+3.9% increase</span> applied to my broadband
                contract on 1 October, reference <span className="hl">VM-774-2245</span>.
              </p>
              <p style={{ margin: '0 0 10px' } as CSSProperties}>
                Under <span className="hl">Ofcom&rsquo;s Fairness Framework (2021)</span> and
                the <span className="hl">Consumer Rights Act 2015, s.49</span>, you are obliged
                to provide clear and reasonable notice of price increases and a penalty-free
                right to exit where material terms change mid-contract&hellip;
              </p>
            </div>
            <div className="copy-actions">
              <span className="copy-btn primary">Copy letter to clipboard</span>
              <span className="copy-btn">Download .pdf</span>
              <span className="copy-btn">Open in your email app</span>
            </div>
          </div>

          <div className="dispute-card">
            <h4>What you filled in (30 seconds)</h4>
            <div className="form-field">
              <label>Category</label>
              <div className="v">Mid-contract price rise &middot; Broadband</div>
            </div>
            <div className="form-field">
              <label>Provider</label>
              <div className="v">Virgin Media</div>
            </div>
            <div className="form-field">
              <label>What happened</label>
              <div className="v">My bill jumped £12 without my agreement. Contract was fixed.</div>
            </div>
            <div className="form-field">
              <label>Paybacker picked for you</label>
              <div className="v picked">✓ CRA 2015 s.49 &middot; ✓ Ofcom Fairness Framework</div>
            </div>
          </div>

          <div className="clarity-banner">
            <div className="icon">i</div>
            <div>
              <strong>You send it &mdash; we watch the reply.</strong> Paybacker never emails
              providers on your behalf. You send from your own inbox, then our AI monitors that
              email thread: when a reply lands, we analyse the provider&rsquo;s response, draft
              your counter-reply, and alert you in-app when action is needed.
            </div>
          </div>

          <div className="thread-monitor">
            <div className="live">
              <div className="dot" />
              <div className="live-label">Live &middot; Monitoring 1 thread</div>
              <div className="inbox">Gmail &middot; connected</div>
            </div>
            <div className="thread-row">
              <span>&#x1F4E4;</span>
              <div>
                <strong>You &rarr; Virgin Media</strong> &middot; Formal dispute &mdash;
                mid-contract price increase
              </div>
              <span className="dt">Mon 14:22</span>
            </div>
            <div className="thread-row">
              <span>&#x1F4E5;</span>
              <div>
                <strong>Virgin Media &rarr; You</strong> &middot; &ldquo;We&rsquo;ve received
                your complaint&hellip;&rdquo;
              </div>
              <span className="dt">Tue 09:04</span>
            </div>
            <div className="thread-row alert">
              <span>&#x1F916;</span>
              <div>
                <strong style={{ color: 'var(--accent-orange-deep)' } as CSSProperties}>
                  Paybacker AI flagged this reply.
                </strong>{' '}
                Virgin is offering £6/mo credit but not dropping the hike. Draft rebuttal ready
                citing Ofcom para 4.2.
              </div>
              <span className="dt">ACT NOW</span>
            </div>
          </div>
        </div>
      </div>

      <div className="caption-row">
        <div className="caption-col">
          <h3>How to use it</h3>
          <p>
            Pick a category (bill hike, flight delay, bad service, etc.), tell us what happened
            in a sentence or two, and the AI drafts a legally-grounded letter. Copy it, download
            as PDF, or open in your email app pre-filled. Then just connect your Gmail or
            Outlook &mdash; Paybacker reads incoming replies in that thread, flags them by
            urgency, drafts your counter-reply, and pings you the moment action is needed.
          </p>
        </div>
        <div className="caption-col">
          <h3>Why it&rsquo;s different</h3>
          <ul>
            <li>Cites specific UK statutes &mdash; not generic &ldquo;I&rsquo;m unhappy&rdquo; prose</li>
            <li>Monitors email threads end-to-end &mdash; knows when a reply lands</li>
            <li>Drafts rebuttals automatically when providers push back</li>
            <li>In-app alerts the moment you need to act</li>
            <li>Works across Ofcom / Ofgem / FCA / UK261 / CRA 2015</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ==================================================================== */
/* 02 — Subscriptions                                                   */
/* ==================================================================== */

function Section2Subscriptions() {
  return (
    <section className="demo" id="subs">
      <div className="demo-head">
        <div>
          <div className="demo-num">02 &middot; SUBSCRIPTIONS TRACKER</div>
          <h2 className="demo-title">Every recurring charge. Flagged, categorised, cancellable.</h2>
          <p className="demo-sub">
            Read-only sync with your bank via Open Banking. Each subscription is auto-tagged
            &mdash; hikes, duplicates, trials, inactive &mdash; and one tap takes you to the
            provider&rsquo;s cancel page.
          </p>
        </div>
        <span className="vs-badge">vs. Emma &middot; Snoop</span>
      </div>

      <div className="stage">
        <div className="iphone tilt">
          <div className="iphone-inner">
            <div className="iphone-screen">
              <div className="island" />
              <div className="status-bar dark-text">
                <span>9:41</span>
                <span>●●● 100%</span>
              </div>
              <div className="tracker-screen">
                <div className="tracker-head">
                  <div className="t">Subscriptions</div>
                  <div className="tot">18 active</div>
                </div>
                <div className="tracker-total">
                  <div className="lbl">Monthly spend</div>
                  <div className="big">£284.16</div>
                  <div className="delta">
                    &uarr; £38 vs. last month &middot;{' '}
                    <strong style={{ color: 'var(--accent-orange)' } as CSSProperties}>
                      4 need review
                    </strong>
                  </div>
                </div>
                <SubRow logo="N" color="#E50914" name="Netflix Premium" tag="hike" tagLabel="+£3 hike" meta="Monthly · Next: 14 Nov" amt="£17.99" />
                <SubRow logo="V" color="#D9232A" name="Virgin Media" tag="hike" tagLabel="+£12 hike" meta="Monthly · Next: 1 Nov" amt="£49.00" />
                <SubRow logo="A" color="#00A693" name="Audible" meta="Monthly · Next: 18 Nov" amt="£7.99" />
                <SubRow logo="T" color="#9146FF" name="Twitch Turbo" tag="dup" tagLabel="Duplicate" meta="You also have Prime" amt="£8.99" />
                <SubRow logo="C" color="#FF6A00" name="Canva Pro" tag="trial" tagLabel="Trial ends 3d" meta="Charges £12.99 on 15 Nov" amt="£0.00" />
                <SubRow logo="S" color="#1DB954" name="Spotify Family" meta="Monthly · Next: 22 Nov" amt="£17.99" />
                <SubRow logo="P" color="#0F9D58" name="PureGym" tag="renewal" tagLabel="Renews in 5d" meta="Monthly · Next: 5 Nov" amt="£34.99" />
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties}>
          <div className="dispute-card" style={{ padding: '18px 22px' } as CSSProperties}>
            <h4 style={{ marginBottom: 8, color: 'var(--accent-orange-deep)' } as CSSProperties}>
              4 flagged this month
            </h4>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' } as CSSProperties}>
              <div style={{ marginBottom: 10 } as CSSProperties}>
                <strong>Netflix Premium</strong> &mdash; silently raised £3 this month. Fight or cancel?
              </div>
              <div style={{ marginBottom: 10 } as CSSProperties}>
                <strong>Virgin Media</strong> &mdash; mid-contract hike. Ofcom allows exit.
              </div>
              <div style={{ marginBottom: 10 } as CSSProperties}>
                <strong>Twitch Turbo</strong> &mdash; duplicate with Prime benefits.
              </div>
              <div>
                <strong>Canva trial</strong> &mdash; auto-renews in 3 days unless you act.
              </div>
            </div>
          </div>
          <div className="dispute-card" style={{ padding: '18px 22px' } as CSSProperties}>
            <h4 style={{ marginBottom: 8 } as CSSProperties}>One tap &middot; three outcomes</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 } as CSSProperties}>
              <div style={{ display: 'flex', justifyContent: 'space-between' } as CSSProperties}>
                <span>&rarr; Cancel</span>
                <span style={{ color: 'var(--accent-mint-deep)', fontWeight: 700 } as CSSProperties}>
                  Deep-link to provider
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' } as CSSProperties}>
                <span>&rarr; Dispute</span>
                <span style={{ color: 'var(--accent-mint-deep)', fontWeight: 700 } as CSSProperties}>
                  Hand-off to Disputes
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' } as CSSProperties}>
                <span>&rarr; Switch</span>
                <span style={{ color: 'var(--accent-mint-deep)', fontWeight: 700 } as CSSProperties}>
                  Show cheaper deal
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="caption-row">
        <div className="caption-col">
          <h3>How to use it</h3>
          <p>
            Connect your bank once (read-only, Open Banking via Yapily). Paybacker auto-detects
            every recurring charge and tags them: price hikes (amber), duplicates (red),
            expiring trials (blue), upcoming renewals (grey). Tap any row to cancel, dispute,
            or switch &mdash; we deep-link you straight to the provider&rsquo;s cancel page.
          </p>
        </div>
        <div className="caption-col">
          <h3>Why it beats Emma / Snoop</h3>
          <ul>
            <li>Emma shows subs. We flag <em>why</em> you should act on each one.</li>
            <li>Every row has a next-step action, not just a line item.</li>
            <li>Direct hand-off to the AI Disputes Centre on hikes.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

type SubRowProps = {
  logo: string;
  color: string;
  name: string;
  meta: string;
  amt: string;
  tag?: 'hike' | 'dup' | 'trial' | 'unused' | 'renewal';
  tagLabel?: string;
};

function SubRow({ logo, color, name, meta, amt, tag, tagLabel }: SubRowProps) {
  return (
    <div className="sub-item">
      <div className="sub-logo" style={{ background: color } as CSSProperties}>{logo}</div>
      <div className="sub-info">
        <div className="sub-name">
          {name}
          {tag && tagLabel && <span className={`sub-tag ${tag}`}>{tagLabel}</span>}
        </div>
        <div className="sub-meta">{meta}</div>
      </div>
      <div className="sub-amt">{amt}</div>
    </div>
  );
}

/* ==================================================================== */
/* 03 — Money Hub                                                       */
/* ==================================================================== */

function Section3MoneyHub() {
  return (
    <section className="demo" id="hub">
      <div className="demo-head">
        <div>
          <div className="demo-num">03 &middot; MONEY HUB</div>
          <h2 className="demo-title">All your accounts, in one place. With a fighter built in.</h2>
          <p className="demo-sub">
            Connects to every UK bank via Open Banking (FCA-authorised via Yapily). Net
            position, breakdown, live transactions. Everything Emma does &mdash; plus a dispute
            engine, a deals engine, and an AI agent, all reading from the same ledger.
          </p>
        </div>
        <span className="vs-badge">vs. Emma &middot; Monzo Trends</span>
      </div>

      <div className="stage">
        <div className="iphone">
          <div className="iphone-inner">
            <div className="iphone-screen">
              <div className="island" />
              <div className="status-bar dark-text">
                <span>9:41</span>
                <span>●●● 100%</span>
              </div>
              <div className="hub-screen">
                <div className="hub-header">
                  <div className="t">Money Hub</div>
                  <div className="month">October</div>
                </div>
                <div className="net-card">
                  <div className="lbl">Net this month</div>
                  <div className="big">£2,847.12</div>
                  <div className="delta">&uarr; £312 vs. Sep &middot; on track</div>
                </div>
                <div className="hub-donut-row">
                  <div className="hub-donut">
                    <div className="hub-donut-center">
                      <span>Tracked</span>
                      <strong>£4,892</strong>
                    </div>
                  </div>
                  <div className="hub-legend">
                    <div className="r"><span><span className="sw" style={{ background: 'var(--accent-mint)' } as CSSProperties} />Essentials</span><span className="amt">£1,859</span></div>
                    <div className="r"><span><span className="sw" style={{ background: 'var(--accent-orange)' } as CSSProperties} />Subs</span><span className="amt">£1,174</span></div>
                    <div className="r"><span><span className="sw" style={{ background: '#60A5FA' } as CSSProperties} />Transport</span><span className="amt">£782</span></div>
                    <div className="r"><span><span className="sw" style={{ background: '#A78BFA' } as CSSProperties} />Dining</span><span className="amt">£588</span></div>
                    <div className="r"><span><span className="sw" style={{ background: '#E5E7EB' } as CSSProperties} />Other</span><span className="amt">£489</span></div>
                  </div>
                </div>
                <div className="hub-list">
                  <div className="hdr">Today &middot; 3 transactions</div>
                  <div className="tx"><div className="dot" style={{ background: '#FB923C' } as CSSProperties}>T</div><div className="nm">Tesco Express</div><div className="amt">-£23.40</div></div>
                  <div className="tx"><div className="dot" style={{ background: 'var(--accent-mint-deep)' } as CSSProperties}>£</div><div className="nm">Salary &middot; Acme Ltd</div><div className="amt in">+£3,284</div></div>
                  <div className="tx"><div className="dot" style={{ background: '#A78BFA' } as CSSProperties}>D</div><div className="nm">Deliveroo</div><div className="amt">-£18.50</div></div>
                  <div className="hdr">Yesterday</div>
                  <div className="tx">
                    <div className="dot" style={{ background: '#D9232A' } as CSSProperties}>V</div>
                    <div className="nm">
                      Virgin Media{' '}
                      <span style={{ fontSize: 9, color: 'var(--accent-orange-deep)', fontWeight: 800, marginLeft: 4 } as CSSProperties}>
                        HIKE
                      </span>
                    </div>
                    <div className="amt">-£49.00</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="compare-pane">
          <h4>Money Hub vs. Emma</h4>
          <div className="vs-head">
            <span>Feature</span>
            <span>Emma</span>
            <span>Paybacker</span>
          </div>
          <CompareRow feat="Account sync" them="✓" us="✓" />
          <CompareRow feat="Subscriptions" them="List only" us="+ action flags" />
          <CompareRow feat="Dispute engine" them="—" us="✓ Built-in" />
          <CompareRow feat="Bill-hike alerts" them="Basic" us="With law cited" />
          <CompareRow feat="Telegram agent" them="—" us="Coming soon" />
          <CompareRow feat="Sheets export" them="CSV" us="Coming soon" />
          <CompareRow feat="Switch deals" them="Generic" us="Coming soon" />
        </div>
      </div>

      <div className="caption-row">
        <div className="caption-col">
          <h3>How to use it</h3>
          <p>
            Open the app to your daily snapshot &mdash; net position for the month, spending
            breakdown by category, and today&rsquo;s transactions in a live feed. Any row with
            a flag is actionable: tap it to dispute, cancel, or switch. Same visual grammar as
            Emma or Monzo Trends &mdash; but every flagged row has a next step beyond
            &ldquo;look at it.&rdquo;
          </p>
        </div>
        <div className="caption-col">
          <h3>What makes it different</h3>
          <ul>
            <li>Hikes are actionable in-app, not just labelled.</li>
            <li>Categorisation uses your actual contract terms, not generic MCC codes.</li>
            <li>Everything else reads from this same ledger.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function CompareRow({ feat, them, us }: { feat: string; them: string; us: string }) {
  return (
    <div className="compare-row">
      <span className="feat">{feat}</span>
      <span className="them">{them}</span>
      <span className="us">{us}</span>
    </div>
  );
}

/* ==================================================================== */
/* 04 — Telegram Pocket Agent (coming soon)                             */
/* ==================================================================== */

function Section4Telegram() {
  return (
    <section className="demo dark" id="agent">
      <div className="demo-head">
        <div>
          <div className="demo-num">04 &middot; POCKET AGENT</div>
          <h2 className="demo-title">Ask anything about your money, in Telegram.</h2>
          <p className="demo-sub">
            Your bank data and dispute tools, wrapped in a chat interface. Push alerts when
            bills hike. Natural language for every action. No app to open.
          </p>
        </div>
        <span className="vs-badge soon">Coming soon</span>
      </div>

      <div className="stage" style={{ minHeight: 620 } as CSSProperties}>
        <div className="iphone">
          <div className="iphone-inner">
            <div className="iphone-screen">
              <div className="island" />
              <div className="status-bar light-text">
                <span>9:41</span>
                <span>●●● 100%</span>
              </div>
              <div className="tg-app">
                <div className="tg-header">
                  <div className="av">PB</div>
                  <div className="info">
                    <div className="nm">Paybacker &middot; Pocket Agent</div>
                    <div className="st">bot &middot; last seen just now</div>
                  </div>
                </div>
                <div className="tg-body">
                  <div className="tg-msg in">
                    Virgin Media just charged you £49 &mdash; that&rsquo;s{' '}
                    <strong>£12 more</strong> than last month. Want to fight it?
                    <div className="buttons">
                      <span className="ibtn">Fight it</span>
                      <span className="ibtn">Details</span>
                      <span className="ibtn">Dismiss</span>
                    </div>
                    <div className="time">09:14</div>
                  </div>
                  <div className="tg-msg out">
                    Fight it<div className="time">09:14 ✓✓</div>
                  </div>
                  <div className="tg-msg in">
                    Letter drafted &mdash; Ofcom Fairness Framework + CRA 2015 s.49
                    <div className="buttons">
                      <span className="ibtn">Copy text</span>
                      <span className="ibtn">Open in email</span>
                    </div>
                    <div className="time">09:14</div>
                  </div>
                  <div className="tg-msg out">
                    Is my energy bill fair?<div className="time">09:22 ✓✓</div>
                  </div>
                  <div className="tg-msg in">
                    British Gas &middot; £128/mo. UK median for your postcode is{' '}
                    <strong>£94</strong>. Octopus Tracker would save you{' '}
                    <strong>£287/yr</strong> on current usage.
                    <div className="buttons">
                      <span className="ibtn">See deal</span>
                      <span className="ibtn">Switch me</span>
                    </div>
                    <div className="time">09:22</div>
                  </div>
                </div>
                <div className="tg-input">
                  <div className="field">Ask anything…</div>
                  <div className="send">▶</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="tg-scenarios">
          <div className="tg-scenario"><div className="q">&ldquo;Cancel my gym&rdquo;</div><div className="a">&rarr; Finds PureGym DD, opens cancel link</div></div>
          <div className="tg-scenario"><div className="q">&ldquo;Is £68 fair for 100Mb broadband?&rdquo;</div><div className="a">&rarr; Compares to postcode median, shows cheaper option</div></div>
          <div className="tg-scenario"><div className="q">&ldquo;What subscriptions renew this week?&rdquo;</div><div className="a">&rarr; Lists upcoming charges + any trial expiries</div></div>
          <div className="tg-scenario"><div className="q">&ldquo;Draft a letter for my delayed flight&rdquo;</div><div className="a">&rarr; UK261 complaint in 30s</div></div>
          <div className="tg-scenario"><div className="q">&ldquo;How am I doing vs. my budget?&rdquo;</div><div className="a">&rarr; Live status pulled from Money Hub</div></div>
        </div>
      </div>

      <div className="caption-row">
        <div className="caption-col">
          <h3>How it will work</h3>
          <p>
            Once the Telegram agent ships, you&rsquo;ll connect it to your Paybacker account in
            30 seconds. From then on, just ask: &ldquo;cancel my gym,&rdquo; &ldquo;is my
            energy bill fair?&rdquo;, &ldquo;what renews this week?&rdquo; &mdash; and it
            answers from your own data. The agent also pushes proactive alerts the moment it
            spots a bill hike, with a one-tap &ldquo;Fight it&rdquo; button.
          </p>
        </div>
        <div className="caption-col">
          <h3>Why Telegram</h3>
          <ul>
            <li>Users don&rsquo;t need to open an app &mdash; it comes to them.</li>
            <li>Zero-friction approval for automated actions.</li>
            <li>Works cross-device, notification-first.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ==================================================================== */
/* 05 — Google Sheets export (coming soon)                              */
/* ==================================================================== */

function Section5Sheets() {
  return (
    <section className="demo" id="sheets">
      <div className="demo-head">
        <div>
          <div className="demo-num">05 &middot; GOOGLE SHEETS EXPORT</div>
          <h2 className="demo-title">Live-sync to your own spreadsheet. Own your data, forever.</h2>
          <p className="demo-sub">
            Everything Lunchflow does &mdash; transaction export, monthly roll-up, custom
            categories &mdash; piped into a Google Sheet that updates hourly. Your formulas,
            your charts, your AI agents can read from it.
          </p>
        </div>
        <span className="vs-badge soon">Coming soon</span>
      </div>

      <div className="stage plain">
        <div className="sheet-frame">
          <div className="sheet-head">
            <div className="doc-icon">▤</div>
            <div>
              <div className="title">Paybacker &middot; October</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 } as CSSProperties}>
                paybacker-oct.gsheet
              </div>
            </div>
            <div className="save">Synced &middot; 2 min ago</div>
          </div>
          <div className="sheet-toolbar">
            <span>File</span><span>Edit</span><span>View</span><span>Insert</span>
            <span>Format</span><span>Data</span><span>Tools</span>
            <span style={{ marginLeft: 'auto', color: 'var(--accent-mint-deep)', fontWeight: 600 } as CSSProperties}>
              ● Paybacker live sync
            </span>
          </div>
          <div className="formula-bar">
            <span className="cell">B4</span>
            <span>=SUMIFS(Transactions!D:D,Transactions!E:E,&quot;Subscriptions&quot;)</span>
          </div>
          <table className="sheet-grid">
            <thead>
              <tr>
                <th className="rowhdr" />
                <th>A &mdash; Date</th>
                <th>B &mdash; Merchant</th>
                <th>C &mdash; Category</th>
                <th>D &mdash; Amount</th>
                <th>E &mdash; Flag</th>
                <th>F &mdash; Paybacker tag</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="rowhdr">1</td><td>14-10</td><td>Tesco Express</td><td>Groceries</td><td className="num">-£23.40</td><td></td><td></td></tr>
              <tr><td className="rowhdr">2</td><td>14-10</td><td>Acme Ltd &middot; Payroll</td><td>Income</td><td className="num" style={{ color: 'var(--accent-mint-deep)', fontWeight: 700 } as CSSProperties}>+£3,284.00</td><td></td><td></td></tr>
              <tr className="hike"><td className="rowhdr">3</td><td>14-10</td><td>Virgin Media</td><td>Broadband</td><td className="num">-£49.00</td><td>HIKE +£12</td><td>dispute-ready</td></tr>
              <tr><td className="rowhdr">4</td><td>13-10</td><td>Deliveroo</td><td>Dining</td><td className="num">-£18.50</td><td></td><td></td></tr>
              <tr className="new"><td className="rowhdr">5</td><td>13-10</td><td>Octopus Energy</td><td>Energy</td><td className="num">-£94.12</td><td>SWITCHED</td><td>saves £287/yr</td></tr>
              <tr><td className="rowhdr">6</td><td>12-10</td><td>Spotify</td><td>Subscriptions</td><td className="num">-£17.99</td><td></td><td></td></tr>
              <tr className="dup"><td className="rowhdr">7</td><td>12-10</td><td>Twitch Turbo</td><td>Subscriptions</td><td className="num">-£8.99</td><td>DUPLICATE</td><td>cancel-ready</td></tr>
              <tr><td className="rowhdr">8</td><td>11-10</td><td>TfL &middot; Oyster</td><td>Transport</td><td className="num">-£12.80</td><td></td><td></td></tr>
              <tr><td className="rowhdr">9</td><td>11-10</td><td>Netflix Premium</td><td>Subscriptions</td><td className="num">-£17.99</td><td>UNUSED 62d</td><td>cancel-ready</td></tr>
              <tr><td className="rowhdr">10</td><td>10-10</td><td>Waterstones</td><td>Shopping</td><td className="num">-£14.99</td><td></td><td></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="export-flow">
        <div className="export-node">
          <div className="logo">&#x1F3E6;</div>
          <div className="nm">UK banks</div>
          <div className="sub">via Yapily (Open Banking)</div>
        </div>
        <div className="export-arrow">&rarr;</div>
        <div className="export-node" style={{ borderColor: 'var(--accent-mint)' } as CSSProperties}>
          <div className="logo">&#x1F527;</div>
          <div className="nm">Paybacker</div>
          <div className="sub">categorise &middot; flag &middot; enrich</div>
        </div>
        <div className="export-arrow">&rarr;</div>
        <div className="export-node">
          <div className="logo" style={{ color: 'var(--sheets-green)' } as CSSProperties}>▤</div>
          <div className="nm">Google Sheets</div>
          <div className="sub">live sync every hour</div>
        </div>
      </div>

      <div className="caption-row">
        <div className="caption-col">
          <h3>How it will work</h3>
          <p>
            From settings, click &ldquo;Sync to Google Sheets&rdquo; and authorise once.
            Paybacker creates a live sheet in your Drive and updates it every hour with every
            transaction, plus two extra columns: <strong>Flag</strong> (hike, duplicate,
            unused, switched) and <strong>Paybacker tag</strong> (dispute-ready, cancel-ready,
            saves £X/yr). Use it with your own formulas, charts, or AI agents.
          </p>
        </div>
        <div className="caption-col">
          <h3>Why it beats Lunchflow</h3>
          <ul>
            <li>Sync columns include Paybacker&rsquo;s enrichment, not just raw txns.</li>
            <li>Two-way: write &ldquo;cancelled&rdquo; in the sheet, it updates the app.</li>
            <li>Works with any AI agent that can read a Google Sheet.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ==================================================================== */
/* 06 — Stacked                                                         */
/* ==================================================================== */

function Section6Stacked() {
  return (
    <section className="demo dark" id="stacked">
      <div className="demo-head">
        <div>
          <div className="demo-num">06 &middot; STACKED</div>
          <h2 className="demo-title">Individually good. Stacked, unmatched.</h2>
          <p className="demo-sub">
            No single competitor combines bank sync, subscription tracking, AI-drafted legal
            disputes, a conversational agent, and a live spreadsheet export. Paybacker does.
          </p>
        </div>
      </div>

      <div className="stage" style={{ padding: 32 } as CSSProperties}>
        <div className="arch">
          <div className="arch-col">
            <h5 style={{ color: 'var(--accent-orange)' } as CSSProperties}>INPUTS</h5>
            <div className="arch-item"><span className="d" />UK banks via Yapily</div>
            <div className="arch-item"><span className="d" />Gmail / Outlook inbox scan</div>
            <div className="arch-item"><span className="d" />Manual subscription add</div>
            <div className="arch-item"><span className="d" />Telegram commands (coming soon)</div>
            <div className="arch-item"><span className="d" />Dispute form (web or chat)</div>
          </div>
          <div className="arch-col hub">
            <h5>PAYBACKER CORE</h5>
            <div className="arch-item"><span className="d" /><strong>Unified ledger</strong> &mdash; every txn, contract, hike</div>
            <div className="arch-item"><span className="d" /><strong>Classifier</strong> &mdash; Money Hub categorisation</div>
            <div className="arch-item"><span className="d" /><strong>Flag engine</strong> &mdash; hikes, duplicates, trials</div>
            <div className="arch-item"><span className="d" /><strong>Law library</strong> &mdash; CRA, Ofcom, Ofgem, UK261, FCA</div>
            <div className="arch-item"><span className="d" /><strong>Deals graph</strong> &mdash; UK partner network</div>
          </div>
          <div className="arch-col">
            <h5 style={{ color: 'var(--accent-mint)' } as CSSProperties}>OUTPUTS</h5>
            <div className="arch-item"><span className="d" />Web app &mdash; Money Hub + Disputes</div>
            <div className="arch-item"><span className="d" />Telegram Pocket Agent (coming soon)</div>
            <div className="arch-item"><span className="d" />Complaint letters (copy/email/PDF)</div>
            <div className="arch-item"><span className="d" />Google Sheets live sync (coming soon)</div>
            <div className="arch-item"><span className="d" />Deep-links to cancel / switch</div>
          </div>
        </div>
      </div>

      <table className="power-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Emma</th>
            <th>Snoop</th>
            <th>Lunchflow</th>
            <th>Resolver</th>
            <th>Which?</th>
            <th style={{ color: 'var(--accent-mint)' } as CSSProperties}>Paybacker</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="feat">Bank sync (Open Banking)</td><td className="us">✓</td><td className="us">✓</td><td className="us">✓</td><td className="them">—</td><td className="them">—</td><td className="us">✓</td></tr>
          <tr><td className="feat">Subscription flagging (hike/dup/unused)</td><td className="them">Basic</td><td className="them">Basic</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="us">Full</td></tr>
          <tr><td className="feat">Legal-grade dispute letters</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="them">Templates</td><td className="them">Guide</td><td className="us">AI + law</td></tr>
          <tr><td className="feat">UK consumer law library cited</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="them">Partial</td><td className="them">Partial</td><td className="us">5+ statutes</td></tr>
          <tr><td className="feat">Telegram / chat agent</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="them">—</td><td className="us">Coming soon</td></tr>
          <tr><td className="feat">Live Google Sheets export</td><td className="them">CSV only</td><td className="them">—</td><td className="us">✓</td><td className="them">—</td><td className="them">—</td><td className="us">Coming soon</td></tr>
          <tr><td className="feat">User in control (no auto-sent emails)</td><td className="us">✓</td><td className="us">✓</td><td className="us">✓</td><td className="them">Semi</td><td className="us">✓</td><td className="us">✓</td></tr>
        </tbody>
      </table>

      <div className="caption-row">
        <div className="caption-col">
          <h3>The unfair advantage</h3>
          <p>
            The Paybacker core is one unified ledger &mdash; every feature reads from it. When
            you dispute a charge, the Money Hub reflects it. When you cancel from the
            subscriptions screen, the ledger updates. No other UK product stacks the same five
            surfaces.
          </p>
        </div>
        <div className="caption-col">
          <h3>What this means for users</h3>
          <ul>
            <li>One subscription replaces Emma + Resolver + (eventually) Lunchflow.</li>
            <li>Actions flow: flag &rarr; dispute &rarr; cancel &rarr; switch &rarr; log.</li>
            <li>You stay in control &mdash; we never email on your behalf.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
