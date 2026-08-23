-- 20260821180000_real_deal_pricing.sql
--
-- Makes the deals catalogue answer two questions it could not answer
-- before: who are we actually partnered with, and where did this price
-- come from.
--
-- Context, established 2026-08-21 by calling the Awin API for the first
-- time (nothing in the codebase had ever done so):
--
--   • We are joined to SIX Awin programmes. Five are relevant:
--     giffgaff (3599), Lebara (30681), TalkTalk (3674),
--     Virgin Media (6399), Broadband Genie (12213).
--
--   • The deals page carried ~60 hardcoded deals across 30 merchant
--     IDs. NOT ONE of those 30 IDs belongs to a programme we have
--     joined. Several do not correspond to any GB programme on Awin at
--     all: BT's real GB programme is 3042, not 3041; O2's is 3242, not
--     3235; there is no Awin programme for SMARTY, Plusnet,
--     Hyperoptic, Tesco Mobile, iD Mobile, Compare the Market or
--     MoneySuperMarket visible to this account.
--
--   • awin1.com/cread.php happily 302s for any merchant ID and sets an
--     awc cookie, which is why this went unnoticed. The redirect works.
--     The commission does not: a sale only tracks for a programme we
--     are an approved publisher on.
--
-- So the catalogue was advertising companies we have no relationship
-- with, at prices nobody sourced. This migration makes both of those
-- structurally difficult to do again.

-- ─────────────────────────────────────────────────────────────────────
-- 1. affiliate_programmes — mirror of what Awin says we have joined
-- ─────────────────────────────────────────────────────────────────────
--
-- Synced from GET /publishers/{id}/programmes?relationship=joined.
-- This table is the authority on whether a deal may be shown: no row
-- here, no deal on the page. Manual insertion defeats the point.

