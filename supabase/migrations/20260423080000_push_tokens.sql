-- Push-notification tokens for the Paybacker native apps.
--
-- The mobile shell (scripts/build-shell.mjs in paybacker-mobile)
-- calls POST /api/push/register on launch once the user has granted
-- notification permission. We upsert by (user_id, platform, token)
-- so multiple devices per user work (iPhone + iPad + Android).

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL,
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push tokens" ON public.push_tokens;
CREATE POLICY "Users read own push tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own push tokens" ON public.push_tokens;
CREATE POLICY "Users write own push tokens"
  ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
