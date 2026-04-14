-- Deduplication Engine for Bank Transactions
-- Focuses on mitigating TrueLayer -> Yapily migration overlaps and multiple identical connections resolving the excessive monthly expenditure bugs.

CREATE OR REPLACE FUNCTION deduplicate_bank_transactions(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- We identify duplicate groups based on identical amounts, specific transaction dates, and merchant identification.
  -- To protect actual identical purchases made in series (like sequential £3 coffees), we verify that a duplicate 
  -- group spans multiple connection_ids BEFORE purging them.
  WITH duplicates AS (
    SELECT 
      t.id as transaction_id,
      t.connection_id,
      -- Order by last_synced_at to ensure the newest, actively tracking connection retains its transactions
      ROW_NUMBER() OVER (
        PARTITION BY t.amount, t.timestamp::DATE, COALESCE(t.merchant_name, t.description)
        ORDER BY c.last_synced_at DESC NULLS LAST, t.created_at DESC
      ) as rn,
      COUNT(DISTINCT t.connection_id) OVER (
        PARTITION BY t.amount, t.timestamp::DATE, COALESCE(t.merchant_name, t.description)
      ) as distinct_conn_count
    FROM bank_transactions t
    LEFT JOIN bank_connections c ON t.connection_id = c.id
    WHERE t.user_id = p_user_id
  )
  DELETE FROM bank_transactions
  WHERE id IN (
    SELECT transaction_id 
    FROM duplicates 
    WHERE distinct_conn_count > 1 AND rn > 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