CREATE TABLE IF NOT EXISTS affiliate_programmes (
  -- Awin's advertiser/merchant id, the `awinmid` in a tracking link.
  awin_advertiser_id  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  display_url         TEXT,
  logo_url            TEXT,
  primary_sector      TEXT,
  country_code        TEXT,
  currency_code       TEXT,
  -- Awin's own status for the programme (Active, Suspended, ...).
  status              TEXT,
  -- True while the programme appears in the joined feed. Set false by
  -- the sync when a programme disappears, rather than deleting, so a
  -- transient API blip cannot silently empty the catalogue.
  is_joined           BOOLEAN NOT NULL DEFAULT true,
  -- Domains Awin will attribute. Useful for validating that a deal's
  -- destination URL actually belongs to the advertiser.
  valid_domains       TEXT[],
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE affiliate_programmes IS
  'Awin programmes this publisher account has actually joined. Synced from the Awin API. A deal with no matching joined row must not be shown: the link would redirect but earn nothing.';

CREATE INDEX IF NOT EXISTS idx_affiliate_programmes_joined
  ON affiliate_programmes (is_joined) WHERE is_joined;

ALTER TABLE affiliate_programmes ENABLE ROW LEVEL SECURITY;
-- Read-only to signed-in users; all writes are service-role from the sync.
DROP POLICY IF EXISTS "Anyone signed in can read programmes" ON affiliate_programmes;
CREATE POLICY "Anyone signed in can read programmes"
  ON affiliate_programmes FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────
-- 2. Price provenance on affiliate_deals
-- ─────────────────────────────────────────────────────────────────────
--
-- Every price we display must be able to say where it came from and
-- when. Before this, `price_monthly` was written by a cron that asked
-- an LLM what a deal cost from memory, and `last_verified_at` was
-- stamped on every run including low-confidence answers, which is what
-- drove the green "Verified" badge.
--
-- `price_source_url` is the difference between research and a citation.

ALTER TABLE affiliate_deals
  -- The page the price was read off. NOT the affiliate link.
  ADD COLUMN IF NOT EXISTS price_source_url TEXT,
  -- When that page was last fetched and successfully parsed.
  ADD COLUMN IF NOT EXISTS price_fetched_at TIMESTAMPTZ,
  -- Verbatim excerpt the price was extracted from, so a disputed
  -- figure can be checked without re-fetching a page that has since
  -- changed.
  ADD COLUMN IF NOT EXISTS price_source_excerpt TEXT,
  -- 'fetched'  = parsed from the advertiser's own live page
  -- 'manual'   = a human entered or confirmed it
  -- 'research' = LLM recall, the old behaviour. Never shown as verified.
  ADD COLUMN IF NOT EXISTS price_provenance TEXT
    CHECK (price_provenance IN ('fetched', 'manual', 'research')),
  -- Links a deal to the programme that must be joined for it to show.
  ADD COLUMN IF NOT EXISTS programme_id INTEGER;

COMMENT ON COLUMN affiliate_deals.price_source_url IS
  'The advertiser page this price was read from. A price with no source URL has not been verified against anything.';
COMMENT ON COLUMN affiliate_deals.price_provenance IS
  'fetched = parsed from the advertiser live page; manual = human confirmed; research = LLM recall, never displayed as verified.';

CREATE INDEX IF NOT EXISTS idx_affiliate_deals_programme
  ON affiliate_deals (programme_id);

-- Backfill the link from the column that already held the merchant id.
UPDATE affiliate_deals
SET programme_id = awin_advertiser_id
WHERE programme_id IS NULL AND awin_advertiser_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. deal_price_sources — where to look, per advertiser
-- ─────────────────────────────────────────────────────────────────────
--
-- One row per page worth fetching. Kept in the database rather than in
-- code so a broken selector or a moved pricing page is a data fix, not
-- a deploy.

CREATE TABLE IF NOT EXISTS deal_price_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  awin_advertiser_id  INTEGER NOT NULL,
  provider            TEXT NOT NULL,
  category            TEXT NOT NULL,
  -- The advertiser's own pricing page.
  source_url          TEXT NOT NULL,
  -- Free-text guidance handed to the extractor, e.g. "SIM-only monthly
  -- rolling plans only, ignore handset bundles and PAYG".
  extraction_hint     TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_fetch_at       TIMESTAMPTZ,
  last_fetch_status   TEXT,
  last_fetch_error    TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_deal_price_source
  ON deal_price_sources (awin_advertiser_id, source_url);

ALTER TABLE deal_price_sources ENABLE ROW LEVEL SECURITY;
-- Service-role only. This is operational config, not user data.

COMMENT ON TABLE deal_price_sources IS
  'Advertiser pricing pages to fetch weekly. Config lives here so a moved page is a data fix rather than a deploy.';

-- Seed the advertisers we are actually joined to.
INSERT INTO deal_price_sources (awin_advertiser_id, provider, category, source_url, extraction_hint)
VALUES
  (3599,  'giffgaff',       'mobile',
   'https://www.giffgaff.com/sim-only-deals',
   'SIM-only plans. Capture data allowance in GB (or Unlimited), monthly price, and whether the plan is an 18 month contract, monthly rolling, or pay as you go. Ignore handsets and refurbished phones.'),
  (30681, 'Lebara',         'mobile',
   'https://www.lebara.co.uk/en/best-sim-only-deals.html',
   'SIM-only plans only. Capture data allowance, monthly price, contract length, and note any introductory price that reverts later.'),
  (3674,  'TalkTalk',       'broadband',
   'https://www.talktalk.co.uk/broadband/deals',
   'Broadband packages. Capture average download speed in Mbps, monthly price, and contract length in months. Ignore TV and mobile bundles.'),
  (6399,  'Virgin Media',   'broadband',
   'https://www.virginmedia.com/broadband/deals',
   'Broadband-only packages. Capture average download speed in Mbps, monthly price, and contract length. Ignore TV and phone bundles.'),
  (12213, 'Broadband Genie','broadband',
   'https://www.broadbandgenie.co.uk/broadband',
   'Comparison listing. Capture the cheapest few packages with provider name, speed in Mbps, monthly price and contract length.')
ON CONFLICT (awin_advertiser_id, source_url) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 4. deal_price_snapshots — the audit trail
-- ─────────────────────────────────────────────────────────────────────
--
-- Append-only. Lets us answer "what did we show this user on the day
-- they clicked", which is exactly the question a complaint about a
-- savings claim would ask, and which nothing could answer before.

CREATE TABLE IF NOT EXISTS deal_price_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  awin_advertiser_id  INTEGER NOT NULL,
  provider            TEXT NOT NULL,
  category            TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  -- Normalised plans as extracted, each with name/price/speed/data.
  plans               JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_count          INTEGER NOT NULL DEFAULT 0,
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_price_snapshots_lookup
  ON deal_price_snapshots (awin_advertiser_id, fetched_at DESC);

ALTER TABLE deal_price_snapshots ENABLE ROW LEVEL SECURITY;
-- Service-role only.
