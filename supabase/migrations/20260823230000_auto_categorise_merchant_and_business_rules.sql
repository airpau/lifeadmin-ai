-- Give auto_categorise_transactions real categorisation rules.
--
-- WHY
--
-- There are two categorisers in this codebase and the good one never
-- runs on its own:
--
--   /api/money-hub/sync           merchant rules + business rules + AI.
--                                 MANUAL. Not in vercel.json, only fires
--                                 when something invokes it.
--   auto_categorise_transactions  called by cron/bank-sync after EVERY
--                                 sync, for every user, and only ever
--                                 tagged three things: transfers, bills,
--                                 income.
--
-- So in normal operation almost nothing got a real category. On one live
-- account 1,107 transactions had user_category NULL and category 'DEBIT'
-- (the bank DIRECTION code), which downstream code then read as a
-- spending category: 'DEBIT' mapped to shopping in one path and fell
-- through to 'discretionary' in another. Energy costs never populated
-- because nothing was ever tagged 'energy' in the first place.
--
-- PR #579 stopped the wrong attribution. This makes the right
-- attribution actually happen, in the place that already runs.
--
-- DESIGN
--
--   * Only ever fills user_category WHERE IT IS NULL. Never overwrites a
--     user's choice, never overwrites an earlier pass.
--   * Every pass respects money_hub_category_overrides, like the
--     existing three did.
--   * Ordered most-specific-first, and the direct-debit "bills" rule
--     moved LAST. It matches on a payment METHOD, not a category, so
--     while it ran first it swallowed energy, rates and rent.
--   * Business rules apply to ALL accounts rather than being gated on
--     bank_connections.is_business. Nothing writes that column (it was
--     backfilled once by bank_name ILIKE '%business%' and never
--     maintained), so gating on it would mean these rules never fire.
--     The patterns are specific enough that a personal account matching
--     'iwoca' or 'nndr' genuinely is that.
--   * Returns per-pass counts so a run is inspectable.
--
-- MEASURED on the two live accounts this was written against:
--   gym account       386 transactions categorised
--   personal account  237 transactions categorised
--   energy went from nothing to 25 rows / GBP 39,030, including both
--   British Gas bills; rent GBP 72,000; tax GBP 92,642;
--   business rates GBP 31,649.
--
-- Already applied to production via the Supabase migration of the same
-- name. This file exists so the repo and the database agree.

CREATE OR REPLACE FUNCTION public.auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  transfer_count integer := 0;
  bills_count    integer := 0;
  income_count   integer := 0;
  merchant_count integer := 0;
  touched        integer := 0;
  rec            record;
  -- category, regex, direction ('out' | 'in' | 'any'). Most specific first.
  rules CONSTANT text[][] := ARRAY[
    ['energy',        '(british gas|edf energy|edf |e\.on|eon next|npower|scottish power|octopus energy|ovo energy|bulb energy|shell energy|utilita|so energy|good energy|ecotricity)', 'out'],
    ['water',         '(thames water|severn trent|anglian water|yorkshire water|united utilities|south west water|wessex water|northumbrian water|affinity water|everflow)', 'out'],
    ['broadband',     '(virgin media|sky digital|sky uk|bt group|bt broadband|plusnet|talktalk|hyperoptic|community fibre|gigaclear|zen internet)', 'out'],
    ['mobile',        '(vodafone|ee limited|three uk|tesco mobile|giffgaff|lebara|lycamobile|sky mobile|smarty)', 'out'],
    ['rent',          '(pcl transport|pcl rent|landlord|letting agent|lettings)', 'out'],
    ['mortgage',      '(mortgage|halifax mtg|nationwide bs|skipton bs)', 'out'],
    ['vat',           '(hmrc.*vat|vat payment)', 'out'],
    ['tax',           '(hmrc|hm revenue|paye|corporation tax|nndr)', 'out'],
    ['business_rates','(broxbourne|non-domestic rate|business rate)', 'out'],
    ['council_tax',   '(council tax|borough council|district council|city council)', 'out'],
    ['payroll',       '(payroll|wages|salaries|nest pension|peoples pension|smart pension)', 'out'],
    ['loans',         '(iwoca|funding circle|capital on tap|time broker|hsbc plc loans|loan repayment|lendinvest|zopa|novuna)', 'out'],
    ['credit_card',   '(barclaycard|amex|american express|mbna|capital one|vanquis)', 'out'],
    ['insurance',     '(aviva|axa |hiscox|zurich|direct line|admiral|churchill|simply business|policybee|insurance)', 'out'],
    ['fees',          '(gocardless|worldpay|sumup|zettle|square up|bank charge|service charge)', 'out'],
    ['software',      '(glofox|mindbody|xero|quickbooks|sage |freeagent|adobe|microsoft|google workspace|slack|notion|figma|canva|zoom\.us|dropbox|openai|anthropic)', 'out'],
    ['marketing',     '(google ads|facebk|facebook ads|meta platforms|mailchimp|hootsuite|semrush|gymglitch)', 'out'],
    ['equipment',     '(technogym|matrix fitness|life fitness|pulse fitness|escape fitness|screwfix|toolstation)', 'out'],
    ['groceries',     '(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-op food|iceland foods|ocado)', 'out'],
    ['fuel',          '(shell |bp |esso|texaco|gulf |applegreen|motor fuel)', 'out'],
    ['eating_out',    '(mcdonald|greggs|costa coffee|starbucks|pret a manger|nando|domino|just eat|deliveroo|uber eats|kfc |subway)', 'out'],
    ['transport',     '(trainline|tfl |transport for london|national rail|uber \*|bolt\.eu|addison lee)', 'out'],
    ['streaming',     '(netflix|spotify|disney|prime video|now tv|apple\.com/bill|youtube premium|audible)', 'out'],
    ['fitness',       '(energie fitness|puregym|the gym group|david lloyd|nuffield health|virgin active)', 'out']
  ];
