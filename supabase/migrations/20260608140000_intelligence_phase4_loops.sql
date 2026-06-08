-- ---------------------------------------------------------------------------
-- Phase 4 — closed-loop triggers + verify cron tables
-- ---------------------------------------------------------------------------
-- Three additive pieces (no DROP, no ALTER existing schema):
--
-- 1. email_scan_findings → intelligence_events:
--    INSERT trigger: writes a scan_finding_emitted event per row.
--    UPDATE-of-status trigger: matches the existing event by finding_id and
--    attaches an outcome (action_taken | dismissed).
--    Effect: every scan path (Gmail, Outlook, IMAP, cron) contributes to
--    per-finding-kind conversion stats automatically.
--
-- 2. cancellation_tracking → intelligence_events:
--    INSERT trigger: writes a cancellation_drafted event with subject_id =
--    provider so the aggregator can compute per-provider cancellation
--    success rates.
--    UPDATE-of-status trigger: attaches the outcome (cancelled when status
--    becomes 'confirmed', failed_to_cancel when 'failed', etc.).
--
-- 3. dispute_correspondence → intelligence_events:
--    INSERT trigger: writes a supplier_response_received event (subject_id =
--    correspondence_type). On its own this isn't a closed loop — it's the
--    "outcome" half of letter_sent events (Phase 4 letter recipient
--    engagement). The dispute-agent records the letter_sent half elsewhere
--    via the existing flywheel.
--
-- Trigger functions all SET search_path = 'public' so they don't trip
-- supabase's "function search_path is mutable" linter.
-- ---------------------------------------------------------------------------

-- 1. email_scan_findings telemetry triggers
CREATE OR REPLACE FUNCTION public.fn_emit_scan_finding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.intelligence_events (
    user_id, actor, action_kind, subject_kind, subject_id,
    predicted, metadata
  ) VALUES (
    NEW.user_id,
    'system',
    'scan_finding_emitted',
    'scan_finding_kind',
    NEW.finding_type,
    jsonb_build_object(
      'finding_id',   NEW.id,
      'provider',     NEW.provider,
      'amount',       NEW.amount,
      'confidence',   NEW.confidence,
      'urgency',      NEW.urgency,
      'source',       NEW.source
    ),
    jsonb_build_object('source', 'email_scan_findings_trigger')
  );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_emit_scan_finding ON public.email_scan_findings;
CREATE TRIGGER trg_emit_scan_finding
  AFTER INSERT ON public.email_scan_findings
  FOR EACH ROW EXECUTE FUNCTION public.fn_emit_scan_finding();

CREATE OR REPLACE FUNCTION public.fn_outcome_scan_finding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_outcome text;
BEGIN
  -- Only react to status transitions that are real outcomes
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'actioned' THEN
    v_outcome := 'action_taken';
  ELSIF NEW.status = 'dismissed' THEN
    v_outcome := 'dismissed';
  ELSE
    RETURN NEW; -- 'pending' / 'new' / unknown — no outcome to record
  END IF;

  -- Find the matching scan_finding_emitted event by finding_id (it's in
  -- predicted->>finding_id). Use the most recent one for safety.
  UPDATE public.intelligence_events
     SET outcome_kind = v_outcome,
         outcome = jsonb_build_object('new_status', NEW.status, 'source', 'email_scan_findings_trigger'),
         measured_at = NOW()
   WHERE id = (
     SELECT id FROM public.intelligence_events
      WHERE action_kind = 'scan_finding_emitted'
        AND subject_kind = 'scan_finding_kind'
        AND (predicted->>'finding_id')::uuid = NEW.id
        AND outcome_kind IS NULL
      ORDER BY emitted_at DESC
      LIMIT 1
   );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_outcome_scan_finding ON public.email_scan_findings;
CREATE TRIGGER trg_outcome_scan_finding
  AFTER UPDATE OF status ON public.email_scan_findings
  FOR EACH ROW EXECUTE FUNCTION public.fn_outcome_scan_finding();

-- 2. cancellation_tracking telemetry triggers
CREATE OR REPLACE FUNCTION public.fn_emit_cancellation_drafted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.intelligence_events (
    user_id, actor, action_kind, subject_kind, subject_id,
    predicted, metadata
  ) VALUES (
    NEW.user_id,
    'ai',
    'cancellation_drafted',
    'merchant_cancellation',
    NEW.provider,
    jsonb_build_object(
      'cancellation_id', NEW.id,
      'subscription_id', NEW.subscription_id,
      'effective_date',  NEW.effective_date,
      'requested_at',    NEW.cancellation_requested_at
    ),
    jsonb_build_object('source', 'cancellation_tracking_trigger')
  );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_emit_cancellation_drafted ON public.cancellation_tracking;
