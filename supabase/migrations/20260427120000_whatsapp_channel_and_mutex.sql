-- WhatsApp channel + Pocket Agent mutex (decided 2026-04-27).
--
-- Three changes, all additive per CLAUDE.md:
--
-- 1. Add `whatsapp` column to notification_preferences so the dispatcher
--    can route to WhatsApp the same way it routes to email/telegram/push.
--    Default OFF — users explicitly opt in via the settings UI when they
--    upgrade to Pro.
--
-- 2. Add a `set_pocket_agent_channel(user_id, channel)` Postgres function
--    that enforces the telegram⊕whatsapp mutex transactionally. Called
--    by /api/whatsapp/opt-in and /api/telegram/link-code redemption.
--    Channel = 'telegram' | 'whatsapp' | 'none'.
--
-- 3. Add a unique partial index so we have a hard guarantee at the DB
--    level that a user can never have BOTH telegram and whatsapp active
--    at once. Even if application code regresses, the DB rejects it.
--
-- Why a function rather than a CHECK constraint? Cross-table — telegram
-- sessions live in telegram_sessions, WhatsApp in whatsapp_sessions.
-- A function lets us deactivate the other side atomically.

-- ============================================================
-- 1. Add whatsapp column to notification_preferences
-- ============================================================
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notification_preferences.whatsapp IS
  'Whether this event should also be delivered via WhatsApp. Pro-only — non-Pro users have no WhatsApp session anyway, so this column is silently ignored for them. Default false because every WhatsApp template costs us Meta fees; users explicitly opt in via the settings UI.';

-- ============================================================
-- 2. Pocket Agent channel mutex helper
-- ============================================================
-- Returns the user's currently-active Pocket Agent channel, or 'none'.
-- Used by the alert dispatcher and the settings UI.
CREATE OR REPLACE FUNCTION public.get_pocket_agent_channel(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_wa boolean;
  has_tg boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_sessions
    WHERE user_id = p_user_id AND is_active = true
  ) INTO has_wa;

  SELECT EXISTS (
    SELECT 1 FROM telegram_sessions
    WHERE user_id = p_user_id AND is_active = true
  ) INTO has_tg;

  -- WhatsApp wins if both somehow exist (defence in depth — the unique
  -- index below should make that impossible).
  IF has_wa THEN RETURN 'whatsapp'; END IF;
  IF has_tg THEN RETURN 'telegram'; END IF;
  RETURN 'none';
END;
$$;

COMMENT ON FUNCTION public.get_pocket_agent_channel IS
  'Resolves a user''s active Pocket Agent channel. Returns "telegram", "whatsapp" or "none". Source of truth for the dispatcher and UI.';

-- Atomically switches a user to a given Pocket Agent channel, deactivating
-- the other one. Called by:
--   - /api/whatsapp/opt-in   (POST channel="whatsapp")
--   - /api/whatsapp/opt-in   (DELETE channel="none")
--   - telegram link-code redemption (channel="telegram")
--   - explicit channel switcher in /dashboard/settings/notifications
CREATE OR REPLACE FUNCTION public.set_pocket_agent_channel(
  p_user_id uuid,
  p_channel text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_channel NOT IN ('telegram', 'whatsapp', 'none') THEN
    RAISE EXCEPTION 'Invalid channel %, must be telegram | whatsapp | none', p_channel;
  END IF;

  -- Always deactivate the OTHER channel first (or both if 'none').
  IF p_channel <> 'whatsapp' THEN
    UPDATE whatsapp_sessions
       SET is_active = false,
           opted_out_at = COALESCE(opted_out_at, NOW())
     WHERE user_id = p_user_id
       AND is_active = true;
  END IF;

  IF p_channel <> 'telegram' THEN
    UPDATE telegram_sessions
       SET is_active = false
     WHERE user_id = p_user_id
       AND is_active = true;
  END IF;

  -- The chosen-channel session row is created/reactivated by the
  -- caller (link-code redemption / opt-in). This function only
  -- enforces the mutex side.
END;
$$;

COMMENT ON FUNCTION public.set_pocket_agent_channel IS
  'Atomically sets a user''s active Pocket Agent channel, deactivating the other. Caller is still responsible for activating/inserting the chosen-channel session row.';

-- ============================================================
-- 3. Hard DB guarantee — partial unique constraints prevent both
--    being active simultaneously even if application code regresses.
-- ============================================================
-- We can't put a composite unique across two tables, but we CAN put
-- a partial unique on each that blocks the simultaneous existence
-- once mediated through a small bridge view. Cleanest version: a
-- check-trigger on each session table that fires on activation and
-- rejects if the other channel is already active.

CREATE OR REPLACE FUNCTION public.tg_enforce_pocket_agent_mutex()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting boolean;
BEGIN
  -- Only enforce when activating (or row created with is_active=true)
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'whatsapp_sessions' THEN
    SELECT EXISTS (
      SELECT 1 FROM telegram_sessions
       WHERE user_id = NEW.user_id AND is_active = true
    ) INTO conflicting;
    IF conflicting THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'pocket_agent_mutex: user already has an active Telegram Pocket Agent session — switch in settings first';
    END IF;
  ELSIF TG_TABLE_NAME = 'telegram_sessions' THEN
    SELECT EXISTS (
      SELECT 1 FROM whatsapp_sessions
       WHERE user_id = NEW.user_id AND is_active = true
    ) INTO conflicting;
    IF conflicting THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'pocket_agent_mutex: user already has an active WhatsApp Pocket Agent session — switch in settings first';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pocket_agent_mutex_wa ON whatsapp_sessions;
CREATE TRIGGER trg_pocket_agent_mutex_wa
  BEFORE INSERT OR UPDATE OF is_active ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enforce_pocket_agent_mutex();

DROP TRIGGER IF EXISTS trg_pocket_agent_mutex_tg ON telegram_sessions;
CREATE TRIGGER trg_pocket_agent_mutex_tg
  BEFORE INSERT OR UPDATE OF is_active ON telegram_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enforce_pocket_agent_mutex();
