-- Compliance alerts dedup table (PR ζ)
-- Tracks which compliance email alerts have already been sent so the
-- urgent-alert path is idempotent. Alert keys are deterministic strings
-- like "ref-broke:<ref_id>" or "category-flood:energy:2026-04-30".
--
-- Additive only — never DROP. Daily digest does NOT use this table
-- (digest sends one email per day unconditionally).

CREATE TABLE IF NOT EXISTS public.compliance_alerts_sent (
  id BIGSERIAL PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT NOT NULL DEFAULT 'email',
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_compliance_alerts_sent_sent_at
  ON public.compliance_alerts_sent (sent_at DESC);
