-- Fix: add unique constraint on (user_id, category) so that
-- money_hub_budgets upsert with onConflict: 'user_id,category' works correctly.

CREATE UNIQUE INDEX IF NOT EXISTS idx_mhb_user_category
  ON money_hub_budgets(user_id, category);
