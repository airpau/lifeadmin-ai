# Homepage v2 — review of Claude Design export

**Export location:** `docs/design-exports/homepage-v2/` (`index.html`, `styles.css`)
**Compared against:** `src/app/page.tsx` (1,200 lines, current production homepage)
**Review date:** 2026-04-19

---

## TL;DR

Claude Design produced a genuinely strong piece of work. The palette, layout rhythm, typography, and product mockups all hit the brief. The main work now is a **merge pass** — fold in the existing Paybacker features the export skipped, add a proper FAQ section (only the nav link is in the export, no actual content), and port it from static HTML into the Next.js + Tailwind codebase without breaking the existing SEO landing pages in `src/app/(marketing)/`.

Recommendation: do this as a new branch `feature/homepage-v2-redesign` with a Vercel preview URL so you can compare side-by-side before merging to main.

---

## What Claude Design did well

- **Palette is exactly on-brief.** `#FAFAF7` base, `#0B1220` for dark sections, mint `#34D399`, orange `#F59E0B`. CSS custom properties are well-organised in `:root` and easy to port to the existing Tailwind tokens.
- **Section rhythm solves the current site's biggest problem.** Light → trust strip → mint-wash stats → light pillars → dark "how it works" → mint-wash deals → light pricing → light testimonials → dark final CTA → footer. No more 10,000px dark wall.
- **Hero visual actually shows the product.** Three layered live mockups — tilted dashboard card (Money Hub with donut + subscriptions), savings snapshot card, and a Pocket Agent Telegram bubble. Far better than the current text-only hero.
- **The "How it works" section has a live mini letter generator** built into Step 1. Better than the current site where that widget lives in its own standalone section and fights for attention.
- **Testimonials are an auto-scrolling infinite-loop carousel** with six real-feeling UK users and genuine-sounding savings numbers.
- **"Tweaks" panel.** There's a live dev panel baked into the HTML (palette, dark-section shade, glow intensity, hero variant) so we can A/B in-browser before committing. Worth keeping in dev only.
- **Copy is respectful of the brief.** Kept "Find Hidden Overcharges. Fight Unfair Bills. Get Your Money Back." verbatim. Final CTA "Stop overpaying. Start fighting back." preserved. Disclaimer line correctly sits in the footer only, never in a letter.
- **Pricing card for Essential is correctly flagged as "Most popular"** with the mint ribbon and "Founding member · locked-in forever" sub-line. Matches the current offer.

## What's missing (and needs adding)

These are present on the current homepage but absent from the export:

1. **No FAQ section.** Only `<a href="#">FAQ</a>` in the nav, no section content. You mentioned you wanted FAQ on the homepage for trust — we need to build this. I'll draft 8–10 questions covering: Is my bank data safe? What does Paybacker actually do? How does the free tier work? Can I really get unlimited letters on Essential? Is this legal advice? What happens if a company ignores my letter? Can I cancel any time? Which banks are supported? Which email providers are supported? Is my data stored in the UK?

2. **No "Why We Exist" narrative section.** The current site has a strong brand-voice block starting "Every energy company, broadband provider, and subscription service in the UK runs the same playbook: bury the price rises, complicate the cancellation…". Worth re-adding as a slim light section between the trust strip and the stats — it's the emotional hook.

3. **No standalone "Try a free letter — no account needed" widget.** The export folds this into Step 1 of "How it works", which is actually a better placement, but the current site puts it above the fold. Decision needed: keep the new placement (cleaner) or duplicate the widget higher up (more conversion-oriented). I'd keep it as-is and measure.

4. **Pocket Agent gets a pillar card, not a full showcase.** The current site has a large dedicated Pocket Agent section with multiple chat examples and feature callouts (Instant Answers / One-Tap Complaints / Proactive Alerts / Verified Savings / Bank-Grade Security). That depth is worth preserving — suggest adding a *second* dedicated Pocket Agent section between the pillars and "How it works", matching the light/dark rhythm.

5. **AI Financial Assistant section missing** — the "My OneStream direct debit keeps appearing as bills but it's broadband…" conversational recategorisation example. This is a differentiator; worth keeping.

6. **Smart Subscription Tracking section** — "Connect your bank and we automatically detect every subscription" with the list of Netflix / Spotify / Sky / Gym. Some of this is implicit in the Money Hub pillar card but the standalone list with renewal flags ("Renews in 14 days") is valuable.

7. **Contract end-date tracking** — no mention anywhere in the export.

8. **Full feature comparison table** — export has a "See the full feature comparison →" link but no destination. We need to keep the existing pricing-page comparison table.

9. **Trust strip uses mock UK company number `15289174`** — replace with the real Paybacker LTD number before shipping.

## What to tweak

