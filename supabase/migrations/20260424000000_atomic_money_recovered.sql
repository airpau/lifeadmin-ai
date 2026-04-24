-- Atomic increment helper for profiles.total_money_recovered.
--
-- Previously the PATCH /api/subscriptions/[id] handler did a read-modify-write:
--   SELECT total_money_recovered -> UPDATE SET total_money_recovered = current + delta
-- This race-conditions when two cancellations land concurrently (each reads the
-- old value, each writes its own sum, the later write clobbers the earlier).
--
-- Use this RPC instead so the increment happens inside a single SQL statement
-- under Postgres's row locks.

CREATE OR REPLACE FUNCTION increment_money_recovered(
  p_user_id UUID,
  p_amount DECIMAL
)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total DECIMAL;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SELECT total_money_recovered INTO v_new_total FROM profiles WHERE id = p_user_id;
    RETURN COALESCE(v_new_total, 0);
  END IF;

  UPDATE profiles
  SET total_money_recovered = COALESCE(total_money_recovered, 0) + p_amount
  WHERE id = p_user_id
  RETURNING total_money_recovered INTO v_new_total;

  RETURN COALESCE(v_new_total, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_money_recovered(UUID, DECIMAL) TO authenticated;
