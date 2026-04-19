'use client';

/**
 * Public homepage.
 *
 * PR 5 (April 2026) cut the v2 redesign (previously at /preview/homepage)
 * over to `/`. The v2 page is fully self-contained: its own nav, hero,
 * stats, sections, FAQ, footer and chat widget — no PublicNavbar needed.
 *
 * The source of truth for the homepage now lives under
 * `src/app/preview/homepage/page.tsx` so the design series can keep
 * iterating there without touching this file. This shim just renders
 * that component at the root route.
 */

export { default } from './preview/homepage/page';
