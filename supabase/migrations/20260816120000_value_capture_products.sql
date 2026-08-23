-- ============================================================================
-- Value-capture products above Pro — 2026-08-16
--
-- Adds the schema for three products that sit above the £9.99 Pro tier
-- without touching Essential (£4.99 / £44.99) or Pro (£9.99 / £94.99):
--
--   1. Dispute Pro       £19.99/mo · £199.99/yr   (new subscription_tier)
--   2. Ombudsman pack    £14.99 one-off           (dispute_entitlements)
--   3. Household         £19.99/mo · £199.99/yr   (household_plans/_members)
--      (repriced from £14.99/£149.99 on 2026-08-21 when Dispute Pro was
--       withdrawn and Household absorbed its price points)
--
-- STRICTLY ADDITIVE. No DROP TABLE, no column removal. The only DROP is the
-- CHECK constraint on profiles.subscription_tier, which is immediately
-- re-added as a strict superset of its previous value set — every tier that
-- was legal before is still legal, so no existing row can be invalidated.
--
-- Rationale for the products: willingness to pay for a dispute anchors to
-- the recovery amount (£100-£520 a case), not to a budgeting app. A flat
-- £9.99 for unlimited access leaves money on the table, while the
-- tracking-only audience must keep seeing the low headline price.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Widen the tier constraint
--
-- Previous value set (20260427150000_tier_constraint_essential.sql):
--   free, essential, pro, plus
-- 'plus' is the retired original single-paid tier. It is preserved here
-- because dropping it from the constraint would invalidate any row that
-- the 20260420000000 data migration missed.
-- ----------------------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier = ANY (ARRAY[
    'free'::text,
    'essential'::text,
    'pro'::text,
    'plus'::text,        -- legacy, retained so no historical row is invalidated
    'household'::text,   -- new 2026-08-16
    'dispute_pro'::text  -- new 2026-08-16
  ]));

COMMENT ON CONSTRAINT profiles_subscription_tier_check ON profiles IS
  'Canonical tier set. Must stay in sync with PlanTier in src/lib/tier-rank.ts. Widen only — never narrow, or existing rows become invalid.';


