-- Per-account balances and real account types.
--
-- WHY THIS EXISTS
--
-- Paybacker has never had a per-account table: accounts live as the
-- parallel arrays account_ids / account_display_names on bank_connections,
-- and balances are stored once per CONNECTION. That is fine for a personal
-- current account. It breaks the moment a connection carries mixed account
-- kinds.
--
-- Live example that forced this (23 Aug 2026): the JPG Operations Ltd
-- HSBC Business connection returns FOUR accounts — a trading current
-- account, a savings account, two loans and a credit card. Summing
-- current_balance across them produces a figure that is not any real
-- quantity: it nets a loan liability against cash in the bank. "Available
-- balance today" would have been badly, confidently wrong.
--
-- The existing type inference cannot save us either. inferAccountType()
-- in /api/mcp/accounts reads the Yapily display name, and HSBC returns the
-- SAME name for all four accounts ("JPG OPERATIONS LIMITED"). The type
-- signal only exists in Yapily's accountType / usageType fields, which the
-- codebase reads (src/types/yapily.ts) but has never persisted — they are
-- currently used for exactly one thing, filtering out Monzo POTs.
--
-- So: store balances at the grain they actually belong to, and keep the
-- account type Yapily gave us instead of guessing from a name.
--
-- bank_connections.current_balance / available_balance are RETAINED and
-- still written, but from now on they are a CASH-ONLY roll-up (current +
-- savings), never a blind sum. Six existing read sites depend on those
-- columns and none of them are touched by this change.
--
-- Strictly additive. No DROP, no column removal.

CREATE TABLE IF NOT EXISTS bank_account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,

  -- Yapily's account id. Never exposed raw over the MCP surface; the API
  -- masks it to the last 4 characters, same as /api/mcp/accounts already does.
  account_id TEXT NOT NULL,
  display_name TEXT,

  -- Straight from Yapily. accountType is the product kind (CURRENT_ACCOUNT,
  -- SAVINGS, CREDIT_CARD, LOAN, MORTGAGE...); usage_type is PERSONAL vs
  -- BUSINESS. Nullable because not every institution returns them.
  account_type TEXT,
  usage_type TEXT,

  -- Normalised bucket derived from the two above: 'cash' (counts towards
  -- spendable money), 'liability' (loan / credit card / mortgage) or
  -- 'unknown'. Only 'cash' rolls up into the connection-level balance.
  balance_class TEXT NOT NULL DEFAULT 'unknown'
    CHECK (balance_class IN ('cash', 'liability', 'unknown')),

  currency TEXT NOT NULL DEFAULT 'GBP',
  current_balance NUMERIC,
  available_balance NUMERIC,
  balance_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (connection_id, account_id)
);

COMMENT ON TABLE bank_account_balances IS
  'Per-account balances and Yapily-reported account types. Added 23 Aug 2026 because bank_connections stores ONE balance per connection, which is meaningless on a connection mixing a current account with loans and a credit card.';

COMMENT ON COLUMN bank_account_balances.balance_class IS
  'cash = spendable (current/savings); liability = loan, credit card, mortgage. Only cash accounts roll up into bank_connections.current_balance. A liability balance must never be netted against cash without an explicit decision to do so.';

CREATE INDEX IF NOT EXISTS idx_bank_account_balances_user
  ON bank_account_balances (user_id);

CREATE INDEX IF NOT EXISTS idx_bank_account_balances_connection
  ON bank_account_balances (connection_id);

ALTER TABLE bank_account_balances ENABLE ROW LEVEL SECURITY;

-- Owner can read their own balances. Writes are service-role only (the
-- sync cron), so no INSERT/UPDATE policy is defined — deliberately, and
-- matching how mcp_tokens restricts mutation.
DROP POLICY IF EXISTS "bank_account_balances_select_own" ON bank_account_balances;
CREATE POLICY "bank_account_balances_select_own"
  ON bank_account_balances FOR SELECT
  USING (auth.uid() = user_id);
