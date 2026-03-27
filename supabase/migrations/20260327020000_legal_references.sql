-- Phase 2: Legal Intelligence with Automated Verification
-- See seed data in Supabase migrations applied via MCP

CREATE TABLE IF NOT EXISTS legal_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  subcategory TEXT,
  law_name TEXT NOT NULL,
  section TEXT,
  summary TEXT NOT NULL,
  full_text TEXT,
  source_url TEXT NOT NULL,
  source_type TEXT DEFAULT 'statute',
  applies_to TEXT[] DEFAULT '{}',
  strength TEXT DEFAULT 'strong',
  escalation_body TEXT,
  last_verified TIMESTAMPTZ DEFAULT now(),
  last_changed TIMESTAMPTZ,
  verification_status TEXT DEFAULT 'current',
  verification_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_refs_category ON legal_references(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_legal_refs_applies ON legal_references USING GIN(applies_to);
CREATE INDEX IF NOT EXISTS idx_legal_refs_status ON legal_references(verification_status);

ALTER TABLE legal_references ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_references' AND policyname = 'Anyone can read legal references') THEN
    CREATE POLICY "Anyone can read legal references"
      ON legal_references FOR SELECT USING (true);
  END IF;
END $$;
