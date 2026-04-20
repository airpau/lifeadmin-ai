# Handoff: Paybacker Homepage — Product Walkthrough

## Overview
A six-section product walkthrough for paybacker.co.uk showing how each tool in Paybacker (the UK AI money-back engine) works and how the tools stack together to beat every single incumbent. The six sections are:

1. **AI Disputes Centre** — draft UK-law-cited complaint letters in 30s; user sends from their own inbox; AI monitors email thread and drafts rebuttals
2. **Subscriptions Tracker** — auto-tagged recurring charges (hike/duplicate/trial/renewal) with one-tap actions
3. **Money Hub** — Open Banking dashboard + Emma feature comparison
4. **Pocket Agent (Telegram)** — chat-first financial agent with proactive hike alerts
5. **Google Sheets Export** — live sync + Paybacker-enriched columns (Flag, Paybacker tag)
6. **Stacked** — architecture diagram + competitor comparison table

These can be shipped as (a) the main body of the homepage replacing the current "Pillars" + "How it works" sections, or (b) six standalone social/blog posts.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the intended look and behaviour, not production code to ship directly. Please **recreate these HTML designs in the existing paybacker.co.uk codebase** using its established React/Next.js patterns, component library, and tokens (see `lifeadmin-ai` repo under `airpau` on GitHub). If any pattern is missing, follow the tokens listed below.

## Fidelity
**High-fidelity (hifi).** Final colours, typography, spacing, interactive affordances and copy are all production-ready. Recreate pixel-perfectly with the existing codebase's primitives.

## Screens / Views

### 01 · AI Disputes Centre (light section)
- **Purpose**: Show that the AI drafts a legally-grounded letter in 30s, user sends it, Paybacker monitors the reply thread
- **Layout**: `<section>` card (max-width 1360, 48px padding, radius 28px) with header row (eyebrow + title + sub + vs-badge) on top, a light stage with a 2-col grid below (1.2fr letter preview / 1fr filled-in form), a full-width amber clarity banner, then a full-width "Live · Monitoring 1 thread" email monitor panel. 2-col caption row at the bottom.
- **Components**:
  - **Letter preview card**: Georgia serif 14px body on `#FDFDF7`, amber `hl` highlights (`#FEF3C7` bg), fade-to-bottom gradient. 3 copy-action buttons (Copy / Download PDF / Open in email).
  - **Form summary card**: 4 labelled fields — Category, Provider, What happened, Paybacker picked for you (last one gets mint-wash fill + green tick).
  - **Clarity banner** (amber, full-width, grid-column 1/-1): explains user sends it, AI watches thread.
  - **Thread-monitor panel**: green pulsing dot + "Live · Monitoring 1 thread" label, then 3 rows — outbound 📤, inbound 📥, and an amber "Paybacker AI flagged this reply" row with "ACT NOW" pill.

### 02 · Subscriptions Tracker (light section, mint-wash stage)
- **Purpose**: Show auto-tagged recurring charges with next-step actions.
- **Layout**: Header row + stage containing tilted iPhone on the left + 2 stacked side-cards on the right (420px max-width).
- **iPhone screen**:
  - Status bar, "Subscriptions · 18 active" header
  - Dark "Monthly spend £284.16, ↗ £38 vs last month, 4 need review" hero card
  - 7 sub rows: Netflix (`+£3 hike` amber), Virgin (`+£12 hike` amber), Audible (plain), Twitch (`Duplicate` red), Canva (`Trial ends 3d` blue), Spotify (plain), PureGym (`Renews in 5d` grey). **Do not use "unused" or "inactive" tags — we cannot detect usage.**
- **Side panel 1** ("4 flagged this month"): short reasons per flag
- **Side panel 2** ("One tap · three outcomes"): Cancel / Dispute / Switch rows

### 03 · Money Hub (light section, tall mint-wash stage)
- **Purpose**: Daily-use dashboard + direct Emma comparison
- **Layout**: Header + stage with iPhone + 340px compare pane
- **iPhone content**: "Net this month £2,847.12 ↗ £312 vs Sep", donut + legend (Essentials/Subs/Transport/Dining/Other), Today/Yesterday transaction list with a HIKE tag next to Virgin Media
- **Compare pane**: **3-column CSS grid** (`1.4fr 1fr 1fr`), 7 rows comparing Paybacker vs Emma on Account sync / Subs / Dispute engine / Bill-hike alerts / Telegram agent / Sheets export / Switch deals. Grid alignment is critical — don't use flexbox space-between.

