-- Document packs, warranties and vault price rises (stage three of the
-- documents work).
--
-- Strictly additive. New tables, new nullable columns, new functions and
-- one storage bucket limit raised. Nothing is removed and no existing
-- CHECK constraint is changed. No statement removes any object, so it
-- can be applied with the Supabase apply tool, and it is safe to run
-- twice.
--
-- Run after the four stage two migrations (20261003120000 to
-- 20261003120300), which are already in production.
--
-- 1. document_packs: a bundle the user builds from their vault (dispute
--    evidence, mortgage or lender pack, tax year pack, insurance claim
--    pack). The generated ZIP lives in the private `documents` bucket
--    under <user_id>/packs/, so the existing owner-only read policy
--    already covers it.
-- 2. document_share_links.pack_id: a share link with a pack_id opens ONLY
--    that pack (never the full register). NULL keeps today's meaning, an
--    accountant register link.
-- 3. documents.warranty_until, warranty_note, warranty_todoist_task_id:
--    the warranties and guarantees store. New columns rather than a new
--    doc_type, so the documents.doc_type CHECK is untouched.
-- 4. document_price_rises: year on year rises the vault finds in the
--    user's bills and renewals. Monthly bills are also fed into the
--    existing price_increase_alerts table by the application (see
--    docs/document-packs.md); this table is the record for all of them.
-- 5. document_pack_claim_build(): atomic "may this pack be built now"
--    check. One build per pack at a time, and the Free plan's monthly
--    build allowance counted under a per-user lock so two tabs cannot
--    both get the last build.
-- 6. The `documents` bucket's per-object limit goes from 15 MB to 100 MB
--    so a pack ZIP fits. Single documents are still capped at 15 MB in
--    application code (MAX_DOCUMENT_BYTES), so nothing else changes.

-- ---------------------------------------------------------------------------
-- 1. document_packs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_packs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Validated in application code (src/lib/documents/packs/registry.ts).
  -- No CHECK on purpose: a new pack type should not need a constraint
  -- change, which would mean replacing the constraint.
  pack_type            text NOT NULL,
  title                text NOT NULL,
  -- Pack options plus the user's manual choices (added_ids, removed_ids).
  params               jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'building', 'ready', 'failed')),
  -- The documents in the last preview or build, in bundle order.
  document_ids         uuid[] NOT NULL DEFAULT '{}'::uuid[],
  -- Checklist items that were not found at the last preview or build.
  missing              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The full checklist (found and missing) at the last preview or build.
  checklist            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The generated ZIP: <user_id>/packs/<pack_id>/<file>.zip in `documents`.
  storage_path         text,
  size_bytes           bigint,
  file_count           integer,
  error                text,
  generated_at         timestamptz,
  build_started_at     timestamptz,
  -- When this pack last used a monthly build allowance (Free plan cap).
  -- Kept when a pack is deleted, so deleting cannot reset the allowance.
  counted_build_at     timestamptz,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_packs_user_idx
  ON public.document_packs (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS document_packs_user_counted_idx
  ON public.document_packs (user_id, counted_build_at);

ALTER TABLE public.document_packs ENABLE ROW LEVEL SECURITY;

-- Owners may read their own packs. Every write is server side with the
-- service role. Policies are created once, guarded by a pg_policies
-- check so a second run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'document_packs' AND policyname = 'Users can view own document packs'
  ) THEN
    CREATE POLICY "Users can view own document packs"
      ON public.document_packs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.document_packs IS
  'Document packs built from the documents vault (dispute evidence, mortgage or lender, tax year, insurance claim). The ZIP lives in the private documents bucket under <user_id>/packs/. Written only by server routes.';

CREATE OR REPLACE FUNCTION public.document_packs_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_packs_updated_at
BEFORE UPDATE ON public.document_packs
FOR EACH ROW EXECUTE FUNCTION public.document_packs_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Share links for one pack
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_share_links
  ADD COLUMN IF NOT EXISTS pack_id uuid REFERENCES public.document_packs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS document_share_links_pack_idx
  ON public.document_share_links (pack_id)
  WHERE pack_id IS NOT NULL;

COMMENT ON COLUMN public.document_share_links.pack_id IS
  'When set, the link opens only this document pack at /shared/pack/<token> and is refused by the register pages. NULL = accountant register link.';

-- ---------------------------------------------------------------------------
-- 3. Warranties and guarantees
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS warranty_until date;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS warranty_note text;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS warranty_todoist_task_id text;

CREATE INDEX IF NOT EXISTS documents_user_warranty_idx
  ON public.documents (user_id, warranty_until)
  WHERE warranty_until IS NOT NULL AND status = 'active';