BEGIN
  UPDATE bank_transactions
  SET    user_category = 'transfers'
  WHERE  user_id = p_user_id AND user_category IS NULL
    AND  (
           LOWER(COALESCE(description, '')) LIKE '%to a/c%'
        OR LOWER(COALESCE(description, '')) LIKE '%from a/c%'
        OR (amount < 0 AND LOWER(COALESCE(description, '')) LIKE '% fps %')
        OR LOWER(COALESCE(description, '')) LIKE '%internal transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%savings transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%isa transfer%')
    AND NOT EXISTS (SELECT 1 FROM money_hub_category_overrides o
                    WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text);
  GET DIAGNOSTICS transfer_count = ROW_COUNT;

  UPDATE bank_transactions
  SET    user_category = 'income'
  WHERE  user_id = p_user_id AND user_category IS NULL AND amount > 0
    AND  (
           LOWER(COALESCE(description, '')) LIKE '%salary%'
        OR LOWER(COALESCE(description, '')) LIKE '%payroll%'
        OR LOWER(COALESCE(description, '')) LIKE '%wages%'
        OR LOWER(COALESCE(description, '')) LIKE '%bacs%'
        OR LOWER(COALESCE(description, '')) LIKE '%chaps%'
        OR LOWER(COALESCE(description, '')) LIKE 'fps cr %'
        OR LOWER(COALESCE(description, '')) LIKE '% fps cr %'
        OR LOWER(COALESCE(description, '')) LIKE 'faster payment%'
        OR LOWER(COALESCE(description, '')) LIKE 'payment from%'
        OR LOWER(COALESCE(description, '')) LIKE '%stripe%'
        OR LOWER(COALESCE(description, '')) LIKE '%gocardless%'
        OR LOWER(COALESCE(description, '')) LIKE '%worldpay%'
        OR LOWER(COALESCE(description, '')) LIKE '%invoice%'
        OR UPPER(COALESCE(category, '')) IN ('CREDIT', 'INTEREST'))
    AND NOT (
          LOWER(COALESCE(description, '')) LIKE '%from a/c%'
       OR LOWER(COALESCE(description, '')) LIKE '%internal transfer%'
       OR LOWER(COALESCE(description, '')) LIKE '%isa transfer%')
    AND NOT EXISTS (SELECT 1 FROM money_hub_category_overrides o
                    WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text);
  GET DIAGNOSTICS income_count = ROW_COUNT;

  FOR rec IN
    SELECT rules[i][1] AS cat, rules[i][2] AS pattern, rules[i][3] AS dir
    FROM generate_subscripts(rules, 1) AS i
    ORDER BY i
  LOOP
    UPDATE bank_transactions
    SET    user_category = rec.cat
    WHERE  user_id = p_user_id AND user_category IS NULL
      AND  (rec.dir = 'any' OR (rec.dir = 'out' AND amount < 0) OR (rec.dir = 'in' AND amount > 0))
      AND  LOWER(COALESCE(merchant_name, '') || ' ' || COALESCE(description, '')) ~ rec.pattern
      AND NOT EXISTS (SELECT 1 FROM money_hub_category_overrides o
                      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text);
    GET DIAGNOSTICS touched = ROW_COUNT;
    merchant_count := merchant_count + touched;
  END LOOP;

  -- LAST on purpose. "direct debit" / "standing order" is a payment
  -- METHOD, not a category. While this ran first it swallowed energy,
  -- rates and rent. Kept as the catch-all it always was.
  UPDATE bank_transactions
  SET    user_category = 'bills'
  WHERE  user_id = p_user_id AND user_category IS NULL AND amount < 0
    AND  (LOWER(COALESCE(description, '')) LIKE '%direct debit%'
       OR LOWER(COALESCE(description, '')) LIKE '%standing order%')
    AND NOT EXISTS (SELECT 1 FROM money_hub_category_overrides o
                    WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text);
  GET DIAGNOSTICS bills_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'transfers_tagged', transfer_count,
    'income_tagged',    income_count,
    'merchant_tagged',  merchant_count,
    'bills_tagged',     bills_count,
    'status',           'complete');
END;
$function$;

COMMENT ON FUNCTION public.auto_categorise_transactions IS
  'Called by cron/bank-sync after every sync. Fills user_category ONLY where NULL, never overwrites a user choice, and always respects money_hub_category_overrides. Order is deliberate: transfers, then income, then merchant/business rules most-specific-first, then the direct-debit catch-all LAST so a payment method cannot swallow a real category.';
