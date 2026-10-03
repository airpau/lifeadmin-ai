-- Documents vault: an atomic monthly cap and a per-user single-flight lock.
--
-- Strictly additive: one nullable column, one trigger, one table, three
-- functions. Run after 20261003120000_documents_vault.sql.
--
-- 1. Monthly cap (Free: 20 documents a calendar month, UTC).
--    The app sets documents.quota_limit_at_insert on an insert for a
--    capped plan. A BEFORE INSERT trigger then takes a per-user
--    transaction-scoped advisory lock, counts this month's rows for the
--    user (deleted ones included, matching the app), and refuses the
--    insert with 'document_quota_exceeded' when the cap is reached.
--    Each PostgREST insert is its own transaction, so concurrent inserts
--    for the same user queue on the lock and the second one sees the
--    first one's row. Rows inserted with a NULL limit (paid plans,
--    revives) are not checked.
--
-- 2. Single-flight lock. document_run_lock_acquire() claims a per-user
--    lock row with an expiry in one statement, so two "Find my documents"
--    presses (or a press and the daily cron) cannot run at once and
--    classify the same file twice. An expired lock is taken over, so a
--    crashed run never blocks the user for longer than its TTL.
--
-- The functions are callable by the service role only.

-- ---------------------------------------------------------------------------
-- 1. Monthly cap
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS quota_limit_at_insert integer;

COMMENT ON COLUMN public.documents.quota_limit_at_insert IS
  'Monthly document cap in force when the row was inserted (NULL = uncapped plan). Checked atomically by documents_enforce_monthly_cap().';

CREATE OR REPLACE FUNCTION public.documents_enforce_monthly_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  used integer;
BEGIN
  IF NEW.quota_limit_at_insert IS NULL THEN
    RETURN NEW;
  END IF;
  -- Serialise this user's capped inserts until the transaction ends.
  PERFORM pg_advisory_xact_lock(hashtextextended('documents_cap:' || NEW.user_id::text, 0));
  SELECT count(*) INTO used
    FROM public.documents
   WHERE user_id = NEW.user_id
     AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF used >= NEW.quota_limit_at_insert THEN
    RAISE EXCEPTION 'document_quota_exceeded'
      USING ERRCODE = 'P0001', HINT = 'Monthly documents cap reached for this plan.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_monthly_cap ON public.documents;
CREATE TRIGGER documents_monthly_cap
BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_enforce_monthly_cap();

-- ---------------------------------------------------------------------------
-- 2. Single-flight lock per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_run_locks (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  holder        text NOT NULL,
  locked_until  timestamptz NOT NULL,
  acquired_at   timestamptz NOT NULL DEFAULT now()
);

-- Service role only: no end-user policies.
ALTER TABLE public.document_run_locks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.document_run_locks IS
  'One row per user while a documents run (Find my documents, Drive import, daily cron) is in progress. Taken over when locked_until has passed.';

-- Returns true when the lock was taken (or was already expired and has
-- been taken over), false when another run holds it.
CREATE OR REPLACE FUNCTION public.document_run_lock_acquire(p_user_id uuid, p_holder text, p_ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  got uuid;
BEGIN
  INSERT INTO public.document_run_locks AS l (user_id, holder, locked_until, acquired_at)
  VALUES (p_user_id, p_holder, now() + make_interval(secs => GREATEST(p_ttl_seconds, 1)), now())
  ON CONFLICT (user_id) DO UPDATE
     SET holder = EXCLUDED.holder,
         locked_until = EXCLUDED.locked_until,
         acquired_at = EXCLUDED.acquired_at
   WHERE l.locked_until < now()
  RETURNING l.user_id INTO got;
  RETURN got IS NOT NULL;
END;
$$;

-- Releases only a lock this holder owns.
CREATE OR REPLACE FUNCTION public.document_run_lock_release(p_user_id uuid, p_holder text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.document_run_locks WHERE user_id = p_user_id AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION public.document_run_lock_acquire(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_run_lock_release(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.documents_enforce_monthly_cap() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.document_run_lock_acquire(uuid, text, integer) FROM anon;
    REVOKE ALL ON FUNCTION public.document_run_lock_release(uuid, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.document_run_lock_acquire(uuid, text, integer) FROM authenticated;
    REVOKE ALL ON FUNCTION public.document_run_lock_release(uuid, text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.document_run_lock_acquire(uuid, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.document_run_lock_release(uuid, text) TO service_role;
  END IF;
END $$;