### 04 · Pocket Agent (dark section, tall dark stage)
- **Purpose**: Telegram agent demo + scenario grid
- **Layout**: Header + stage with iPhone + 420px scenarios column
- **iPhone content**: Telegram chrome (blue `#517DA2` header), message body must have `overflow-y:auto` + `min-height:0` (flex child). Messages are 82% max-width, 12.5px font, 9-13px padding. Button pills (inline actions) are 10.5px on `#F0F7FD` bg with `#517DA2` text.
- **Scenarios column**: 6 `<div class="tg-scenario">` cards with italic query + bold answer arrow row

### 05 · Google Sheets Export (light section)
- **Purpose**: Spreadsheet layout with Paybacker-enriched columns
- **Layout**: Header + sheet frame (max 960px) + export flow diagram
- **Sheet frame**: Sheets-green doc icon, toolbar row, formula bar (`=SUMIFS(...)`), grid with columns: Row#, Date, Merchant, Category, Amount, Flag, Paybacker tag. Row background colours: `.row-hike` (`#FEF3C7`), `.row-dup` (`#FEE2E2`), `.row-new` (`#D1FAE5`)
- **Export flow**: UK banks → Paybacker (mint-highlighted) → Google Sheets, with → arrows

### 06 · Stacked (dark section)
- **Purpose**: Architecture diagram + 7-competitor comparison table
- **Layout**: Header + 3-col arch (`1fr 1.3fr 1fr`) + `<table class="power-table">` spanning full width
- **Arch columns**: Inputs (orange h5) / Paybacker Core (mint-highlighted card with mint h5, shadow, mint border) / Outputs (mint h5)
- **Power table**: Feature column + 6 competitor columns (Emma, Snoop, Lunchflow, Resolver, Which?, Paybacker). Paybacker column in mint.

## Interactions & Behavior
- **Reveal on scroll**: `.reveal` elements fade-up via IntersectionObserver (existing pattern in `styles.css`)
- **Hover states** on copy-btn (darken), tour-caption ul li (no hover)
- **No modal, no routing** — this is a scroll-through marketing page
- **Accessibility**: section has `id="how"` so existing nav link `<a href="#how">` still works

## State Management
None needed — page is static content. If you decide to make the letter preview interactive (regenerate with user input), wire to the existing Paybacker `/api/draft-dispute` endpoint the team already has.

## Design Tokens
Copy these into or onto the existing `styles.css` token layer:

```css
--mint: #34D399;
--mint-deep: #059669;
--mint-wash: #ECFBF3;
--orange: #F59E0B;
--orange-deep: #D97706;
--amber-wash: #FEF3C7;
--ink: #0B1220;
--ink-2: #111A2E;
--paper: #FAFAF7;
--divider: #E5E7EB;
--text-2: #4B5563;
--text-3: #6B7280;
--sheets-green: #0F9D58;
```

- **Typography**: Inter 400/500/600/700/800, Georgia (letter preview), JetBrains Mono (eyebrows/formula bar)
- **Type scale**: section title 36px/800/-0.02em; eyebrow 14px/700/0.1em uppercase; body 15–17px; caption 13–14px; iPhone UI 11–14px
- **Spacing**: 28px card radius, 16px sub-card radius, 48px card padding, 40px card gap
- **Shadow**: `0 50px 100px -30px rgba(0,0,0,0.4)` on iPhones; `0 30px 60px -25px rgba(0,0,0,0.2)` on sheet frame

## Assets
No external imagery. iPhone frames are CSS-only (radial gradient bezel + black inner). All logos are single-letter colour tiles. Sheets icon is a CSS rectangle.

## Files
All design lives in: `Paybacker How It Works.html` (self-contained, open in any browser). Existing production homepage is `index.html` + `styles.css` — merge the new sections in place of the current `<section class="pillars-section">` and `<section class="how-section">` blocks.

## Implementation Notes
- Keep the floating pill nav, hero, trust strip, stats, deals, pricing, testimonials and final CTA **unchanged**
- Swap the thin Pillars + How-it-works blocks for the six new section cards (wrapped in one `<section id="how">` if you want the anchor to still work)
- Don't let the telegram message body overflow its phone screen — it must scroll (`overflow-y:auto; min-height:0` on flex child)
- Subscription rows **must not** reference usage/inactivity — we have no way to detect that
