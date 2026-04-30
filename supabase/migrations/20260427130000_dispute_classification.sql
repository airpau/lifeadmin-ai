-- ============================================================
-- Dispute classification (2026-04-27)
--
-- Adds is_disputable_category() — mirrors classifyDispute() in
-- src/lib/category-taxonomy.ts — and stamps every existing
-- price_increase_alerts row with its classification.
--
-- Going forward, the cron + on-demand detect endpoint will set the
-- column at insert time so the Action Centre can render three
-- distinct sections without re-classifying client-side:
--
--   disputable  - has a credible UK consumer-rights / regulator hook
--   track_only  - real but not disputable (council tax, mortgage,
--                 HMRC, fees, etc.)
--   unknown     - couldn't classify confidently
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispute_classification(p_category text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_category IS NULL OR TRIM(p_category) = '' THEN 'unknown'
    ELSE (
      WITH normalised AS (
        SELECT CASE LOWER(TRIM(p_category))
          WHEN 'mortgages'    THEN 'mortgage'
          WHEN 'loans'        THEN 'loan'
          WHEN 'credit cards' THEN 'credit_card'
          WHEN 'credit-cards' THEN 'credit_card'
          WHEN 'credit'       THEN 'credit_card'
          WHEN 'car finance'  THEN 'car_finance'
          WHEN 'car-finance'  THEN 'car_finance'
          WHEN 'fees'         THEN 'fee'
          WHEN 'utilities'    THEN 'utility'
          WHEN 'bank_transfer' THEN 'transfers'
          WHEN 'transfer'      THEN 'transfers'
          WHEN 'bill_payment'  THEN 'bills'
          WHEN 'billpayment'   THEN 'bills'
          WHEN 'bill-payment'  THEN 'bills'
          WHEN 'dining'        THEN 'eating_out'
          WHEN 'restaurants'   THEN 'eating_out'
          WHEN 'supermarkets'  THEN 'groceries'
          WHEN 'supermarket'   THEN 'groceries'
          ELSE LOWER(TRIM(p_category))
        END AS canonical
      )
      SELECT CASE
        WHEN n.canonical IN (
          'energy', 'water', 'broadband', 'mobile', 'utility',
          'insurance',
          'streaming', 'software', 'fitness',
          'gaming', 'music', 'storage',
          'pets', 'security', 'credit_monitoring'
        ) THEN 'disputable'
        WHEN n.canonical IN (
          'mortgage', 'loan', 'credit_card', 'car_finance', 'debt_repayment',
          'council_tax', 'tax', 'fee', 'parking', 'rent',
          -- internal transfer / income variants — these shouldn't be alerts
          -- in the first place, but if they slip through the detector, mark
          -- them as track-only so the UI doesn't surface a "Start dispute"
          -- button on a transfer-to-self.
          'transfers', 'internal_transfer',
          'income', 'salary', 'freelance', 'rental', 'benefits',
          'pension', 'dividends', 'investment', 'refund', 'gift',
          'loan_repayment'
        ) THEN 'track_only'
        ELSE 'unknown'
      END
      FROM normalised n
    )
  END;
$$;

COMMENT ON FUNCTION public.dispute_classification(text) IS
  'Returns disputable | track_only | unknown for a category. Mirrors classifyDispute() in src/lib/category-taxonomy.ts.';

-- Add the column to price_increase_alerts. Idempotent.
ALTER TABLE price_increase_alerts
  ADD COLUMN IF NOT EXISTS dispute_classification TEXT
    CHECK (dispute_classification IN ('disputable', 'track_only', 'unknown'));

-- Backfill existing rows. Pulls the canonical category off the alert (or
-- looks at merchant_normalized as a fallback heuristic for older rows
-- without a category set).
UPDATE price_increase_alerts
SET dispute_classification = public.dispute_classification(
  COALESCE(NULLIF(category, ''),
    -- Cheap heuristic for older rows: peek at the merchant string
    CASE
      WHEN merchant_normalized ILIKE '%council%tax%' THEN 'council_tax'
      WHEN merchant_normalized ILIKE '%hmrc%'        THEN 'tax'
      WHEN merchant_normalized ILIKE '%mortgage%'    THEN 'mortgage'
      WHEN merchant_normalized ILIKE '%loan%'        THEN 'loan'
      WHEN merchant_normalized ~* '\m(funding circle|klarna)\M' THEN 'loan'
      ELSE NULL
    END)
)
WHERE dispute_classification IS NULL;

-- Trigger so future inserts get classification automatically — keeps the
-- /api/cron/price-increases and /api/price-alerts/detect routes from
-- having to remember to populate the column.
CREATE OR REPLACE FUNCTION public.set_price_alert_classification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dispute_classification IS NULL THEN
    NEW.dispute_classification := public.dispute_classification(NEW.category);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_price_alert_classification ON price_increase_alerts;
CREATE TRIGGER trg_set_price_alert_classification
  BEFORE INSERT ON price_increase_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_price_alert_classification();

CREATE INDEX IF NOT EXISTS idx_price_alerts_classification
  ON price_increase_alerts (user_id, status, dispute_classification);
