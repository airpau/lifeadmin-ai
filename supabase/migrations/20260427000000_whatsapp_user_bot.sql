-- WhatsApp User Bot — Phase 1
-- Provider-agnostic infrastructure: works for Twilio sandbox AND Meta WhatsApp Business API.
--
-- Mirrors the telegram_user_bot.sql pattern (20260402030000) so the messaging
-- code in src/lib/whatsapp/ can be a near-direct port of src/lib/telegram/.
--
-- All tables are CREATE TABLE IF NOT EXISTS per CLAUDE.md "additive only" rule.

-- ============================================================
-- 1. WHATSAPP SESSIONS — links WhatsApp numbers to Paybacker users
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_phone TEXT UNIQUE NOT NULL, -- E.164 format, e.g. "+447700900123"
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  -- WhatsApp requires explicit opt-in (Meta policy + UK GDPR)
  opted_in_at TIMESTAMPTZ DEFAULT NOW(),
  opted_out_at TIMESTAMPTZ,
  -- Which provider was used to send the most recent outbound message
  -- Allows us to migrate users from Twilio sandbox -> Meta direct without breakage
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'meta', 'sandbox')),
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
-- Service role only — bot uses service key, mirror of telegram pattern

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone
  ON whatsapp_sessions(whatsapp_phone) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_id
  ON whatsapp_sessions(user_id);

-- ============================================================
-- 2. WHATSAPP LINK CODES — one-time codes for account linking
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_link_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_link_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_whatsapp_link_codes_code
  ON whatsapp_link_codes(code) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_whatsapp_link_codes_user
  ON whatsapp_link_codes(user_id, created_at DESC);

-- ============================================================
-- 3. WHATSAPP MESSAGE LOG — analytics + audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  whatsapp_phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT CHECK (message_type IN ('text', 'template', 'interactive', 'media', 'system')),
  template_name TEXT, -- only set when message_type = 'template'
  message_text TEXT,
  tools_used TEXT[],
  processing_time_ms INTEGER,
  provider TEXT NOT NULL CHECK (provider IN ('twilio', 'meta', 'sandbox')),
  provider_message_id TEXT, -- for delivery/status webhook reconciliation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user
  ON whatsapp_message_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_phone
  ON whatsapp_message_log(whatsapp_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_provider_msg
  ON whatsapp_message_log(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ============================================================
-- 4. WHATSAPP MESSAGE TEMPLATES — registry of approved templates
-- ============================================================
-- Meta requires templates to be pre-approved (24-48h review per template).
-- This table tracks the approval state per provider so the sender can pick
-- the right one at runtime.
CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication')),
  language_code TEXT NOT NULL DEFAULT 'en_GB',
  body_text TEXT NOT NULL, -- the literal template body with {{1}}, {{2}} placeholders
  -- Per-provider state
  meta_template_id TEXT,
  meta_status TEXT CHECK (meta_status IN ('pending', 'approved', 'rejected', 'paused', NULL)),
  twilio_content_sid TEXT, -- Twilio uses Content SIDs for templates
  twilio_status TEXT CHECK (twilio_status IN ('pending', 'approved', 'rejected', NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

-- Seed the four launch templates (status 'pending' until provider approval).
INSERT INTO whatsapp_message_templates (template_name, category, body_text)
VALUES
  ('paybacker_alert_price_increase', 'utility',
   '{{1}} just increased your bill by £{{2}}/month. Tap below to draft a dispute letter free.'),
  ('paybacker_alert_renewal', 'utility',
   'Your {{1}} renews on {{2}} for £{{3}}. Want to switch, cancel, or negotiate?'),
  ('paybacker_morning_summary', 'marketing',
   'Good morning. Yesterday you saved £{{1}}. {{2}} new opportunities found overnight. Tap to review.'),
  ('paybacker_outcome_check', 'utility',
   'It''s been 14 days since your dispute with {{1}}. Did they respond? Reply YES, NOT YET, or GAVE UP.')
ON CONFLICT (template_name) DO NOTHING;
