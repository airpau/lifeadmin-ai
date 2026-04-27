-- Adds per-post visual + topical-research fields to blog_posts.
--
-- image_url       — public URL of the AI-generated hero image (Imagen → social-images bucket).
--                   NULL on legacy rows; the index + post page fall back to a gradient.
-- image_alt       — alt-text describing the hero image (used on <img> + og:image:alt).
-- topical_hook    — one-line tie-in to a recent UK consumer-rights news event,
--                   weaved into the lede when Perplexity surfaces something fresh.
-- topical_sources — JSONB array of {url, title} citations the Perplexity research
--                   returned, so we can audit accuracy if a post is questioned.
--
-- Applied to prod 2026-04-27 via mcp__claude_ai_Supabase__apply_migration.

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_alt TEXT,
  ADD COLUMN IF NOT EXISTS topical_hook TEXT,
  ADD COLUMN IF NOT EXISTS topical_sources JSONB;
