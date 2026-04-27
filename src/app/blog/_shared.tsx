/**
 * Shared chrome for /blog and /blog/[slug].
 *
 * Both routes scope their styles under `.m-blog-root` so the nav + footer
 * components live in a single module to keep per-route page.tsx files small.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const SIGNUP_HREF = '/auth/signup';
export const SIGNIN_HREF = '/auth/login';

type NavLabel = 'About' | 'Pricing' | 'Blog' | 'Careers';

export function MarkNav({ active }: { active?: NavLabel }) {
  const links: ReadonlyArray<readonly [NavLabel, string]> = [
    ['About', '/about'],
    ['Pricing', '/pricing'],
    ['Blog', '/blog'],
    ['Careers', '/careers'],
  ];
  return (
    <div className="nav-shell">
      <nav className="nav-pill" aria-label="Primary">
        <Link className="nav-logo" href="/">
          <span className="pay">Pay</span>
          <span className="backer">backer</span>
        </Link>
        <div className="nav-links">
          {links.map(([label, href]) => (
            <Link key={label} href={href} className={label === active ? 'is-active' : undefined}>
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-cta-row">
          <Link className="nav-signin" href={SIGNIN_HREF}>Sign in</Link>
          <Link className="nav-start" href={SIGNUP_HREF}>Start free</Link>
        </div>
      </nav>
    </div>
  );
}

export function MarkFoot() {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo">Pay<span className="backer">backer</span></div>
            <p>Find hidden overcharges. Fight unfair bills. Get your money back. Paybacker LTD, registered in England &amp; Wales (company no. 15289174).</p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/deals">Deals</Link>
            <Link href="/templates">Letter templates</Link>
          </div>
          <div className="footer-col">
            <h5>Company</h5>
            <Link href="/about">About</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/blog">Blog</Link>
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
            <div className="footer-socials" aria-label="Social links">
              <a href="https://x.com/PaybackerUK" aria-label="X (Twitter)">𝕏</a>
              <a href="https://www.linkedin.com/company/112575954/" aria-label="LinkedIn">in</a>
              <a href="https://www.instagram.com/paybacker.co.uk/" aria-label="Instagram">ig</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 Paybacker LTD · Launched March 2026</div>
          <div>Paybacker helps you exercise your rights under UK consumer law (Consumer Rights Act 2015, Ofcom General Conditions, Ofgem Standard Licence Conditions). We are not a law firm.</div>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Post-level shell reused by /blog/[slug] + the three static SEO post pages.
// Scopes content under `.m-blog-root` and assembles the
// breadcrumb/headline/meta + three-column post-body-grid (TOC/body/aside).
// ---------------------------------------------------------------------------

export type TocItem = { id: string; label: string };

export type PostAsideCTAProps = {
  eyebrow?: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
};

export function PostAsideCTA({ eyebrow, title, description, ctaLabel, ctaHref }: PostAsideCTAProps) {
  return (
    <div className="post-aside-cta">
      {eyebrow ? <div className="eyebrow on-ink">{eyebrow}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      <Link className="btn btn-mint" href={ctaHref}>{ctaLabel}</Link>
    </div>
  );
}

export type PostShellProps = {
  category?: string;
  title: string;
  dek?: string;
  dateLabel: string;
  readTime?: string;
  toc?: TocItem[];
  aside?: PostAsideCTAProps;
  children: ReactNode;
  /** Optional JSON-LD block to place at the top of the root. */
  jsonLd?: Record<string, unknown>;
};

export function PostShell({
  category,
  title,
  dek,
  dateLabel,
  readTime,
  toc,
  aside,
  children,
  jsonLd,
}: PostShellProps) {
  const defaultAside: PostAsideCTAProps = {
    eyebrow: 'Try Paybacker',
    title: 'Generate a formal letter in 30 seconds',
    description: 'Our AI writes complaint letters citing exact UK law. Free to try — 3 letters per month.',
    ctaLabel: 'Start free',
    ctaHref: SIGNUP_HREF,
  };
  const asideProps = aside ?? defaultAside;

  return (
    <div className="m-blog-root">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <MarkNav active="Blog" />
      <main>
        <section className="section-light" style={{ paddingTop: 64 }}>
          <div className="wrap">
            <div className="post-breadcrumb">
              <Link href="/blog">Blog</Link>
              <span>/</span>
              {category ? <span className="cat">{category}</span> : <span>{title.length > 48 ? title.slice(0, 48) + '…' : title}</span>}
            </div>
            <h1 className="post-headline">{title}</h1>
            {dek ? <p className="post-dek">{dek}</p> : null}
            <div className="post-meta">
              <div className="author-dot" aria-hidden>PB</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Paybacker</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  {dateLabel}{readTime ? ` · ${readTime}` : ''}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section-light" style={{ paddingTop: 56, paddingBottom: 96 }}>
          <div className="wrap">
            <div className="post-body-grid">
              {/* TOC */}
              <aside className="post-toc" aria-label="On this page">
                {toc && toc.length > 0 ? (
                  <>
                    <div className="post-toc-title">On this page</div>
                    {toc.map((item) => (
                      <a key={item.id} href={`#${item.id}`} className="post-toc-link">
                        {item.label}
                      </a>
                    ))}
                  </>
                ) : null}
              </aside>

              {/* Body */}
              <div className="post-body">{children}</div>

              {/* Aside CTA */}
              <aside className="post-aside">
                <PostAsideCTA {...asideProps} />
              </aside>
            </div>
          </div>
        </section>
      </main>
      <MarkFoot />
    </div>
  );
}
