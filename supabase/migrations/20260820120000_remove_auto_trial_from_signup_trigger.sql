-- ---------------------------------------------------------------------------
-- Remove the automatic 7-day Pro trial from handle_new_user()
--
-- WHY: 20260422000000_trial_fields_and_trigger.sql still stamps every new
-- signup with trial_starts_at = NOW() and trial_ends_at = NOW() + 7 days.
-- That contradicts the product decision recorded in src/lib/plan-limits.ts
-- (TIER MATRIX rule 2: "No free Pro trial") and in the signup page
-- comments ("Auto-trial removed"). Because getEffectiveTier() and
-- checkUsageLimit() promote any profile with an active trial window to
-- Pro, the stale trigger made EVERY free-tier gate inert for a user's
-- first 7 days, then silently downgraded them at day 7 with no email,
-- no banner and no explanation. New signups should start plain free and
-- upgrade explicitly via the pricing page.
--
-- WHAT: redefines handle_new_user() identically to the 20260422 version
-- but WITHOUT setting trial_starts_at/trial_ends_at. Additive only — no
-- columns are dropped and existing rows are untouched; the trial columns
-- remain for admin-initiated grants via /api/founding-member.
--
-- STATUS: prepared 2026-08-20, awaiting founder approval before being
-- applied. Do not apply without sign-off.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
