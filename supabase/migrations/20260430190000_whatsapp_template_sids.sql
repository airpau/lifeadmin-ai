-- WhatsApp template SID storage — runtime-mutable mapping of template_name → SID
-- + Meta approval status. Registry (src/lib/whatsapp/template-registry.ts) holds
-- compile-time bodies + fallback SIDs; this table holds the live SIDs the
-- /api/admin/whatsapp/resubmit-pending route writes when the founder kicks off
-- a fresh Meta approval cycle. Daily cron polls Twilio Content API and updates
-- approval_status; dispatch path skips templates whose status != 'approved'.
-- Strictly additive.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_sids (
  template_name TEXT PRIMARY KEY,
  sid TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','paused','unknown')),
  category TEXT NOT NULL DEFAULT 'UTILITY',
  language TEXT NOT NULL DEFAULT 'en',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  last_status_check_at TIMESTAMPTZ,
  last_error TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_sids_status
  ON public.whatsapp_template_sids(approval_status, submitted_at DESC);

ALTER TABLE public.whatsapp_template_sids ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_only" ON public.whatsapp_template_sids
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