CREATE TRIGGER trg_emit_cancellation_drafted
  AFTER INSERT ON public.cancellation_tracking
  FOR EACH ROW EXECUTE FUNCTION public.fn_emit_cancellation_drafted();

CREATE OR REPLACE FUNCTION public.fn_outcome_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_outcome text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'confirmed' THEN
    v_outcome := 'cancelled';
  ELSIF NEW.status = 'failed' THEN
    v_outcome := 'lost'; -- failed_to_cancel — re-uses 'lost' enum for digest
  ELSIF NEW.status = 'disputed' THEN
    v_outcome := 'escalated';
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.intelligence_events
     SET outcome_kind = v_outcome,
         outcome = jsonb_build_object(
           'new_status',    NEW.status,
           'effective_date', NEW.effective_date,
           'confirmation_detected_at', NEW.confirmation_detected_at,
           'source', 'cancellation_tracking_trigger'
         ),
         measured_at = NOW()
   WHERE id = (
     SELECT id FROM public.intelligence_events
      WHERE action_kind = 'cancellation_drafted'
        AND subject_kind = 'merchant_cancellation'
        AND (predicted->>'cancellation_id')::uuid = NEW.id
        AND outcome_kind IS NULL
      ORDER BY emitted_at DESC
      LIMIT 1
   );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_outcome_cancellation ON public.cancellation_tracking;
CREATE TRIGGER trg_outcome_cancellation
  AFTER UPDATE OF status ON public.cancellation_tracking
  FOR EACH ROW EXECUTE FUNCTION public.fn_outcome_cancellation();

-- 3. dispute_correspondence telemetry trigger (emit-only; the outcome
--    half — letter_sent → response_received — is recorded by the
--    dispute-agent at letter-send time, not by this trigger).
CREATE OR REPLACE FUNCTION public.fn_emit_supplier_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.intelligence_events (
    user_id, actor, action_kind, subject_kind, subject_id,
    predicted, metadata
  ) VALUES (
    NEW.user_id,
    'system',
    'supplier_response_received',
    'supplier_correspondence',
    COALESCE(NEW.correspondence_type, 'unknown'),
    jsonb_build_object(
      'correspondence_id', NEW.id,
      'dispute_id',        NEW.dispute_id,
      'provider',          NEW.provider,
      'email_date',        NEW.email_date,
      'suggested_action',  NEW.suggested_action
    ),
    jsonb_build_object('source', 'dispute_correspondence_trigger')
  );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_emit_supplier_response ON public.dispute_correspondence;
CREATE TRIGGER trg_emit_supplier_response
  AFTER INSERT ON public.dispute_correspondence
  FOR EACH ROW EXECUTE FUNCTION public.fn_emit_supplier_response();

-- ---------------------------------------------------------------------------
-- Phase 4 — onboarding step substrate
-- ---------------------------------------------------------------------------
-- Tiny helper RPC the onboarding wizard can call from a client component.
-- It writes one onboarding_step event scoped to the step name (start /
-- bank_connect / email_connect / preferences / done). The aggregator
-- already groups by subject_id so funnel drop-off computes for free.
--
-- Why an RPC rather than a route: the onboarding wizard already runs
-- client-side and we want zero new endpoints to authenticate. The RPC
-- uses auth.uid() so unauthenticated calls are no-ops.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_emit_onboarding_step(
  p_step text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- Never throw; just no-op for unauth callers.
    RETURN;
  END IF;
  INSERT INTO public.intelligence_events (
    user_id, actor, action_kind, subject_kind, subject_id,
    predicted, metadata
  ) VALUES (
    v_uid,
    'user',
    'onboarding_step',
    'onboarding_step_name',
    p_step,
    jsonb_build_object('ts', NOW()),
    COALESCE(p_metadata, '{}'::jsonb)
  );
END$$;

REVOKE EXECUTE ON FUNCTION public.fn_emit_onboarding_step(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_emit_onboarding_step(text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_emit_onboarding_step(text, jsonb) IS
  'Phase 4 onboarding funnel — clients call supabase.rpc(''fn_emit_onboarding_step'', { p_step, p_metadata }) at each wizard step. auth.uid() is the source of truth.';
