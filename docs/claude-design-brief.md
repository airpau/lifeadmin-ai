# Paybacker — Claude Design brief (paste into claude.ai/design)

Use this as a single prompt or paste the sections as Claude Design asks.
Repo to connect: `airpau/lifeadmin-ai` (Next.js 15, React, TypeScript, Tailwind).
Design scope: marketing pages first — homepage is the priority, but the system should extend to `/pricing`, `/about`, `/deals`, `/blog`, and the `(seo)` landing pages.

---

## One-paragraph pitch

Paybacker is an AI-powered savings platform for UK consumers. It finds hidden overcharges, writes complaint letters citing exact UK consumer law in 30 seconds, tracks every subscription and contract, scans bank accounts and email inboxes for waste, and recommends better deals. We already save real users four-figure sums each year. Our current homepage is a very dark, navy-on-navy wall of text with large vertical gaps — it reads "crypto-finance" rather than "warm, modern consumer fintech." Redesign it to feel lighter, more professional, more human and more visually interesting, while keeping our mint green and orange as the signature accents.

## Reference we love

**myhishob.in** — study the homepage carefully. What we want to borrow:
- Alternating light / dark sections (the hero is dark, the stats and testimonials live on a clean white/off-white background). This is the single biggest change we want — *we are moving away from a solid dark background across the whole page*.
- A floating rounded-pill sticky nav that sits on a light backdrop.
- A tilted 3-phone hero mockup showing real app screens.
- Large rounded dark cards (~32px radius) placed on a light background — reversed-out for emphasis.
- A warm ambient glow on the viewport edges (they use amber). We can use a very soft orange glow for the same feel.
- Minimal, confident typography with lots of whitespace.
- A clean horizontal testimonial strip that auto-scrolls.

