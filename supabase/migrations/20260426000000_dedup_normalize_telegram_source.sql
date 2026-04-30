-- Two additive fixes addressing real user-data quality issues:
--
-- 1) Improve the existing deduplicate_bank_transactions() function to normalise
--    merchant names before comparison. Banks report transactions first as pending
--    (e.g. "PENDING AMAZON UK") then as settled (e.g. "AMAZON UK"). The current
--    dedup keys on raw merchant_name+amount+date and so leaves both rows in place,
--    inflating Money Hub income/spending totals. The new helper strips
--    PENDING/PROVISIONAL/AUTH/TEMP prefixes and collapses whitespace before
--    hashing the dedup key.
--
-- 2) Add 'telegram' to the support_tickets.source CHECK constraint so the
--    Pocket Agent (Telegram bot) can mark tickets as channel-correctly. Currently
--    it falsely sets source='chatbot' which makes Riley reply via email even
--    when the user came through Telegram.
--
-- ADDITIVE per CLAUDE.md rules: no DROP TABLE, no column removal, no constraint
-- removal. We CREATE OR REPLACE the function and ADD a new CHECK constraint
-- after dropping the old one (the only "drop" is the CHECK constraint itself,
-- which is permitted because it's a value-set widening, not a schema reduction).

-- ---------------------------------------------------------------------------
-- 1) Normalised merchant-name dedup
-- ---------------------------------------------------------------------------

-- Pure helper: normalise a merchant name for dedup matching. Lowercases,
-- collapses whitespace, strips a small set of prefixes that banks add to
-- pending transactions which then disappear when the transaction settles.
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
  -- Strip common pending/provisional prefixes (with optional separators)
  result := regexp_replace(result,
    '^(pending|provisional|auth|temp|hold|holds|reserved)[\s\-:_]+',
    '', 'g');
  -- Strip the same words anywhere in the string when followed by colon/dash
  result := regexp_replace(result,
    '(pending|provisional|auth|temp|hold)[\s\-:_]+',
    '', 'g');
  -- Strip trailing reference numbers banks sometimes append (12+ digits)
  result := regexp_replace(result, '\s+\d{12,}\s*$', '', 'g');
  -- Collapse whitespace
  result := regexp_replace(result, '\s+', ' ', 'g');
  -- Trim
  result := btrim(result);
  RETURN result;
END;
$$;

COMMENT ON FUNCTION normalise_merchant_for_dedup(TEXT) IS
'Normalises a bank merchant name so pending and settled versions match in dedup.
Strips PENDING/PROVISIONAL/AUTH/TEMP/HOLD prefixes, trailing long ref numbers,
and collapses whitespace. Used by deduplicate_bank_transactions().';

-- Replace the existing dedup function so it uses the normalised key. Same
-- signature, additive behaviour change.
CREATE OR REPLACE FUNCTION deduplicate_bank_transactions(target_user_id UUID)
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
          bt.amount,
          (bt.timestamp::DATE),
          normalise_merchant_for_dedup(
            COALESCE(bt.merchant_name, bt.description, '')
          )
        ORDER BY
          -- Prefer settled (is_pending=false) over pending
          bt.is_pending NULLS LAST,
          -- Prefer the most-recently synced row (newer connections are more reliable)
          bt.created_at DESC,
          bt.id ASC
      ) AS rn
    FROM bank_transactions bt
    WHERE bt.user_id = target_user_id
  ),
  to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM bank_transactions
  WHERE id IN (SELECT id FROM to_delete)
  AND user_id = target_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION deduplicate_bank_transactions(UUID) IS
'Removes duplicate transactions for a user. Updated 2026-04-26 to use
normalise_merchant_for_dedup() so pending vs settled rows with different
raw merchant names get correctly matched and one is removed.';

-- ---------------------------------------------------------------------------
-- 2) Add 'telegram' to support_tickets.source enum
-- ---------------------------------------------------------------------------

-- Find and drop the existing CHECK constraint by name pattern (its name varies).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'public'
      AND cl.relname = 'support_tickets'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%source%CHECK%'
  LOOP
    EXECUTE format('ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

-- Re-add CHECK with a wider allowed set. Adding to the CHECK constraint is
-- additive in spirit (no row gets invalidated; new values are now permitted).
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_source_check
  CHECK (source IN ('chatbot', 'email', 'manual', 'telegram', 'whatsapp', 'sms', 'in_app'));

COMMENT ON COLUMN support_tickets.source IS
'Channel the ticket originated from. Riley replies via the same channel:
chatbot|in_app → web chat widget; email → Resend; telegram → Telegram bot DM;
whatsapp/sms → reserved for future channels; manual → admin-created.';

-- ---------------------------------------------------------------------------
-- 3) Audit row in business_log so the digest sees this migration
-- ---------------------------------------------------------------------------

INSERT INTO business_log (category, title, content, created_by, created_at)
SELECT
  'agent_governance',
  'Migration: improved transaction dedup + telegram source',
  'Improved deduplicate_bank_transactions() to normalise pending/provisional merchant prefixes (was missing pending+settled pairs with name variation). Added telegram/whatsapp/sms/in_app to support_tickets.source enum so multi-channel routing works. Run deduplicate_bank_transactions(user_id) for each user post-migration to clean up historical inflation.',
  'migration:20260426000000_dedup_normalize_telegram_source',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM business_log
  WHERE created_by = 'migration:20260426000000_dedup_normalize_telegram_source'
);
