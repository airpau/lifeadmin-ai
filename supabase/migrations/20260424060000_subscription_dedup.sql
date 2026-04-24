-- One subscription per (user, provider, amount) — collapse accumulated
-- duplicates and prevent the next concurrent cron run from re-creating them.
--
-- Background: detect-recurring's in-JS dedup (src/lib/detect-recurring.ts:207)
-- reads `allUserSubs`, checks for a matching row, then inserts if none.
-- That check is not atomic — two bank-sync runs starting within seconds of
-- each other both see no Patreon row and both insert. Result: some users
-- accumulated 10+ identical rows for the same provider (Patreon, EE, etc.),
-- each still `needs_review=true`, so the "flagged for review" counter
-- appears to never drain no matter how many the user resolves.
--
-- Fix: (a) collapse existing dupes so the user's counter reflects reality,
--      (b) partial unique index over the rest so INSERT-on-conflict can
--          be idempotent from the application layer.

-- ─── 1. Collapse existing dupes (idempotent; safe to re-run) ──────────
-- Keep one canonical row per (user, lower(provider), round(amount,2))
-- that's still active + not dismissed. Preference order:
--   1. needs_review = false (user has already actioned it)
--   2. non-null category (has been classified)
--   3. earliest created_at (the original, not the stray copies)
-- The losers are soft-deleted via dismissed_at — we never hard-delete
-- subscription rows (bank_transactions may reference them).
WITH ranked AS (
  SELECT
    id, user_id, provider_name, amount, status, dismissed_at, needs_review,
    category, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id,
                   LOWER(COALESCE(provider_name, '')),
                   ROUND(COALESCE(amount, 0)::numeric, 2)
      ORDER BY
        (CASE WHEN needs_review = false THEN 0 ELSE 1 END),
        (CASE WHEN category IS NOT NULL AND category <> '' THEN 0 ELSE 1 END),
        created_at ASC
    ) AS keep_rank
  FROM subscriptions
  WHERE status = 'active'
    AND dismissed_at IS NULL
)
UPDATE subscriptions s
   SET dismissed_at = NOW(),
       notes = COALESCE(s.notes || E'\n', '')
               || 'Auto-dismissed as duplicate during 2026-04-24 cleanup'
  FROM ranked r
 WHERE s.id = r.id
   AND r.keep_rank > 1;

-- ─── 2. Partial unique index ──────────────────────────────────────────
-- Cover only the live set so cancelled / dismissed rows don't block a
-- legitimate re-subscription. round(amount, 2) so penny-level jitter in
-- bank data doesn't defeat the constraint — Patreon at £6.00 and a
-- future £10.00 tier stay distinct, but two £6.00 rows can't coexist.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_live_one_per_provider_amount
  ON subscriptions (
    user_id,
    LOWER(COALESCE(provider_name, '')),
    ROUND(COALESCE(amount, 0)::numeric, 2)
  )
  WHERE status = 'active' AND dismissed_at IS NULL;
