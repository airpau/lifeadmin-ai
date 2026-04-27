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
CREATE OR REPLACE FUNCTION public.mark_internal_transfers(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marked integer := 0;
BEGIN
  -- Build candidate pairs: a negative-amount row (debit) on connection A
  -- and a positive-amount row (credit) on a DIFFERENT connection B owned
  -- by the same user, within the matching window, same magnitude.
  --
  -- Skip rows where the user has explicitly overridden the category
  -- (user_category set to anything except NULL/'transfers'/'internal_transfer'),
  -- because that's a stronger signal than our heuristic.
  WITH candidates AS (
    SELECT
      d.id              AS debit_id,
      c.id              AS credit_id,
      gen_random_uuid() AS pair_id
    FROM bank_transactions d
    JOIN bank_transactions c
      ON  c.user_id = d.user_id
      AND c.connection_id IS DISTINCT FROM d.connection_id
      AND c.amount > 0
      AND ABS(c.amount - ABS(d.amount)) <= 0.01
      AND (
        -- Primary: ±2 hours
        ABS(EXTRACT(EPOCH FROM (c.timestamp - d.timestamp))) <= 2 * 3600
        OR (
          -- BACS fallback: ±72 hours, only if either side looks BACS-shaped
          ABS(EXTRACT(EPOCH FROM (c.timestamp - d.timestamp))) <= 72 * 3600
          AND (public.is_bacs_shaped(d.description) OR public.is_bacs_shaped(c.description))
        )
      )
      AND c.transfer_pair_id IS NULL
      AND COALESCE(c.user_category, '') NOT IN ('income', 'salary', 'freelance',
                                                 'rental', 'benefits', 'pension',
                                                 'dividends', 'investment',
                                                 'refund', 'gift')
    WHERE d.user_id = p_user_id
      AND d.amount < 0
      AND d.transfer_pair_id IS NULL
      -- Don't overwrite a user override that says this isn't a transfer
      AND COALESCE(d.user_category, '') NOT IN ('mortgage', 'loan', 'loans',
                                                  'credit_card', 'debt_repayment',
                                                  'rent', 'insurance', 'utility',
                                                  'energy', 'water', 'broadband',
                                                  'mobile', 'council_tax', 'tax',
                                                  'fee', 'parking', 'groceries',
                                                  'fuel', 'eating_out', 'food',
                                                  'shopping')
  ),
  -- Greedy 1-to-1 pairing: each debit takes the closest-in-time credit.
  -- Avoids one credit being claimed by multiple debits and vice versa.
  ranked AS (
    SELECT debit_id, credit_id, pair_id,
           ROW_NUMBER() OVER (PARTITION BY debit_id  ORDER BY pair_id) AS d_rank,
           ROW_NUMBER() OVER (PARTITION BY credit_id ORDER BY pair_id) AS c_rank
    FROM candidates
  ),
  picked AS (
    SELECT * FROM ranked WHERE d_rank = 1 AND c_rank = 1
  ),
  applied AS (
    UPDATE bank_transactions bt
       SET user_category = 'internal_transfer',
           transfer_pair_id = p.pair_id,
           updated_at = NOW()
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
