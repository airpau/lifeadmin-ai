# Paybacker Marketing Automation — Setup Guide

**Last updated:** 2026-04-18
**Owner:** Paul. Hand back to Claude for any single line that needs changing.

This is the one document that tells you, in order, what has to happen before the marketing automation goes live. Work top to bottom.

## 0. What's already in place (verified 2026-04-18)

The following is already shipped in the repo and will be exercised the moment you deploy:

1. **Meta Conversions API server-side** — `src/lib/meta-conversions.ts` already sends three events with consent-gated deduplication. Callers:
   - `CompleteRegistration` → `src/app/api/auth/welcome/route.ts`
   - `Purchase` / `Subscribe` → `src/app/api/webhooks/stripe/route.ts`
   - letter-generated custom event → `src/app/api/complaints/generate/route.ts`
2. **Facebook posting** — `src/lib/meta-social.ts` + `META_ACCESS_TOKEN` working.
3. **Generate social image cron** — existing `generate-social-posts` cron uses Imagen. **Not replaced.** The new `content-ideas-generator` runs alongside it and uses fal.ai per the CLAUDE.md rule. Delete the old cron only once the new pipeline is proven.
4. **Complaint writer + Riley support** — untouched. Those are the two live user-serving workers; we have been told not to modify them.

## 1. Files added in this sprint (code written, not yet deployed)

### Migrations (`supabase/migrations/`)

| File | What it adds |
|---|---|
| `20260418000000_content_ideas.sql` | `content_ideas` (seed library) + RLS |
| `20260418000001_marketing_angles.sql` | `marketing_angles` (HARO pull-quote library) + RLS |
| `20260418000002_ugc_creators.sql` | `ugc_creators` (with `draft_message`, lifecycle columns) + RLS |
| `20260418000003_press_outreach.sql` | `press_outreach` + `raw_press_queries` staging + RLS |
| `20260418000004_partnership_pipeline.sql` | `partnership_pipeline` + RLS |
| `20260418000005_content_drafts_source_idea.sql` | `content_drafts.source_idea_id` FK (additive) |

All six migrations use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — additive only, no drops, no destructive alters.

### Libs (`src/lib/`)

| File | What it does |
|---|---|
| `fal/generate-image.ts` | Hits fal.ai REST (Flux Pro v1.1-ultra default), pipes through Supabase Storage for a stable CDN URL. Also includes `generateFalVideo` for future Kling / Luma use. |
| `apify/scrape-tiktok.ts` | Apify run-sync-get-dataset-items for `clockworks/free-tiktok-scraper`, scored by engagement × consumer-rights keyword hit. |

### Crons (`src/app/api/cron/`)

| Route | Schedule | Kill switch |
|---|---|---|
| `content-ideas-generator` | `0 7 * * *` | `VERCEL_CONTENT_IDEAS_CRON_ENABLED=false` |
| `ugc-outreach` | `0 10 * * 1,3,5` | `VERCEL_UGC_CRON_ENABLED=false` |
| `press-outreach` | `0 9 * * 1-5` | `VERCEL_PRESS_CRON_ENABLED=false` |

Each cron checks `CRON_SECRET` Bearer auth, short-circuits when the kill-switch env is `false`, writes a row to `agent_runs`, and returns 200 even on partial failure (so Vercel's own monitoring can't drown you in pager noise). None of them post or send anything — all outputs land in `content_drafts` / `ugc_creators` / `press_outreach` with `status='pending_send'`.

`vercel.json` has been updated with all three entries.

## 2. New environment variables needed

Add these to Vercel → Project → Settings → Environment Variables (Production + Preview + Development):

| Var | Value | Where to get it | Cost |
|---|---|---|---|
| `FAL_KEY` | `66be6b5e-973c-494f-a270-63370f11b1c5:681fe3427699c29859b749e6a2ec1908` | Already in your project instructions (agent key) | Usage-based ~£4/mo |
| `APIFY_TOKEN` | *(new)* | apify.com → Settings → Integrations → API tokens. Free tier is fine at 3× per week. | Free |
| `VERCEL_CONTENT_IDEAS_CRON_ENABLED` | `true` | Set manually | – |
| `VERCEL_UGC_CRON_ENABLED` | `false` *(start here until first test run looks good)* | Set manually | – |
| `VERCEL_PRESS_CRON_ENABLED` | `false` *(same — enable after raw_press_queries has real data)* | Set manually | – |

