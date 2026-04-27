-- ============================================================
-- Pair-matched internal transfers (2026-04-27)
--
-- Detects own-account-to-own-account movements by finding debit/credit
-- pairs across a user's connected bank accounts. Sets
-- `user_category = 'internal_transfer'` and stamps both rows with the
-- same `transfer_pair_id` so the UI can show "this matches +£500 on
-- Halifax" etc.
--
-- Matching window:
--   - Primary: ±2 hours (Faster Payments — 99% of own-account moves
--     settle in seconds; widening invites false positives where two
--     unrelated transactions are coincidentally the same amount)
--   - BACS/standing-order fallback: ±72 hours, but ONLY when the
--     description on either side contains a strong BACS marker
--     (s/o, standing order, bacs, savings, isa). This catches own-
--     account drips without widening the window for everything else.
--   - Amount tolerance: ±£0.01 (FP/standing orders are penny-exact)
--
-- Idempotent: safe to re-run. Only sets internal_transfer on rows
-- that don't already have a user override and aren't already paired.
-- ============================================================

-- Add the linking column. Index on user+pair so we can pull pairs back
-- in the UI without scanning.
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id UUID;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_transfer_pair
  ON bank_transactions (user_id, transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

-- Recognise BACS-shaped rows: standing orders, savings drips, ISA top-ups.
-- Used to widen the matching window from ±2h to ±72h.
CREATE OR REPLACE FUNCTION public.is_bacs_shaped(p_description text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT p_description IS NOT NULL
     AND p_description ~* '\m(s/o|standing\s*order|bacs|savings|\bisa\b)\M';
$$;

-- Match debit→credit pairs across the user's own connected accounts.
-- Returns the number of rows freshly marked as internal_transfer.
--
-- Matching rules:
--   * different connection_id, same user
--   * amount within ±£0.01
--   * timestamp within ±2h (FP) or ±72h (BACS-shaped descriptions)
--   * eligibility: only rows whose user_category is NULL / empty / already
--     'transfers' or 'internal_transfer'. Anything else is a user-asserted
--     category and must NEVER be silently overwritten by the heuristic
--     (per Codex review: a partial denylist let categories like 'streaming'
--     or 'charity' get overwritten by an amount/time coincidence).
--
-- Greedy 1-to-1 pairing ranked by absolute time distance with a
-- transaction-id tiebreaker — re-runs against the same data always pick
-- the same pairing (per Codex review: random UUID ranking made pairing
-- non-deterministic across runs).
CREATE OR REPLACE FUNCTION public.mark_internal_transfers(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marked integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      d.id              AS debit_id,
      c.id              AS credit_id,
      gen_random_uuid() AS pair_id,
      ABS(EXTRACT(EPOCH FROM (c.timestamp - d.timestamp))) AS time_distance_sec
    FROM bank_transactions d
    JOIN bank_transactions c
      ON  c.user_id = d.user_id
      AND c.connection_id IS DISTINCT FROM d.connection_id
      AND c.amount > 0
      AND ABS(c.amount - ABS(d.amount)) <= 0.01
      AND (
        ABS(EXTRACT(EPOCH FROM (c.timestamp - d.timestamp))) <= 2 * 3600
        OR (
          ABS(EXTRACT(EPOCH FROM (c.timestamp - d.timestamp))) <= 72 * 3600
          AND (public.is_bacs_shaped(d.description) OR public.is_bacs_shaped(c.description))
        )
      )
      AND c.transfer_pair_id IS NULL
      -- Allowlist: only consider rows that are uncategorised or already
      -- transfer-shaped. Any other user_category is user-asserted and
      -- must not be overwritten.
      AND (c.user_category IS NULL OR c.user_category = ''
           OR c.user_category IN ('transfers', 'internal_transfer'))
    WHERE d.user_id = p_user_id
      AND d.amount < 0
      AND d.transfer_pair_id IS NULL
      AND (d.user_category IS NULL OR d.user_category = ''
           OR d.user_category IN ('transfers', 'internal_transfer'))
  ),
  -- Rank by absolute timestamp distance (closest pair wins) with a
  -- deterministic id tiebreaker, so identical input data always
  -- produces identical pairings.
  ranked AS (
    SELECT debit_id, credit_id, pair_id,
           ROW_NUMBER() OVER (
             PARTITION BY debit_id
             ORDER BY time_distance_sec ASC, credit_id ASC
           ) AS d_rank,
           ROW_NUMBER() OVER (
             PARTITION BY credit_id
             ORDER BY time_distance_sec ASC, debit_id ASC
           ) AS c_rank
    FROM candidates
  ),
  picked AS (
    SELECT * FROM ranked WHERE d_rank = 1 AND c_rank = 1
  ),
  applied AS (
    UPDATE bank_transactions bt
       SET user_category = 'internal_transfer',
           transfer_pair_id = p.pair_id
      FROM picked p
     WHERE bt.id IN (p.debit_id, p.credit_id)
    RETURNING bt.id
  )
  SELECT COUNT(*) / 2 INTO v_marked FROM applied;

  RETURN v_marked;
END;
$$;

COMMENT ON FUNCTION public.mark_internal_transfers(uuid) IS
  'Pair-matches debit/credit across user''s connected accounts (±2h FP / ±72h BACS) and marks both as internal_transfer. Idempotent.';
