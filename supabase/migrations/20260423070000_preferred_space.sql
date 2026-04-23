-- User-preferred landing Space.
--
-- Separate from account_spaces.is_default (which marks the auto-
-- created, un-deletable "Everything" Space). A user may want their
-- Money Hub to land on "Business" instead — this column lets them
-- pin any Space. NULL means "no preference, use the built-in
-- default Space".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_space_id uuid
    REFERENCES public.account_spaces(id) ON DELETE SET NULL;