- **Logo chips in deals section use plain text** (e.g. `<span>BT</span>`). Fine as placeholder; in the Next.js port we should use the actual partner logos from `/public/logos/` to match the current site.
- **The live-chat widget is a plain `<div>` with an SVG.** The current site has the real widget integrated — remove the export's placeholder and keep our existing widget mount point.
- **"Paul R. · Bristol"** appears as the first testimonial. Fine as a placeholder name but we should substitute real founding-member quotes before shipping (with permission).
- **Savings figure in the hero ticker** — "£8,029 saved for Paul this month" should pull live from the `executive_reports` or `agent_runs` tables so the number updates, rather than being hardcoded.
- **Agent bubble mentions "Ofcom's mid-contract price rise rules"** — good specificity, keep it. But make sure the legal team / you are comfortable publishing that phrasing on the marketing site.
- **No cookie banner / no consent flow visible** in the export. The existing site has one; keep ours in the port.
- **Accessibility:** the HTML is generally good (`aria-label` on nav and chat, `alt` on images would be needed when real images replace the CSS mockups). We should add a "Skip to content" link during the port.

## Porting plan (Next.js + Tailwind)

The export is static HTML + vanilla CSS. To ship it we need to:

1. **Create `src/app/page-v2.tsx`** (temporary) to stage the redesign without disturbing the live `page.tsx`. Mount it at a preview route like `/preview/homepage` behind a feature flag so you can review on Vercel before cutting over.
2. **Port CSS tokens into `tailwind.config.ts`.** The `:root` block maps cleanly to `theme.extend.colors` and `theme.extend.boxShadow`. Custom properties like `--r-card`, `--r-figure` become `borderRadius` entries. The `clamp()` type scale goes into `fontSize`.
3. **Break the page into React components** — `MarketingNav`, `Hero`, `TrustStrip`, `WhyWeExist`, `StatsBlock`, `PillarGrid`, `PocketAgentShowcase` (new), `HowItWorks`, `DealsBlock`, `Pricing`, `Testimonials`, `FAQ` (new), `FinalCTA`, `MarketingFooter`. Each lives in `src/components/marketing/`.
4. **Testimonials stay as a client component** (the infinite scroll needs JS) — port the `renderT` function to a small React component with `useMemo`.
5. **Replace hardcoded stats with live data** — the `£8,029`, `149 subscriptions`, `45 founding members` numbers should pull from Supabase (`agent_runs` / `profiles` counts) via a Server Component fetch. Fallback to hardcoded if Supabase is unavailable.
6. **Mini letter generator** — wire the form in Step 1 to the existing `/api/agents/complaints` route.
7. **Remove the Tweaks panel** before shipping to prod (or gate it behind `process.env.NODE_ENV === 'development'`). Keep it in dev — it's genuinely useful.
8. **Font loading** — the export uses `<link>` to Google Fonts. Switch to `next/font` to avoid the layout shift and the extra network hop.
9. **SEO** — keep the existing `metadata` export and JSON-LD schema markup from the current `page.tsx`. The export has a basic `<title>` only.

## Suggested implementation order

Short-sharp plan, small PRs so you can review at each step:

1. **PR 1 — palette + tokens.** Add the new colour tokens to `tailwind.config.ts` and `globals.css` without changing any pages. Paul reviews on preview. ~30 min.
2. **PR 2 — new marketing components, behind preview route.** Create all the components and mount them at `/preview/homepage`. Keeps `/` untouched. Paul reviews side-by-side. ~2–3 hours.
3. **PR 3 — add FAQ + re-add missing sections** (Why We Exist, Pocket Agent showcase, AI Financial Assistant, Smart Subscriptions). Paul reviews. ~1 hour.
4. **PR 4 — wire live data** (stats, letter generator, testimonials from Supabase). ~1 hour.
5. **PR 5 — cut over.** Swap `page.tsx` to import the v2 homepage. Remove old markup to a backup file for one release cycle, then delete. Vercel deploys. Watch analytics for 48h.
6. **Follow-up** — extend the palette to `/pricing`, `/about`, `/deals`, `/blog`, and the `(marketing)/*` SEO landing pages as a separate series of small PRs.

## Open questions for Paul

Before we start coding:

1. **FAQ content** — happy for me to draft the 10 questions from scratch based on common UK consumer queries, or do you have a list from support tickets? The latter would be more authentic.
2. **Real testimonials** — any founding-member quotes we can use by name, or shall we keep the initial-only format until we have permissions?
3. **Hero "£X saved for Paul this month"** — should this be your personal savings (lovely but weirdly personal on the public site), or "Saved for our members this month" aggregated?
4. **The "FAQ section that you saw in Claude Design"** — it's not in this zip, only the nav link. Can you export the FAQ canvas separately from Claude Design, or should I draft from scratch?
5. **Cut-over approach** — do you want me to run the new design side-by-side via a feature flag for a week of A/B, or cut over directly once you've reviewed the preview?

Answer those and I'll go.
