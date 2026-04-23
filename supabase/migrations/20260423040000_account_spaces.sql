-- Account Spaces — Emma-style account grouping.
--
-- Users with multiple bank connections (e.g. personal current account +
-- business account + savings) can group them into named Spaces and
-- filter Money Hub by Space. Every user gets an auto-created "Everything"
-- default Space so the existing Money Hub keeps working unchanged.
--
-- Gated to Pro tier at the API layer. Free + Essential can see / use
-- their default Space but can't create more.

CREATE TABLE IF NOT EXISTS public.account_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  color text,
  is_default boolean NOT NULL DEFAULT false,
  -- Empty array = "everything" (every connection counts). When populated,
  -- the Money Hub filter restricts to bank_transactions whose
  -- connection_id is in this list. Storing as UUID[] keeps the join cheap.
  connection_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each user can have exactly one default Space. Filtering `is_default`
-- at index time means the constraint is enforceable across the app
-- without a trigger.
CREATE UNIQUE INDEX IF NOT EXISTS account_spaces_one_default_per_user
  ON public.account_spaces (user_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_account_spaces_user
  ON public.account_spaces (user_id, sort_order);

ALTER TABLE public.account_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own spaces" ON public.account_spaces;
CREATE POLICY "Users read own spaces"
  ON public.account_spaces FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own spaces" ON public.account_spaces;
CREATE POLICY "Users write own spaces"
  ON public.account_spaces FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Backfill the default "Everything" Space for every existing user so
-- nothing breaks the first time the Money Hub loads after this migration.
-- Empty connection_ids array = "all connections".
INSERT INTO public.account_spaces (user_id, name, emoji, is_default, connection_ids, sort_order)
SELECT
  p.id,
  'Everything',
  '🌍',
  true,
  '{}',
  0
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_spaces s
  WHERE s.user_id = p.id AND s.is_default = true
);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION public.account_spaces_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_spaces_touch_trigger ON public.account_spaces;
CREATE TRIGGER account_spaces_touch_trigger
  BEFORE UPDATE ON public.account_spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.account_spaces_touch();
