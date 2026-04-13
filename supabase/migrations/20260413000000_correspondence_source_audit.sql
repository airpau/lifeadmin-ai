-- Correspondence audit trail — Phase 1
-- Adds source tracking so entries created via Telegram are queryable
-- from the disputes detail page on the website.

-- ============================================================
-- 1. Add source column — which interface created this entry
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence' AND column_name = 'source'
  ) THEN
    ALTER TABLE correspondence ADD COLUMN source TEXT
      CHECK (source IN ('web', 'telegram', 'api', 'system'));
    COMMENT ON COLUMN correspondence.source IS
      'Which interface created this entry: web dashboard, telegram bot, api, or system';
  END IF;
END $$;

-- ============================================================
-- 2. Add telegram_chat_id — links entry back to Telegram conversation
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correspondence' AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE correspondence ADD COLUMN telegram_chat_id BIGINT;
    COMMENT ON COLUMN correspondence.telegram_chat_id IS
      'Telegram chat_id if this entry was created via the Pocket Agent bot';
  END IF;
END $$;

-- Index for filtering by source (for website dispute detail page)
CREATE INDEX IF NOT EXISTS idx_correspondence_source
  ON correspondence(source) WHERE source IS NOT NULL;
