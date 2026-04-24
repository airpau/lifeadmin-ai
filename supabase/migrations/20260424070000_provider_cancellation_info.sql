-- Provider cancellation info — upgrade the hand-maintained static list
-- (src/lib/cancellation-methods.ts) to a proper Supabase table with
-- freshness tracking, aliases for better merchant matching, and room
-- for AI-generated rows to be persisted back after their first lookup.
--
-- Phase 1 scope: schema + seed. A refresh cron (Phase 2) will use
-- Perplexity to re-verify the oldest rows weekly, per CLAUDE.md rule
-- that all real-time web research goes through Perplexity.
--
-- Schema design:
--   provider text UNIQUE  — canonical normalised name ("netflix", "sky")
--   aliases text[]        — alternative strings we might see in bank
--                          descriptions ("NFLX", "netflix.com")
--   method text NOT NULL  — human-readable primary cancellation method
--   email, phone, url     — channel details, any/all nullable
--   tips text             — extra guidance (notice periods, gotchas)
--   category text         — streaming / broadband / mobile / etc
--   region text DEFAULT 'UK'
--   data_source text      — 'seed' | 'ai' | 'admin' | 'perplexity'
--   confidence text       — 'high' (human-verified <30d) | 'medium' | 'low'
--   auto_cancel_support text — 'none' (default) | 'email' | 'api' —
--                              Phase 3 flag that lets the UI offer
--                              "cancel on my behalf" for email-route
--                              providers once we wire send-via-Gmail.
--   last_verified_at timestamptz — when this row was last confirmed;
--                                  nulls out after 30d, letting the
--                                  refresh cron prioritise.
--
-- RLS: public read, service-role write. This is reference data, not
-- per-user — every user benefits from a verified Netflix cancellation
-- URL, so the read policy is open to any authenticated session.

