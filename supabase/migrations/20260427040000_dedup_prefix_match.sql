-- Tighter bank-transaction dedup: match by description PREFIX
-- instead of full normalised string.
--
-- Backstory: Yapily/TrueLayer sometimes ingest the same banking event
-- twice with different descriptions — first sync gives a truncated
-- one ("SOURCED NETWORK LI"), second sync gives the full one
-- ("SOURCED NETWORK LIAIRPROP LTD VIA MOBILE - PYMT"). They have
-- different provider transaction_ids, same amount, same date, same
-- account. The 27 Apr digest reported £20,733 of weekly spending of
-- which £16,000 was duplicate £8,000 + £700 + £700 + £700 + £500
-- variants of the same actual events.
--
-- The previous dedup function (introduced 26 Apr) normalised case +
-- whitespace + pending-prefix but kept the full description as the
-- partition key — so the truncated and full versions hashed
-- differently and slipped through.
--
-- New approach: normalise THEN take the first 12 alphanumeric
-- characters as the dedup token. Both descriptions above collapse to
-- "sourcednetw" which matches. Combined with the (user_id,
-- account_id, amount, date) parts of the partition this is unique
-- enough — the chance of two real transactions sharing the same
-- amount + date + account + first-12-letters-of-description is
-- vanishingly small in practice.
--
-- Also adds account_id to the partition so a £10 Costa transaction
-- and a £10 Pret transaction on the same day from the same account
-- still keep both rows (their first-12 differ).

CREATE OR REPLACE FUNCTION normalise_merchant_for_dedup(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result TEXT;
BEGIN
  IF raw IS NULL THEN
    RETURN '';
  END IF;
  result := lower(raw);
  result := regexp_replace(result,
    '^(pending|provisional|auth|temp|hold|holds|reserved)[\s\-:_]+',
    '', 'g');
  result := regexp_replace(result,
    '(pending|provisional|auth|temp|hold)[\s\-:_]+',
    '', 'g');
  -- Strip trailing reference numbers banks sometimes append (12+ digits)
  result := regexp_replace(result, '\s+\d{12,}\s*$', '', 'g');
  -- Strip non-alphanumeric so the prefix comparison is tight
  result := regexp_replace(result, '[^a-z0-9]', '', 'g');
  -- First 12 alphanumeric characters — enough to disambiguate Costa
  -- from Pret while still matching truncated vs full descriptions
  -- of the same actual transaction.
  result := substr(result, 1, 12);
  RETURN result;
END;
$$;

COMMENT ON FUNCTION normalise_merchant_for_dedup(TEXT) IS
'Normalises a bank merchant description to a 12-char alphanumeric
prefix for dedup matching. Catches truncated vs full versions of the
same banking event (e.g. "SOURCED NETWORK LI" and "SOURCED NETWORK
LIAIRPROP LTD VIA MOBILE - PYMT" both → "sourcednetw").';

-- Tighten the partition: include account_id so multi-account users
-- don't have a Costa from Account A merged with a Costa from Account B.
CREATE OR REPLACE FUNCTION deduplicate_bank_transactions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH ranked AS (
    SELECT
      bt.id,
      ROW_NUMBER() OVER (
        PARTITION BY
          bt.user_id,
          bt.account_id,
          bt.amount,
          (bt.timestamp::DATE),
          normalise_merchant_for_dedup(
            COALESCE(bt.merchant_name, bt.description, '')
          )
        ORDER BY
          -- Prefer settled (is_pending=false) over pending
          bt.is_pending NULLS LAST,
          -- Prefer the row with the longer description — banks
          -- progressively reveal more detail as transactions settle.
          length(COALESCE(bt.description, '')) DESC,
          -- Prefer the most-recently synced row
          bt.created_at DESC,
          bt.id ASC
      ) AS rn
    FROM bank_transactions bt
    WHERE bt.user_id = p_user_id
  ),
  to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM bank_transactions
  WHERE id IN (SELECT id FROM to_delete)
  AND user_id = p_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION deduplicate_bank_transactions(UUID) IS
'Per-user dedup. Partitions by (user_id, account_id, amount, date,
normalised-12-char-merchant-prefix) and keeps the row with the
longer description (more detail). Returns rows deleted.';

-- ---------------------------------------------------------------------------
-- One-off cleanup: dedupe every user whose dedup gate was previously
-- broken (callers were passing `p_user_id` but the function declared
-- `target_user_id`, so the RPC has been silently no-op'ing since the
-- 26 Apr migration). Iterate per user — running over all rows in one
-- shot is fine on a 6-figure table but per-user keeps lock scope tight.
DO $$
DECLARE
  uid UUID;
  total_deleted BIGINT := 0;
  per_user INT;
BEGIN
  FOR uid IN
    SELECT DISTINCT user_id FROM bank_transactions
  LOOP
    per_user := deduplicate_bank_transactions(uid);
    total_deleted := total_deleted + per_user;
  END LOOP;
  RAISE NOTICE 'dedup_prefix_match: deleted % duplicate transactions across all users', total_deleted;
END $$;
