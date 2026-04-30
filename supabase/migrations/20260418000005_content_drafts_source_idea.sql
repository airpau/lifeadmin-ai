-- Marketing automation: link content_drafts to content_ideas
-- Adds a foreign-key pointer so we can track which seed idea produced which draft,
-- feed performance data back into content_ideas.performance_avg, and avoid
-- re-using ideas that already flopped.
-- Additive only — ADD COLUMN (not DROP / ALTER TYPE).

ALTER TABLE content_drafts
  ADD COLUMN IF NOT EXISTS source_idea_id UUID REFERENCES content_ideas(id);

CREATE INDEX IF NOT EXISTS idx_content_drafts_source_idea
  ON content_drafts (source_idea_id) WHERE source_idea_id IS NOT NULL;