What we do NOT want to copy:
- Their neon-lime accent (#dbf642). We keep Paybacker's mint green and orange.
- Their "App Store download" focus. We're primarily web + Pocket Agent in Telegram, not a mobile-first download.
- Their minimal feature depth. Paybacker has far more depth (disputes, banking, email scan, deals, Pocket Agent) — the redesign must show that richness clearly, not hide it.

## New colour system (light-dominant, not dark)

Replace the current "dark everything" scheme with a layered neutral system. Mint green and orange remain the accents.

- `--surface-base`: #FAFAF7 (warm off-white — primary page background)
- `--surface-elevated`: #FFFFFF (cards on the light sections)
- `--surface-ink`: #0B1220 (very dark navy — used for feature *sections* and card-reverses, NOT the whole page)
- `--surface-soft-mint`: #ECFBF3 (very pale mint wash for supporting sections)
- `--text-primary`: #0B1220
- `--text-secondary`: #4B5563
- `--text-on-ink`: #F3F4F6
- `--accent-mint`: #34D399 (primary brand green — CTAs, key highlights)
- `--accent-mint-deep`: #059669 (hover, text-on-light)
- `--accent-orange`: #F59E0B (secondary brand — Get-Your-Money-Back energy, savings numbers, warning callouts)
- `--accent-orange-deep`: #D97706
- `--divider`: #E5E7EB
- Ambient glow: radial gradient, `--accent-orange` at ~8% opacity, top-right and bottom-left.

Typography: keep the current sans (Inter or similar). Increase hero display size to 88–104px desktop, weight 700, tight tracking (-0.02em). Body 17px. Eyebrow labels uppercase, 12px, letter-spacing 0.12em, in `--accent-mint-deep`.

Corner radii: cards 24px, buttons 14px (pill), inputs 12px, hero figures 32px. Shadows are soft and warm, not black — e.g. `0 20px 60px -20px rgba(11, 18, 32, 0.18)`.

## Layout architecture — the homepage, section by section

The current site has 10+ sections with huge dark vertical gaps between them. The redesign should keep the same information architecture but re-sculpt it into roughly 8 well-paced, visually distinct sections. Each feature section should alternate between light and dark to create rhythm.

1. **Nav (floating pill, sticky)** — on light. Logo left ("Pay" navy, "backer" mint). Centre links: About, Pricing, Deals, Blog, FAQ. Right: "Sign in" (text), "Start Free" (mint pill). A tiny trust row sits just below the nav: "ICO registered · FCA-authorised · GDPR compliant · UK company" with muted icons.

2. **Hero (light background, soft orange glow top-right)**. Left column (60%): eyebrow "Free 14-day Pro trial. No card required." Huge headline in three stacked lines — first line navy ("Find Hidden Overcharges."), second line mint ("Fight Unfair Bills."), third line orange ("Get Your Money Back."). Subhead in grey: "Paybacker scans your bank and email to spot overcharges, forgotten subscriptions, and unfair bills — then writes professional complaint letters citing UK law in 30 seconds." Two CTAs: mint pill "Start free 14-day Pro trial →", ghost button "See how it works". Under the CTAs: a running total "£8,029 saved for Paul this month" in small orange text, feeding recent-user dashboard data.
   Right column (40%): a layered phone + laptop mockup showing the actual Paybacker dashboard (Money Hub income/spending breakdown) with one floating speech bubble from Pocket Agent over it: "Virgin Media bill increased by £12 — want me to draft a dispute?" This is the single most important visual on the page — it has to show the product working, not a stock illustration.

3. **Trust strip (light, horizontal rule above and below)**. Small row of logo-style mentions: ICO, FCA via Yapily, Stripe, GDPR, Paybacker LTD. Grayscale.

4. **"Every £ we found for real UK users" (light, soft mint wash background)**. Three big number cards, rounded 24px, white on mint wash, with an orange underline accent on the number: "£8,029/yr average potential savings found", "149 subscriptions tracked across users", "45 founding members joined". Under each: a line of human context (e.g., "Most came from forgotten subscriptions and price hikes we flagged automatically"). This replaces the small "39 letters generated" strip at the bottom of the current page — it should be above the fold of section 2, not buried.

5. **Product pillars — a three-up feature grid (light)**. Three equal cards:
   - *AI Disputes Centre* (icon: scales of justice, orange). "Complaint letters citing exact UK consumer law in 30 seconds. Consumer Rights Act 2015, UK261, Ofgem, Ofcom." Mini-preview inside the card showing an AI-drafted letter paragraph.
   - *Money Hub* (icon: wallet, mint). "Connect your bank via Open Banking (Yapily). Every subscription, direct debit, and contract in one place. Daily sync." Mini-preview showing the donut chart + income/spending split from the actual Money Hub.
   - *Pocket Agent* (icon: chat bubble, mint→orange gradient). "Your AI financial agent in Telegram. Ask anything, fix everything." Mini-preview showing the Telegram chat bubble style from the current homepage.

6. **"The Dark Section" — How It Works (dark navy background, ink surface)**. This is the deliberate contrast moment. Three numbered steps with large mint numerals. Step 1: "Describe your dispute, get a formal letter in 30 seconds" — with a live mini-form ("What's the issue?" dropdown + "Brief description" + Generate button). Step 2: "Connect your bank and email to find hidden costs". Step 3: "Get personalised savings recommendations from 53+ verified UK partners." End of dark section with a big mint CTA pill: "Try it free — no account needed".

7. **Deals module (light, mint wash)**. The "53+ verified UK partners" section. A flowing logo cloud (BT, Sky, Virgin, EE, E.ON, EDF, OVO, Vodafone, Three, O2, giffgaff, Plusnet, RAC, Habito, +40 more). Under it, a 2×3 grid of category tiles: Broadband (Save £240/yr), Mobile (Save £180/yr), Energy (Save £450/yr), Insurance (Save £320/yr), Mortgages, Travel. Each tile has a mint savings badge. Small orange footnote: "We earn a commission if you switch — you pay nothing extra, and we stay free to use."

8. **Pricing teaser (light)**. Three clean pill-cards side-by-side: Free £0, Essential £4.99/mo (tagged "Most popular" with a mint ribbon), Pro £9.99/mo. Each shows its three headline benefits + a "Founding member" orange banner. Full comparison link below.

9. **Testimonials (light)**. Horizontal auto-scrolling strip of user quotes — borrow myhishob's layout but with real UK voices (homeowner, commuter, student, freelancer). Each card has the user's initial avatar, a 1–2-sentence quote focused on money saved, and a date. Pause on hover.

10. **Final CTA (dark navy)**. "Stop overpaying. Start fighting back." — headline in 80px, mint "Fight" word. Single mint CTA pill: "Start your free 14-day Pro trial →". Under it a tiny line: "No card. Cancel anytime. Your data stays in the UK."

11. **Footer (ink)**. Four columns: Product / Company / Legal / Connect. Social icons (X, Instagram, Facebook, TikTok, LinkedIn). Paybacker LTD line. A small strip of trust logos repeated.

## Interaction and motion

- Subtle reveal-on-scroll: content fades up 12px with 200ms ease, staggered per card. Nothing longer than 400ms.
- The hero phone mockup has a very slow parallax float (2–3px), nothing gimmicky.
- Nav pill shrinks slightly when scrolled.
- Buttons have a 150ms scale(1.02) + shadow bump on hover.
- No floating chat bubble on load — the live-chat widget should be bottom-right but appear after 2s.

## Accessibility, responsive, performance

- WCAG AA contrast everywhere. Mint text on white only in the deep shade `#059669`.
- Mobile-first: the hero stacks; the phone mockup drops below the headline at <1024px.
- Every section fits naturally on a 390px viewport. No 10,000px-tall pages.
- No animation heavier than CSS transforms. Lighthouse performance target 95+.
- All imagery is either SVG or AVIF. Phone mockups are actual product screenshots, not Figma renders.

## Copy to preserve verbatim

These lines are working and we do not want Claude Design to rewrite them:
- "Find Hidden Overcharges. Fight Unfair Bills. Get Your Money Back."
- "Stop overpaying. Start fighting back."
- "Most UK households are overcharged by £1,000+ a year. Paybacker finds it, disputes it, and cancels it in minutes."
- All pricing exactly as is (Free £0 / Essential £4.99 / Pro £9.99 with founding member pricing).
- Legal disclaimers on the AI letters ("AI-generated letters are for guidance only and do not constitute legal advice. For complex disputes, always consult a qualified solicitor.") — but these must only appear on the web page, never inside letter outputs.

## Brand voice

Warm, plain-spoken, a touch cheeky but never edgy. Imagine a money-saving friend who happens to know UK consumer law. British spelling throughout. £ symbols, never "GBP". Always write the domain as `paybacker.co.uk`, never `paybacker.com`.

## What success looks like

Someone lands on paybacker.co.uk and within 5 seconds they should (a) understand we find money you're losing without realising, (b) trust us (via the regulated-UK-company proofs), (c) see the product working on a real dashboard, and (d) feel like this is a premium, modern British fintech rather than a generic dark-mode SaaS.

## Handoff

When the design is approved, package the handoff bundle for Claude Code to apply as a new branch against `airpau/lifeadmin-ai`. Do not touch the authenticated `/dashboard/*` routes — this scope is marketing pages only. Follow the repo's Tailwind config and its existing component library; extend tokens rather than replacing them.
