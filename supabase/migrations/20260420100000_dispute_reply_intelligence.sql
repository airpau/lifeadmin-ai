-- =============================================================================
-- Watchdog Reply Intelligence Layer
-- =============================================================================
-- Plan ref: ad-hoc follow-up to DISPUTE_EMAIL_SYNC_PLAN.md
-- Drafted: 20 April 2026
--
-- When Watchdog auto-imports a supplier reply we also run it through Claude to
-- classify what kind of reply it is, whether the user needs to act, and how
-- urgently. The classification is written back onto the correspondence row so
-- the UI (and the Telegram alert that goes out immediately) can surface
-- "action needed" vs "just an FYI" without the user having to read every
-- holding reply themselves.
--
-- Categories (stored free-text so we can add more without another migration):
--   holding_reply      - "we're looking into it", no action required
--   info_request       - supplier has asked the user for more info
--   settlement_offer   - supplier has offered a refund / credit / goodwill
--   rejection          - supplier has declined the complaint
--   resolution         - supplier says the matter is resolved / closed
--   escalation_needed  - deadlock / 8-week letter / final response
--   other              - couldn't classify confidently
--
-- ALL CHANGES ADDITIVE. No DROP. No destructive ALTER. Safe to deploy.
-- =============================================================================

ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_category TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_respond_needed BOOLEAN;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_urgency TEXT;
-- urgency values: 'none' | 'low' | 'medium' | 'high' (free-text for same reason)
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_rationale TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_suggested_reply_context TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS ai_classifier_version TEXT;

-- Fast lookup: "which of my replies still need action?" — used by the
-- dashboard badge and the per-dispute timeline filter.
CREATE INDEX IF NOT EXISTS idx_correspondence_respond_needed
  ON correspondence(dispute_id, ai_respond_needed)
  WHERE ai_respond_needed = TRUE;

-- Fast lookup across the whole user for the global notification centre.
-- Joins correspondence -> disputes(user_id) in the query layer; this index
-- keeps the inner scan cheap.
CREATE INDEX IF NOT EXISTS idx_correspondence_urgency
  ON correspondence(ai_urgency, entry_date DESC)
  WHERE ai_respond_needed = TRUE;

COMMENT ON COLUMN correspondence.ai_category IS
  'Watchdog reply classifier output: holding_reply | info_request | settlement_offer | rejection | resolution | escalation_needed | other';
COMMENT ON COLUMN correspondence.ai_respond_needed IS
  'TRUE when the classifier thinks the user should take action before the supplier will move forward.';
COMMENT ON COLUMN correspondence.ai_urgency IS
  'none | low | medium | high — high implies statutory deadline (e.g. 8-week final response).';
COMMENT ON COLUMN correspondence.ai_rationale IS
  'One-sentence human-readable explanation of the classification. Surfaced in the UI and notifications.';
COMMENT ON COLUMN correspondence.ai_suggested_reply_context IS
  'Short hint the AI letter writer can lean on when the user clicks "Draft reply".';

-- =============================================================================
-- END
-- =============================================================================
