-- Founder-editable monthly cost estimates for services that don't expose
-- a billing API or are dashboard-only (Google Ads, Yapily, accountant,
-- insurance, etc.). The admin Business Costs tab reads this table
-- alongside api_cost_ledger to give a complete monthly burn picture.

CREATE TABLE IF NOT EXISTS public.manual_cost_estimates (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  category TEXT,
  monthly_estimate_gbp NUMERIC(10,2) NOT NULL,
  notes TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_cost_estimates_category
  ON public.manual_cost_estimates(category);

ALTER TABLE public.manual_cost_estimates ENABLE ROW LEVEL SECURITY;

-- Read/write is service-role only — the admin Business Costs tab uses
-- the service-role client behind the founder-email auth gate.
DROP POLICY IF EXISTS "manual_cost_estimates_service_role"
  ON public.manual_cost_estimates;
CREATE POLICY "manual_cost_estimates_service_role"
  ON public.manual_cost_estimates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
