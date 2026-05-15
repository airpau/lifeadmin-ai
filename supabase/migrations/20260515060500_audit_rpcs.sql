-- Migration: 20260515060500_audit_rpcs
-- Audit RPCs called by the daily-audit cron route and audit-actions webhook.
-- All EXECUTE permission is revoked from anon and authenticated; only service_role
-- can call them. search_path is pinned (matches the hardening migration above).

CREATE OR REPLACE FUNCTION public.audit_db_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object(
    'active_price_alerts',  (SELECT COUNT(*) FROM price_increase_alerts WHERE status='active'),
    'open_disputes',        (SELECT COUNT(*) FROM disputes WHERE status NOT IN ('resolved_won','resolved_lost','closed')),
    'total_recovered_gbp',  COALESCE((SELECT SUM(recovered_amount_gbp) FROM disputes WHERE status='resolved_won'), 0)::text,
    'total_users',          (SELECT COUNT(*) FROM profiles),
    'founding_members',     (SELECT COUNT(*) FROM profiles WHERE founding_member = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_reappearing_dismissed_alerts()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH dismissed AS (
    SELECT user_id, merchant_normalized, MAX(updated_at) AS last_dismissed_at
    FROM price_increase_alerts
    WHERE status = 'dismissed'
    GROUP BY user_id, merchant_normalized
  )
  SELECT COUNT(*)::integer
  FROM price_increase_alerts a
  JOIN dismissed d
    ON d.user_id = a.user_id AND d.merchant_normalized = a.merchant_normalized
  WHERE a.status = 'active' AND a.created_at >= d.last_dismissed_at;
$$;

CREATE OR REPLACE FUNCTION public.audit_disputes_missing_recovered_gbp()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COUNT(*)::integer
  FROM disputes
  WHERE status = 'resolved_won'
    AND money_recovered IS NOT NULL
    AND money_recovered > 0
    AND recovered_amount_gbp IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.audit_won_disputes_unread_replies()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COUNT(*)::integer
  FROM disputes
  WHERE status IN ('resolved_won','resolved_lost','closed')
    AND unread_reply_count > 0;
$$;

-- Mutating: backfill recovered_amount_gbp from money_recovered + currency.
-- Assumes GBP-equivalent already lives on money_recovered when currency='GBP';
-- for non-GBP currencies the row is left alone (those need a real FX lookup).
CREATE OR REPLACE FUNCTION public.audit_backfill_recovered_gbp()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE disputes
     SET recovered_amount_gbp = money_recovered
   WHERE status = 'resolved_won'
     AND money_recovered IS NOT NULL
     AND money_recovered > 0
     AND recovered_amount_gbp IS NULL
     AND COALESCE(currency,'GBP') = 'GBP';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Re-dismiss any active alert that already has a dismissed sibling for the
-- same user+merchant. Equivalent to the manual fix the SKILL described.
CREATE OR REPLACE FUNCTION public.audit_dismiss_reappearing_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_updated integer;
BEGIN
  WITH dismissed AS (
    SELECT DISTINCT user_id, merchant_normalized
    FROM price_increase_alerts
    WHERE status = 'dismissed'
  )
  UPDATE price_increase_alerts a
     SET status = 'dismissed',
         updated_at = NOW(),
         notes = COALESCE(a.notes,'') || E'\n[auto] re-dismissed by audit: duplicate of prior dismissal'
    FROM dismissed d
   WHERE a.status = 'active'
     AND a.user_id = d.user_id
     AND a.merchant_normalized = d.merchant_normalized;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Lock down execution: only the service_role can call these.
REVOKE EXECUTE ON FUNCTION public.audit_db_snapshot()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_reappearing_dismissed_alerts()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_disputes_missing_recovered_gbp()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_won_disputes_unread_replies()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_backfill_recovered_gbp()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_dismiss_reappearing_alerts()       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.audit_db_snapshot()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_reappearing_dismissed_alerts()     TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_disputes_missing_recovered_gbp()   TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_won_disputes_unread_replies()      TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_backfill_recovered_gbp()           TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_dismiss_reappearing_alerts()       TO service_role;
