-- Phase 3: Contract Vault
-- Schema changes applied via MCP, this file is for version control

-- Make dispute_id nullable, add subscription_id
ALTER TABLE contract_extractions ALTER COLUMN dispute_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_extractions' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE contract_extractions ADD COLUMN subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;
    ALTER TABLE contract_extractions ADD COLUMN file_type TEXT;
    ALTER TABLE contract_extractions ADD COLUMN contract_type TEXT;
    ALTER TABLE contract_extractions ADD COLUMN monthly_cost NUMERIC(10,2);
    ALTER TABLE contract_extractions ADD COLUMN annual_cost NUMERIC(10,2);
    CREATE INDEX idx_contract_extractions_subscription ON contract_extractions(subscription_id);
  END IF;
END $$;

-- Check constraint
ALTER TABLE contract_extractions DROP CONSTRAINT IF EXISTS contract_extractions_link_check;
ALTER TABLE contract_extractions ADD CONSTRAINT contract_extractions_link_check
  CHECK (dispute_id IS NOT NULL OR subscription_id IS NOT NULL);

-- Private contracts storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false) ON CONFLICT DO NOTHING;