COMMENT ON COLUMN public.documents.warranty_until IS
  'Last day of the warranty or guarantee. Worked out from the purchase date and a length stated on the receipt, or set by the user.';

-- ---------------------------------------------------------------------------
-- 4. Price rises found in the vault
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_price_rises (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier             text NOT NULL,
  supplier_normalised  text NOT NULL,
  doc_type             text NOT NULL,
  -- How often the supplier bills: monthly, quarterly or annual.
  cadence              text NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'annual')),
  old_document_id      uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  new_document_id      uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  old_amount           numeric(12, 2) NOT NULL,
  new_amount           numeric(12, 2) NOT NULL,
  old_date             date NOT NULL,
  new_date             date NOT NULL,
  increase_pct         numeric(8, 2) NOT NULL,
  annual_increase      numeric(12, 2) NOT NULL,
  -- The price_increase_alerts row this was fed into (monthly bills only).
  price_alert_id       uuid,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- One finding per pair of documents, ever: a dismissed rise is not raised again.
CREATE UNIQUE INDEX IF NOT EXISTS document_price_rises_pair_key
  ON public.document_price_rises (user_id, old_document_id, new_document_id);

CREATE INDEX IF NOT EXISTS document_price_rises_user_idx
  ON public.document_price_rises (user_id, status, created_at DESC);

ALTER TABLE public.document_price_rises ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'document_price_rises' AND policyname = 'Users can view own document price rises'
  ) THEN
    CREATE POLICY "Users can view own document price rises"
      ON public.document_price_rises
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.document_price_rises IS
  'Year on year price rises found by comparing a supplier''s bills, statements and renewals in the documents vault. Pure computation, no AI. Monthly ones are also written to price_increase_alerts.';

CREATE OR REPLACE FUNCTION public.document_price_rises_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_price_rises_updated_at
BEFORE UPDATE ON public.document_price_rises
FOR EACH ROW EXECUTE FUNCTION public.document_price_rises_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Claim a pack build
-- ---------------------------------------------------------------------------
-- Returns jsonb:
--   {"result":"ok","counted":bool,"prev_counted_build_at":timestamptz|null}
--   {"result":"busy"}       another build of this pack is running
--   {"result":"quota"}      the monthly build allowance is used up
--   {"result":"not_found"}
-- p_monthly_limit NULL = unlimited. A pack already counted this month
-- can be rebuilt without using another build. p_stale_seconds: a
-- 'building' status older than this is treated as a crashed build.
CREATE OR REPLACE FUNCTION public.document_pack_claim_build(
  p_user_id uuid,
  p_pack_id uuid,
  p_monthly_limit integer,
  p_stale_seconds integer
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  r record;
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  used integer;
  will_count boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('document_packs_build:' || p_user_id::text, 0));

  SELECT status, build_started_at, counted_build_at
    INTO r
    FROM public.document_packs
   WHERE id = p_pack_id AND user_id = p_user_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF r.status = 'building'
     AND r.build_started_at IS NOT NULL
     AND r.build_started_at > now() - make_interval(secs => GREATEST(p_stale_seconds, 1)) THEN
    RETURN jsonb_build_object('result', 'busy');
  END IF;

  IF p_monthly_limit IS NOT NULL AND (r.counted_build_at IS NULL OR r.counted_build_at < month_start) THEN
    SELECT count(*) INTO used
      FROM public.document_packs
     WHERE user_id = p_user_id
       AND counted_build_at >= month_start;
    IF used >= p_monthly_limit THEN
      RETURN jsonb_build_object('result', 'quota');
    END IF;
    will_count := true;
  END IF;

  UPDATE public.document_packs
     SET status = 'building',
         build_started_at = now(),
         error = NULL,
         counted_build_at = CASE WHEN will_count THEN now() ELSE counted_build_at END
   WHERE id = p_pack_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'result', 'ok',
    'counted', will_count,
    'prev_counted_build_at', r.counted_build_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.document_pack_claim_build(uuid, uuid, integer, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.document_pack_claim_build(uuid, uuid, integer, integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.document_pack_claim_build(uuid, uuid, integer, integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.document_pack_claim_build(uuid, uuid, integer, integer) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Room for pack ZIPs in the documents bucket
-- ---------------------------------------------------------------------------
-- Only ever raises the limit (NULL already means no bucket limit and is
-- left alone). The Supabase project's global upload limit (Storage
-- settings) must also be at least 100 MB for the largest packs.
UPDATE storage.buckets
   SET file_size_limit = 104857600
 WHERE id = 'documents'
   AND file_size_limit IS NOT NULL
   AND file_size_limit < 104857600;