CREATE TABLE IF NOT EXISTS public.provider_cancellation_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  display_name text,
  aliases text[] NOT NULL DEFAULT '{}',
  category text,
  method text NOT NULL,
  email text,
  phone text,
  url text,
  tips text,
  region text NOT NULL DEFAULT 'UK',
  data_source text NOT NULL DEFAULT 'seed'
    CHECK (data_source IN ('seed', 'ai', 'admin', 'perplexity')),
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low')),
  auto_cancel_support text NOT NULL DEFAULT 'none'
    CHECK (auto_cancel_support IN ('none', 'email', 'api')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_cancellation_aliases
  ON public.provider_cancellation_info USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_provider_cancellation_verified
  ON public.provider_cancellation_info (last_verified_at NULLS FIRST);

ALTER TABLE public.provider_cancellation_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read cancellation info"
  ON public.provider_cancellation_info;
CREATE POLICY "Authenticated users read cancellation info"
  ON public.provider_cancellation_info FOR SELECT
  USING (auth.role() = 'authenticated');

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION public.provider_cancellation_info_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_cancellation_info_touch_trigger
  ON public.provider_cancellation_info;
CREATE TRIGGER provider_cancellation_info_touch_trigger
  BEFORE UPDATE ON public.provider_cancellation_info
  FOR EACH ROW
  EXECUTE FUNCTION public.provider_cancellation_info_touch();

-- ─── Seed from the hand-maintained static list ───────────────────────
-- Every row starts with data_source='seed', confidence='medium'. The
-- Perplexity refresh cron will promote rows to 'high' as it verifies
-- them, and demote to 'low' if external sources disagree.
INSERT INTO public.provider_cancellation_info
  (provider, display_name, category, method, email, phone, url, tips, aliases)
VALUES
  -- Streaming
  ('netflix', 'Netflix', 'streaming', 'Cancel online via account settings',
    NULL, NULL, 'https://www.netflix.com/cancelplan',
    'Go to Account > Cancel Membership. You keep access until the end of your billing period.',
    ARRAY['netflix.com','nflx']),
  ('disney', 'Disney+', 'streaming', 'Cancel online via account settings',
    NULL, NULL, 'https://www.disneyplus.com/account',
    'Account > Subscription > Cancel Subscription. If billed via Apple/Google, cancel through their app store.',
    ARRAY['disneyplus','disney+','disney plus']),
  ('amazon prime', 'Amazon Prime', 'streaming', 'Cancel online via Prime settings',
    NULL, NULL, 'https://www.amazon.co.uk/gp/primecentral',
    'Go to Prime membership > End membership. You can get a refund if you haven''t used Prime benefits.',
    ARRAY['prime','amzn prime']),
  ('spotify', 'Spotify', 'streaming', 'Cancel online via account page',
    NULL, NULL, 'https://www.spotify.com/account/subscription/',
    'Account > Subscription > Cancel Premium. Must be done on the website, not the app.',
    ARRAY['spotify premium']),
  ('apple', 'Apple Services', 'streaming', 'Cancel via iPhone Settings or Apple ID',
    NULL, NULL, 'https://support.apple.com/en-gb/HT202039',
    'Settings > [Your Name] > Subscriptions > select the subscription > Cancel.',
    ARRAY['itunes','apple.com/bill','apple services']),
  ('youtube', 'YouTube Premium', 'streaming', 'Cancel online via YouTube settings',
    NULL, NULL, 'https://www.youtube.com/paid_memberships',
    'Go to Paid memberships > Manage > Deactivate.',
    ARRAY['youtube premium','google youtube']),
  ('now tv', 'NOW TV', 'streaming', 'Cancel online via account',
    NULL, NULL, 'https://account.nowtv.com/passes',
    'Account > Passes > Cancel pass. You keep access until the end of the paid period.',
    ARRAY['nowtv','now']),
  ('plex', 'Plex', 'streaming', 'Cancel online or email support',
    'support@plex.tv', NULL, 'https://www.plex.tv/claim/',
    'Account > Plex Pass > Cancel subscription.', ARRAY['plex pass']),
  ('patreon', 'Patreon', 'streaming', 'Cancel online via membership settings',
    NULL, NULL, 'https://www.patreon.com/settings',
    'Go to the creator''s page > Manage > Edit or Cancel. You must cancel each creator individually.',
    ARRAY['patreon*','patreon membership']),
  ('dazn', 'DAZN', 'streaming', 'Cancel online or email support',
    'help@dazn.com', NULL, 'https://www.dazn.com/account', NULL, ARRAY[]::text[]),

  -- Broadband & Telecoms
  ('sky', 'Sky', 'broadband', 'Phone or online cancellation',
    NULL, '0333 7591 018', 'https://www.sky.com/shop/cancel/',
    'Sky requires 31 days notice. Call or use the online cancellation tool. Ask for a MAC code if switching broadband.',
    ARRAY['sky digital','sky broadband','sky tv']),
  ('virgin media', 'Virgin Media', 'broadband', 'Phone only — no online cancellation',
    NULL, '0345 454 1111', NULL,
    'Call to cancel. They will likely offer a retention deal. Ask for a final bill and return the router.',
    ARRAY['virgin']),
  ('bt', 'BT', 'broadband', 'Phone or online',
    NULL, '0800 800 150', 'https://www.bt.com/help/account/cancel',
    'BT requires 30 days notice. You can cancel via the app or by calling.',
    ARRAY['bt broadband','british telecom']),
  ('vodafone', 'Vodafone', 'mobile', 'Phone or app',
    NULL, '191 from Vodafone / 03333 040 191', NULL,
    'Call 191 or use the app. If out of contract, you can switch without cancelling first (auto-switch).',
    ARRAY[]::text[]),
  ('communityfibre', 'Community Fibre', 'broadband', 'Email or phone',
    'support@communityfibre.co.uk', '0800 082 0770', NULL,
    '30 days notice required. Email or call to cancel.',
    ARRAY['community fibre']),
  ('plusnet', 'Plusnet', 'broadband', 'Phone only',
    NULL, '0800 432 0200', NULL, 'Call to cancel. 30 days notice required.',
    ARRAY[]::text[]),
  ('talktalk', 'TalkTalk', 'broadband', 'Phone only',
    NULL, '0345 172 0088', NULL, 'Call to cancel. Check your contract end date first.',
    ARRAY['talk talk']),

  -- Mobile
  ('ee', 'EE', 'mobile', 'Phone or text PAC to 65075',
    NULL, '150 from EE / 07953 966 250', NULL,
    'Text PAC to 65075 to get your PAC code if switching. 30 days notice for cancellation.',
    ARRAY[]::text[]),
  ('three', 'Three', 'mobile', 'Phone or text PAC to 65075',
    NULL, '333 from Three / 0333 338 1001', NULL,
    'Text PAC to 65075 for your PAC code. Or STAC to 75075 if keeping your number.',
    ARRAY['three mobile','3 mobile']),
  ('o2', 'O2', 'mobile', 'Phone or text PAC to 65075',
    NULL, '202 from O2 / 0344 809 0202', NULL, NULL, ARRAY['o2 uk']),
  ('giffgaff', 'giffgaff', 'mobile', 'Online — deactivate SIM in account settings',
    NULL, NULL, 'https://www.giffgaff.com/profile/details',
    'No contract, no notice period. Just stop topping up or deactivate in account settings.',
    ARRAY[]::text[]),
  ('lebara', 'Lebara', 'mobile', 'Online account or email',
    'support@lebara.co.uk', NULL, 'https://www.lebara.co.uk/my-lebara',
    'Cancel auto-renewal in My Lebara > Manage plan.', ARRAY[]::text[]),

  -- Utilities
  ('british gas', 'British Gas', 'energy', 'Phone, email, or switch via new supplier',
    'contactus@britishgas.co.uk', '0333 202 9802', NULL,
    'Easiest to switch via a comparison site — the new supplier handles the cancellation. Submit a final meter reading.',
    ARRAY[]::text[]),
  ('eon', 'E.ON', 'energy', 'Phone or switch via new supplier',
    NULL, '0345 052 0000', NULL,
    'Switch via comparison site or call to cancel. Provide a final meter reading.',
    ARRAY['e.on','e on']),
  ('octopus energy', 'Octopus Energy', 'energy', 'Email or phone',
    'hello@octopus.energy', '0808 164 1088', NULL,
    'Email is usually fastest. They respond within a few hours.',
    ARRAY['octopus']),
  ('ovo', 'OVO Energy', 'energy', 'Email or phone',
    'hello@ovoenergy.com', '0330 303 5063', NULL, NULL,
    ARRAY['ovo energy']),
  ('thames water', 'Thames Water', 'water', 'Phone or online form',
    NULL, '0800 316 9800', 'https://www.thameswater.co.uk/contact-us',
    'You cannot switch water supplier. Contact to close account when moving home.',
    ARRAY[]::text[]),

  -- Insurance
  ('manypets', 'ManyPets', 'insurance', 'Email or phone',
    'hello@manypets.com', '0345 340 2498', NULL,
    'Cancel within 14 days for a full refund. After that, you may receive a pro-rata refund.',
    ARRAY['many pets']),
  ('admiral', 'Admiral', 'insurance', 'Phone only',
    NULL, '0333 220 2000', NULL,
    'Call to cancel. Ask about any cancellation fees.', ARRAY[]::text[]),
  ('direct line', 'Direct Line', 'insurance', 'Phone only',
    NULL, '0345 246 8704', NULL, NULL, ARRAY[]::text[]),
  ('aviva', 'Aviva', 'insurance', 'Phone only',
    NULL, '0800 051 5260', NULL,
    'Call to cancel. 14-day cooling-off period applies for new policies.',
    ARRAY[]::text[]),

  -- Fitness
  ('puregym', 'PureGym', 'fitness', 'Online via account settings',
    NULL, NULL, 'https://www.puregym.com/login/',
    'Log in > Manage Membership > Cancel. Must give notice before your next billing date.',
    ARRAY['pure gym']),
  ('the gym', 'The Gym Group', 'fitness', 'Email only',
    'membersupport@thegymgroup.com', NULL, NULL,
    'Email to cancel. Must give 30 days notice.', ARRAY['gym group','the gym group']),
  ('david lloyd', 'David Lloyd', 'fitness', 'In person or phone your club',
    NULL, 'Call your home club', NULL,
    'Requires written notice — visit your club or call. Check your contract minimum term.',
    ARRAY[]::text[]),

  -- Software
  ('experian', 'Experian', 'software', 'Online or phone',
    NULL, '0344 481 0800', 'https://www.experian.co.uk/consumer/login/',
    'Log in > Account settings > Cancel subscription. Or call.',
    ARRAY[]::text[]),
  ('adobe', 'Adobe', 'software', 'Online via account',
    NULL, NULL, 'https://account.adobe.com/plans',
    'Account > Plans > Cancel plan. Early termination fee may apply if annual plan paid monthly.',
    ARRAY['adobe creative cloud','creative cloud']),
  ('microsoft', 'Microsoft', 'software', 'Online via Microsoft account',
    NULL, NULL, 'https://account.microsoft.com/services',
    'Sign in > Services & subscriptions > Cancel.',
    ARRAY['microsoft 365','office 365','xbox live','xbox game pass']),
  ('anthropic', 'Anthropic', 'software', 'Online or email',
    'support@anthropic.com', NULL, 'https://console.anthropic.com/settings/billing',
    'Go to Console > Settings > Billing > Cancel plan.',
    ARRAY['claude']),

  -- Finance
  ('klarna', 'Klarna', 'finance', 'App or email',
    'customer@klarna.co.uk', NULL, 'https://app.klarna.com/',
    'Open Klarna app > select the purchase > Cancel. For subscriptions, contact the merchant directly.',
    ARRAY[]::text[]),

  -- Food
  ('deliveroo', 'Deliveroo', 'food', 'Online via account settings',
    'support@deliveroo.co.uk', NULL, 'https://deliveroo.co.uk/account',
    'Account > Deliveroo Plus > Cancel. You keep access until the end of the billing period.',
    ARRAY['deliveroo plus']),
  ('just eat', 'Just Eat', 'food', 'Online via account settings',
    NULL, NULL, 'https://www.just-eat.co.uk/account/details', NULL,
    ARRAY['justeat']),
  ('hello fresh', 'HelloFresh', 'food', 'Online, email, or phone',
    'hello@hellofresh.co.uk', '0203 519 5882', NULL,
    'Log in > Account settings > Cancel plan. Must cancel before the weekly deadline.',
    ARRAY['hellofresh']),
  ('gousto', 'Gousto', 'food', 'Online or email',
    'hello@gousto.co.uk', NULL, 'https://www.gousto.co.uk/account',
    NULL, ARRAY[]::text[]),

  -- Transport
  ('trainline', 'Trainline', 'transport', 'Online or email',
    'support@thetrainline.com', NULL, 'https://www.thetrainline.com/my-account',
    'Account > Manage subscriptions. For refunds on unused tickets, request via the app.',
    ARRAY['the trainline']),

  -- Other
  ('whoop', 'WHOOP', 'fitness', 'Online or email',
    'support@whoop.com', NULL, 'https://app.whoop.com/membership',
    'Membership > Cancel. Annual commitments may have early termination fees.',
    ARRAY[]::text[]),

  -- Government / statutory (no auto-cancel; info only)
  ('tv licence', 'TV Licensing', 'statutory', 'Stop direct debit online',
    NULL, '0300 790 6071', 'https://www.tvlicensing.co.uk/check-if-you-need-one',
    'You can stop your TV Licence if you genuinely do not watch live TV or iPlayer. Apply at tvlicensing.co.uk/noTVneed. Keep evidence — TV Licensing may visit.',
    ARRAY['tv licensing']),
  ('dvla', 'DVLA Vehicle Tax', 'statutory', 'Online via DVLA',
    NULL, '0300 790 6802', 'https://www.gov.uk/vehicle-tax-refund',
    'Tax is auto-cancelled when you tell DVLA you''ve sold / SORN''d the vehicle. Any full months unused are refunded automatically.',
    ARRAY['dvla vehicle tax']),
  ('council tax', 'Council Tax', 'statutory', 'Contact your local council',
    NULL, NULL, 'https://www.gov.uk/council-tax',
    'You can''t cancel Council Tax unless you move out or qualify for a discount / exemption. Contact your local council.',
    ARRAY[]::text[])
ON CONFLICT (provider) DO NOTHING;
