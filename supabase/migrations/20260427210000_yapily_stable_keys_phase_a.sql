-- Phase A of the Yapily-only foolproof dedup architecture (2026-04-27).
--
-- Goal: every transaction is uniquely keyed on the immutable real-world
-- identity of the bank account + the immutable shape of the transaction.
-- After this migration, even if a user reconnects the same bank ten times
-- via separate Yapily consents, the upsert path on (user, account_hash,
-- stable_tx_hash) is a no-op for every transaction the bank already
-- reported — duplicates can no longer be created.
--
-- Applied to prod 2026-04-27 via mcp__claude_ai_Supabase__apply_migration.
--
-- Two new columns on bank_transactions:
--
--   account_identifications_hash  TEXT
--     SHA256 hex of the upper-cased canonical account identifier.
--     UK accounts: SORT_CODE + ACCOUNT_NUMBER (digits only).
--     EU accounts: IBAN (no spaces).
--     Stable across consent renewals, reconnects, even across
--     aggregators — because it's derived from the underlying real-world
--     bank account, not the Yapily-issued account_id (which can change).
--
--   stable_tx_hash                TEXT
--     SHA256 hex of (account_identifications_hash + ISO date +
--     signed amount in pence + normalised description). Built from
--     immutable fields of the transaction. Two rows that describe the
--     same real-world payment will always hash to the same value, even
--     if Yapily issues different transaction_ids for them.
--
-- Three new columns on bank_connections to hold per-account identity:
--
--   account_identifications_hashes  TEXT[]
--     Aligned with account_ids — index N of this array is the hash of
--     the bank account at index N of account_ids. Lets us match an
--     incoming Yapily consent to an existing connection by underlying
--     real-world account identity, not by Yapily's transient ids.
--
--   institution_id              TEXT
--     The Yapily institution identifier (e.g. "natwest"). Combined with
--     user_id and the per-account hashes lets us answer "is this the
--     same bank the user already has connected?" deterministically,
--     even if Yapily's account_ids differ across consents.
--
--   yapily_consent_id           TEXT
--     The opaque Yapily consent identifier. Distinct from
--     bank_connections.id (our own UUID). Used by the re-authorise flow
--     so we can refresh an expired consent in place rather than
--     creating a new connection row.
--
-- We also add a partial unique index that PREVENTS duplicate
-- transactions at the database level. NULL stable_tx_hash rows
-- (legacy + TrueLayer rows being decommissioned) are exempt; the
-- constraint only bites for new Yapily rows that have a hash.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS account_identifications_hash TEXT,
  ADD COLUMN IF NOT EXISTS stable_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS signed_amount_pence BIGINT;

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS account_identifications_hashes TEXT[],
  ADD COLUMN IF NOT EXISTS institution_id TEXT,
  ADD COLUMN IF NOT EXISTS yapily_consent_id TEXT;

-- Partial unique index. NULL stable_tx_hash rows are excluded so
-- legacy + TrueLayer rows survive the migration intact. Once the TL
-- decommission is complete and every row has a hash, we can promote
-- this to a non-partial unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_stable_unique
  ON bank_transactions (user_id, account_identifications_hash, stable_tx_hash)
  WHERE deleted_at IS NULL
    AND account_identifications_hash IS NOT NULL
    AND stable_tx_hash IS NOT NULL;

-- Lookup index for "find the existing connection for this user +
-- institution + account hash" — the OAuth callback will use this to
-- decide whether to upsert in place or insert a new row.
CREATE INDEX IF NOT EXISTS bank_connections_user_institution_idx
  ON bank_connections (user_id, institution_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_connections_yapily_consent_idx
  ON bank_connections (yapily_consent_id)
  WHERE yapily_consent_id IS NOT NULL;

-- Lookup index for the new sync upsert path — given a (user, account
-- hash) pair we can find all transactions for that real-world account
-- across any consent.
CREATE INDEX IF NOT EXISTS bank_transactions_user_account_hash_idx
  ON bank_transactions (user_id, account_identifications_hash)
  WHERE account_identifications_hash IS NOT NULL;