Already in Vercel (verified): `ANTHROPIC_AGENTS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `CRON_SECRET`.

Optional for later: `HUNTER_IO_KEY` (journalist email lookups), `BLAZE_API_KEY` (ad-management platform — only if you choose Blaze over in-house Cowork for the 60-day launch), `JOINBRANDS_API_KEY` (only if JoinBrands exposes one; otherwise manual UGC ordering stays).

## 3. Deployment order (safest path)

Do not try to push everything at once. Stage it.

**Day 1 — migrations only:**

1. Apply all six migrations via the Supabase MCP (`apply_migration` tool) or CLI. Order matters: 000000 → 000005 (the alter in 000005 references content_ideas from 000000).
2. Verify each table exists in Supabase Studio. RLS shown as enabled.
3. Seed `content_ideas` from `docs/marketing/templates/tiktok-reels-30-seed-ideas.md` (30 rows — one-off script, not yet written; happy to write if needed).
4. Seed `marketing_angles` from `docs/marketing/templates/haro-qwoted-responses.md` (7 rows).

**Day 2 — crons deployed, kill-switches OFF:**

1. Push the code. Vercel auto-deploys.
2. Confirm `/api/cron/content-ideas-generator`, `/api/cron/ugc-outreach`, `/api/cron/press-outreach` routes return 401 without the bearer header — they should.
3. Leave all three kill switches at `false`. Nothing fires. Let deployment bake for 24 hours.

**Day 3 — flip content-ideas-generator ON:**

1. Set `VERCEL_CONTENT_IDEAS_CRON_ENABLED=true`. Leave the other two off.
2. Next morning (or manually trigger via curl), check `agent_runs` for one new `cron-content-ideas-generator` row.
3. Inspect `content_drafts` — expect 3 rows with status=pending, each with a fal.ai image URL.
4. Open the drafts in the existing admin flow (currently `/admin/content-drafts` does not exist — you approve via SQL or the /api/social/approve endpoint with the draft id).
5. Approve one, post via existing `/api/social/post`. Verify it lands on Facebook.

**Day 4 — flip UGC ON:**

1. Set `VERCEL_UGC_CRON_ENABLED=true` only after you have verified the Apify actor returns data for the target hashtags. Run once manually first:
   ```bash
   curl -X POST "https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=$APIFY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"hashtags":["ukconsumer","costoflivinguk"],"resultsPerPage":10}'
   ```
2. Manually trigger `/api/cron/ugc-outreach` with the bearer. Inspect `ugc_creators` — expect up to 10 rows with status=pending_send.
3. Send the first two manually via TikTok DM. Wait for replies before enabling the auto-schedule.

**Day 5 — flip press-outreach ON (only after email inbound is wired):**

Press cron depends on `raw_press_queries` having rows. It needs the Qwoted / HARO email-forwarding parser. That work is separate and not in this sprint. Leave `VERCEL_PRESS_CRON_ENABLED=false` until the inbound email pipeline exists.

## 4. Admin UI pages — NOT built in this sprint

The master plan listed five admin pages (`/admin/content-drafts`, `/admin/ugc-outreach`, `/admin/press-outreach`, `/admin/kpi-weekly`, `/admin/ad-performance`). None exist yet — `src/app/admin/` is not present.

Reason held back: admin UI benefits from your taste — list vs cards, inline edit vs modal, etc. Recommended build order when you greenlight:

1. `/admin/content-drafts` first (highest daily value — this is the one you use every morning).
2. `/admin/ugc-outreach` next (Mon/Wed/Fri after each cron run).
3. `/admin/kpi-weekly` for the Friday review.
4. `/admin/press-outreach` only once press cron is live.
5. `/admin/ad-performance` after paid spend exceeds £500/mo — no point before.

Ballpark: ~1 day each, shared layout + auth guard reusable.

## 5. Meta Pixel & Conversions API — already 80% done

Already firing server-side: `CompleteRegistration` (auth/welcome), `Purchase` + `Subscribe` (Stripe webhook), `LetterGenerated` custom (complaint generate route).

**Gaps worth closing** before paid Meta spend goes over £300/mo:

| Event | Where to add |
|---|---|
| `InitiateCheckout` | `src/app/api/stripe/checkout/route.ts` — fire before redirecting to Stripe Checkout |
| `ViewContent` | Call from client on `/pricing` and `/dispute-*` landing pages |
| `PageView` | Client-side Pixel already does this if `fbq('track', 'PageView')` is in your layout. Verify. |

I did not add these because every one of them needs a small client-side change to pair with the server-side event for Meta's event_id deduplication. Happy to add them when you want.

## 6. Ad-management platform decision — pending

Master doc recommended Blaze.ai ($45/mo) for 60-day launch only, replaced month 3 with an in-house Cowork extension. Decision deferred until you compare cost: £36/mo Blaze vs £0 for me doing daily 15-minute paid review via Cowork. I lean towards skipping Blaze entirely for the 60-day sprint — the decisions are simple enough that a daily cron + admin page beats a rented tool.

## 7. What is NOT in this sprint, will not ship unless you ask

- Seed scripts for `content_ideas` and `marketing_angles` (the data loaders — I can write these in ~30 min)
- HARO / Qwoted inbound email → `raw_press_queries` parser (needs Resend inbound or Cloudflare Email Worker — ~2h)
- Admin UI pages (listed above)
- Meta Pixel client-side top-up events
- Blaze.ai integration (recommend skipping)
- JoinBrands or other UGC marketplace integration (manual ordering is fine for launch)
- Awin affiliate cron
- Product Hunt / Hacker News launch scheduling
- Podcast outreach

## 8. First-run monitoring checklist (for your Friday)

After each new cron fires its first real run:

```sql
-- Did anything fire?
SELECT agent_name, status, output, created_at
FROM agent_runs
WHERE agent_name LIKE 'cron-%outreach%'
   OR agent_name LIKE 'cron-content-ideas%'
ORDER BY created_at DESC
LIMIT 20;

-- Where are the pending drafts?
SELECT 'content' AS kind, COUNT(*) FROM content_drafts WHERE status='pending'
UNION ALL
SELECT 'ugc', COUNT(*) FROM ugc_creators WHERE status='pending_send'
UNION ALL
SELECT 'press', COUNT(*) FROM press_outreach WHERE status='pending_send';
```

## 9. Rollback

All migrations are additive. To disable automation entirely without a deploy:

```bash
vercel env add VERCEL_CONTENT_IDEAS_CRON_ENABLED=false production
vercel env add VERCEL_UGC_CRON_ENABLED=false production
vercel env add VERCEL_PRESS_CRON_ENABLED=false production
vercel env pull && vercel deploy --prod --prebuilt
```

To remove the tables: don't. They are empty when not in use. Only the ALTER on `content_drafts` added a nullable column — harmless.
