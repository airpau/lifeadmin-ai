-- Account Spaces: account-level membership.
--
-- The initial Spaces release (PR #216) let users pick which
-- bank_connections go into a Space, but a single connection can
-- hold multiple accounts (e.g. NatWest personal + NatWest business
-- under one consent). Users need finer-grained control to split
-- personal vs business when they share a connection.
--
-- Design: add an `account_refs text[]` column alongside the existing
-- `connection_ids uuid[]`. Each ref is `"<connection_id>:<account_id>"`
-- — same format the Money Hub already uses internally. Both arrays
-- are additive: the Space matches rows whose connection_id is in
-- connection_ids OR (connection_id, account_id) matches a ref.
--
-- connection_ids remains the "include all accounts on this bank"
-- shortcut. account_refs lets users split a bank between Spaces.

ALTER TABLE public.account_spaces
  ADD COLUMN IF NOT EXISTS account_refs text[] NOT NULL DEFAULT '{}';