-- ----------------------------------------------------------------------------
-- 2. dispute_entitlements — one-off purchases granting a capability
--
-- The Ombudsman escalation pack is a SINGLE PAYMENT, not a subscription.
-- Buying one must never move profiles.subscription_tier; it inserts a row
-- here instead. Deliberately available on every tier including Free —
-- pay-per-need without subscribing is the entire point of the product.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispute_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nullable on purpose. Stripe metadata is the only carrier of the
  -- dispute id through checkout, and metadata can be lost (customer edits
  -- the session, we replay an old event). A NULL dispute_id is an
  -- unassigned credit the user can attach to any dispute later, which is
  -- strictly better than dropping a paid-for entitlement on the floor.
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,

  entitlement_kind TEXT NOT NULL DEFAULT 'ombudsman_escalation_pack'
    CHECK (entitlement_kind IN ('ombudsman_escalation_pack')),

  source TEXT NOT NULL DEFAULT 'stripe_one_off'
    CHECK (source IN ('stripe_one_off', 'included_in_tier', 'founder_grant')),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'redeemed', 'refunded', 'expired')),

  -- IDEMPOTENCY KEY. Stripe replays checkout.session.completed; the unique
  -- index below is what makes a replay a no-op rather than a second
  -- entitlement for one payment.
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount_gbp NUMERIC(10,2),

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dispute_entitlements_stripe_session_uniq
  ON dispute_entitlements (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dispute_entitlements_user_idx
  ON dispute_entitlements (user_id, status);

CREATE INDEX IF NOT EXISTS dispute_entitlements_dispute_idx
  ON dispute_entitlements (dispute_id)
  WHERE dispute_id IS NOT NULL;

ALTER TABLE dispute_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own dispute entitlements" ON dispute_entitlements;
CREATE POLICY "Users can read own dispute entitlements"
  ON dispute_entitlements FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy on purpose. Entitlements are granted by
-- the Stripe webhook using the service-role key. A user must not be able
-- to grant themselves a £14.99 product with a PostgREST call.


-- ----------------------------------------------------------------------------
-- 3. escalation_packs — the generated artefact
--
-- One row per generated pack: the ombudsman referral letter, the bundled
-- evidence from the dispute thread, and the referral deadlines. Stored
-- rather than regenerated so the user can reopen it without burning
-- another Claude call, and so we have an audit trail of exactly what was
-- put in front of them.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalation_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  entitlement_id UUID REFERENCES dispute_entitlements(id) ON DELETE SET NULL,

  -- Which ombudsman / ADR body, resolved from the dispute's sector.
  sector_key TEXT,
  ombudsman_name TEXT,
  ombudsman_url TEXT,
  ombudsman_eligibility TEXT,
  ombudsman_time_limit TEXT,
  ombudsman_cost TEXT,
  ombudsman_binding TEXT,

  -- The referral letter itself.
  escalation_letter TEXT,
  legal_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Ordered bundle built from `correspondence` for this dispute:
  -- [{ seq, entry_type, title, dated, summary, content, attachment_count }]
  evidence_pack JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_item_count INTEGER NOT NULL DEFAULT 0,

  -- Deadline tracking.
  eligible_from TIMESTAMPTZ,      -- when the ombudsman will accept the case
  referral_deadline TIMESTAMPTZ,  -- last date to refer before it is out of scope

  model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS escalation_packs_user_idx ON escalation_packs (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS escalation_packs_dispute_uniq ON escalation_packs (dispute_id);

ALTER TABLE escalation_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own escalation packs" ON escalation_packs;
CREATE POLICY "Users can read own escalation packs"
  ON escalation_packs FOR SELECT
  USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 4. household_plans / household_members
--
-- ============================ DATA ISOLATION ================================
-- A household shares ONE thing: the answer to "what tier am I on".
--
-- It does NOT share data. Every user-data table in the consumer schema
-- (bank_connections, bank_transactions, email_connections, disputes,
-- correspondence, tasks, money_hub_*, account_spaces, usage_logs, …) is
-- keyed `user_id` with an `auth.uid() = user_id` RLS policy, and every
-- server route additionally filters `.eq('user_id', …)`. Four household
-- members are therefore four structurally isolated tenants; there is no
-- shared row anywhere and nothing for these two tables to widen.
--
-- The tables below are deliberately incapable of granting cross-member
-- read access: household_members exposes only (household_id, user_id,
-- email, role, status) and the SELECT policy below restricts each member
-- to their OWN seat row. A member cannot even enumerate who else is in
-- the household from the client. Do not add a policy that widens this.
--
-- ========================= WHY STRIPE IDS LIVE HERE =========================
-- profiles.stripe_customer_id and profiles.stripe_subscription_id are both
-- UNIQUE (20260101000000_initial_schema.sql). Copying the owner's ids onto
-- the other three member profiles would throw a unique violation on rows
-- 2-4, and /api/webhooks/stripe updates profiles `.eq(stripe_customer_id)`
-- assuming one row per customer. So subscription state lives here, seats
-- live in household_members, and member profiles keep
-- subscription_tier='free' with entitlement resolved at read time by
-- resolveHouseholdTier() in src/lib/household.ts. Cancel the plan and every
-- member reverts to Free on their next tier read — no fan-out write, no
-- orphaned entitlement.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS household_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One live plan per owner. The unique constraint is what makes
  -- ensureHouseholdPlan() idempotent against Stripe webhook replays.
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled')),

  seats INTEGER NOT NULL DEFAULT 4 CHECK (seats > 0 AND seats <= 10),

  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_plans_sub_idx
  ON household_plans (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS household_plans_customer_idx
  ON household_plans (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES household_plans(id) ON DELETE CASCADE,

  -- NULL until the invitee accepts and we can bind a real auth user.
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  invited_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),

  -- Only the SHA-256 of the invite token is stored. Plaintext is emailed
  -- once and never persisted — same pattern as b2b_portal_tokens.
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,

  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One seat per email per household — makes the owner-seat upsert in
-- ensureHouseholdPlan() safe under webhook replay.
CREATE UNIQUE INDEX IF NOT EXISTS household_members_email_uniq
  ON household_members (household_id, invited_email);

-- A person can hold at most one ACTIVE seat across all households, so
-- there is never ambiguity about which plan grants their entitlement.
CREATE UNIQUE INDEX IF NOT EXISTS household_members_active_user_uniq
  ON household_members (user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS household_members_household_idx
  ON household_members (household_id, status);

CREATE INDEX IF NOT EXISTS household_members_token_idx
  ON household_members (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;


ALTER TABLE household_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Owner may read their own plan. Members deliberately cannot read the
-- plan row — it carries Stripe identifiers.
DROP POLICY IF EXISTS "Owners can read own household plan" ON household_plans;
CREATE POLICY "Owners can read own household plan"
  ON household_plans FOR SELECT
  USING (auth.uid() = owner_user_id);

-- A member may read ONLY their own seat row. This is intentionally not
-- "any row in my household" — nobody needs to enumerate the household
-- from the client, and every extra visible column is a future leak.
DROP POLICY IF EXISTS "Members can read own seat" ON household_members;
CREATE POLICY "Members can read own seat"
  ON household_members FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies on either table. Seat management runs
-- through service-role routes that check ownership explicitly.


-- ----------------------------------------------------------------------------
-- 5. updated_at triggers, reusing the existing helper if present
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_dispute_entitlements_updated_at ON dispute_entitlements;
    CREATE TRIGGER set_dispute_entitlements_updated_at
      BEFORE UPDATE ON dispute_entitlements
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS set_escalation_packs_updated_at ON escalation_packs;
    CREATE TRIGGER set_escalation_packs_updated_at
      BEFORE UPDATE ON escalation_packs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS set_household_plans_updated_at ON household_plans;
    CREATE TRIGGER set_household_plans_updated_at
      BEFORE UPDATE ON household_plans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS set_household_members_updated_at ON household_members;
    CREATE TRIGGER set_household_members_updated_at
      BEFORE UPDATE ON household_members
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 6. Widen consumer_leads.intended_tier
--
-- The abandonment-nurture funnel records which tier the visitor was trying
-- to buy. Its CHECK constraint only allowed ('essential','pro'), so an
-- abandoned Household or Dispute Pro checkout would have thrown a
-- constraint violation inside the Stripe webhook's
-- checkout.session.expired handler and lost the lead entirely.
-- ----------------------------------------------------------------------------
ALTER TABLE consumer_leads DROP CONSTRAINT IF EXISTS consumer_leads_intended_tier_check;

ALTER TABLE consumer_leads ADD CONSTRAINT consumer_leads_intended_tier_check
  CHECK (intended_tier IS NULL OR intended_tier = ANY (ARRAY[
    'essential'::text,
    'pro'::text,
    'household'::text,
    'dispute_pro'::text
  ]));


COMMENT ON TABLE dispute_entitlements IS
  'One-off purchases (Ombudsman escalation pack, £14.99). Granted by the Stripe webhook on metadata.product=escalation_pack. NEVER changes profiles.subscription_tier.';
COMMENT ON TABLE escalation_packs IS
  'Generated Ombudsman escalation artefact: referral letter + evidence bundle + deadlines, per dispute.';
COMMENT ON TABLE household_plans IS
  'Household subscription (£19.99/mo, 4 seats). Shares ENTITLEMENT ONLY — never data. Stripe ids live here, not fanned out onto member profiles.';
COMMENT ON TABLE household_members IS
  'Household seats. Members are fully isolated tenants; the RLS policy restricts each member to their own seat row by design.';
