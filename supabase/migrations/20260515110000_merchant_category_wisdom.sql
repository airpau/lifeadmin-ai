-- Merchant category wisdom — privacy-safe global learning (2026-05-15)
--
-- Stores normalised merchant_pattern → category mappings aggregated across all
-- users. NO user_id is stored — this is purely a merchant→category signal store.
-- When users recategorise transactions the pattern gains votes; at sync time new
-- transactions are auto-categorised when confidence is high enough.
-- ============================================================

-- ─── 1. Wisdom table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_category_wisdom (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern TEXT        NOT NULL UNIQUE,  -- normalised merchant name, lowercase
  suggested_category TEXT      NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL DEFAULT 0.5,  -- 0.000–1.000
  vote_count       INTEGER     NOT NULL DEFAULT 1,
  source           TEXT        NOT NULL DEFAULT 'user'
                              CHECK (source IN ('user', 'ai', 'system')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_category_wisdom_pattern_idx
  ON merchant_category_wisdom (merchant_pattern);

-- service_role can read and write; authenticated can only read
ALTER TABLE merchant_category_wisdom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcw_read ON merchant_category_wisdom;
CREATE POLICY mcw_read ON merchant_category_wisdom
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mcw_service ON merchant_category_wisdom;
CREATE POLICY mcw_service ON merchant_category_wisdom
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON merchant_category_wisdom TO authenticated;
GRANT SELECT, INSERT, UPDATE ON merchant_category_wisdom TO service_role;

-- ─── 2. RPC: upsert_merchant_wisdom ─────────────────────────────────────────
-- Called by the recategorise endpoint whenever a user changes a transaction's
-- category. Increments vote_count and recomputes confidence (capped at 0.99).
-- Uses Bayesian-style confidence: 1 − 1/(vote_count + 1)
CREATE OR REPLACE FUNCTION upsert_merchant_wisdom(
  p_pattern  TEXT,
  p_category TEXT,
  p_source   TEXT DEFAULT 'user'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO merchant_category_wisdom (merchant_pattern, suggested_category, confidence, vote_count, source)
  VALUES (
    lower(trim(p_pattern)),
    p_category,
    LEAST(1.0 - 1.0 / (1 + 1), 0.99),  -- confidence for vote_count=1
    1,
    p_source
  )
  ON CONFLICT (merchant_pattern) DO UPDATE
    SET suggested_category = CASE
          -- If same category: reinforce
          WHEN merchant_category_wisdom.suggested_category = p_category THEN p_category
          -- If different category and new vote_count would dominate: switch
          WHEN (merchant_category_wisdom.vote_count + 1) > merchant_category_wisdom.vote_count * 0.6 THEN p_category
          ELSE merchant_category_wisdom.suggested_category
        END,
        vote_count   = merchant_category_wisdom.vote_count + 1,
        confidence   = LEAST(1.0 - 1.0 / (merchant_category_wisdom.vote_count + 2), 0.99),
        updated_at   = now();
END;
$$;
GRANT EXECUTE ON FUNCTION upsert_merchant_wisdom(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ─── 3. Trigger: auto-learn on user_category update ──────────────────────────
-- Fires whenever bank_transactions.user_category is set (or changed), so the
-- learning happens automatically without changing the recategorise endpoint.
CREATE OR REPLACE FUNCTION trg_bank_txn_learn_category()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pattern TEXT;
BEGIN
  -- Only fire when user_category has meaningfully changed
  IF NEW.user_category IS NULL THEN RETURN NEW; END IF;
  IF OLD.user_category IS NOT DISTINCT FROM NEW.user_category THEN RETURN NEW; END IF;
  -- Skip system categories
  IF NEW.user_category IN ('income', 'transfers', 'other') THEN RETURN NEW; END IF;

  -- Build a normalised merchant pattern
  v_pattern := lower(trim(COALESCE(NEW.merchant_name, split_part(NEW.description, ' ', 1))));
  IF length(v_pattern) < 3 THEN RETURN NEW; END IF;  -- too short to be useful

  PERFORM upsert_merchant_wisdom(v_pattern, NEW.user_category, 'user');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bank_txn_learn_category ON bank_transactions;
CREATE TRIGGER bank_txn_learn_category
  AFTER UPDATE OF user_category ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION trg_bank_txn_learn_category();
