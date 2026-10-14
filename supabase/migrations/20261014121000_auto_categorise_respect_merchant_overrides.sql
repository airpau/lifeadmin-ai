-- Respect the user's merchant-level category rules in
-- auto_categorise_transactions, and reconcile rows they were ignored on.
--
-- NOT YET APPLIED. Written alongside the Money Hub fixes on 2026-10-14
-- (branch claude/moneyhub-fixes). Apply through the normal migration
-- route after review.
--
-- Additive only: CREATE OR REPLACE of an existing function (same
-- signature, same return type; one extra key in the returned jsonb) and a
-- one-off call per user who has merchant overrides. No schema change.
--
-- Everything below the header is the production definition as of
-- 2026-10-14 (identical to 20260823230000_auto_categorise_merchant_and_
-- business_rules.sql) with Pass 0 added and override_tagged returned.

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
  override_count integer := 0;
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
  -- Pass 0: the user's own merchant rules (money_hub_category_overrides
  -- rows with a merchant_pattern) win over every keyword rule below.
  --
  -- Before this pass only PER-TRANSACTION overrides were respected, so a
  -- merchant the user had recategorised was re-tagged by the keyword
  -- rules on every sync. Measured 2026-10-14: "gymglitch greater londo"
  -- was set to software by the user, and all 28 of its rows were stored
  -- as marketing (the marketing rule names gymglitch); "revolve co-hosts"
  -- set to property_management, 23 rows stored as professional; "airprop
  -- ltd airprop" set to transfers, 12 rows / GBP 29,150 stored as other
  -- and therefore counted as spending by every RPC that reads
  -- user_category.
  --
  -- Matching is whitespace tolerant (bank descriptions pad columns with
  -- runs of spaces, saved patterns have single spaces) and the longest
  -- matching pattern wins, so "broxbourne councilcheshunt" beats
  -- "broxbourne". Overrides to 'other' are ignored, as in the app
  -- (money-hub-classification.buildMoneyHubOverrideMaps). Rows with a
  -- per-transaction override are never touched. Credits are only moved
  -- for 'transfers' and 'income' overrides; a spending label on a credit
  -- (a refund) is left to the app, as the recategorise route does.
  UPDATE bank_transactions bt
  SET    user_category = m.cat
  FROM (
    SELECT DISTINCT ON (t.id) t.id, o.user_category AS cat
    FROM   bank_transactions t
    JOIN   money_hub_category_overrides o
           ON  o.user_id = t.user_id
           AND o.transaction_id IS NULL
           AND COALESCE(TRIM(o.merchant_pattern), '') <> ''
           AND LOWER(TRIM(o.user_category)) <> 'other'
           AND (
                 regexp_replace(LOWER(COALESCE(t.merchant_name, '')), '\s+', ' ', 'g')
                   LIKE '%' || regexp_replace(LOWER(TRIM(o.merchant_pattern)), '\s+', ' ', 'g') || '%'
              OR regexp_replace(LOWER(COALESCE(t.description, '')), '\s+', ' ', 'g')
                   LIKE '%' || regexp_replace(LOWER(TRIM(o.merchant_pattern)), '\s+', ' ', 'g') || '%')
    WHERE  t.user_id = p_user_id
      AND  t.deleted_at IS NULL
      AND  (t.amount < 0 OR LOWER(o.user_category) IN ('transfers', 'income'))
      AND  NOT EXISTS (SELECT 1 FROM money_hub_category_overrides x
                       WHERE x.user_id = p_user_id AND x.transaction_id = t.id::text)
    ORDER  BY t.id, LENGTH(TRIM(o.merchant_pattern)) DESC
  ) m
  WHERE  bt.id = m.id
    AND  bt.user_category IS DISTINCT FROM m.cat;
  GET DIAGNOSTICS override_count = ROW_COUNT;
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
    'override_tagged',  override_count,
    'status',           'complete');
END;
$function$;

COMMENT ON FUNCTION public.auto_categorise_transactions IS
  'Called by cron/bank-sync after every sync. Pass 0 applies the user''s own merchant rules (money_hub_category_overrides.merchant_pattern, longest match wins, whitespace tolerant) and may correct a previously auto-filled row. Every later pass fills user_category ONLY where NULL and respects per-transaction overrides. Order: user merchant rules, transfers, income, merchant/business rules most-specific-first, then the direct-debit catch-all LAST.';

-- One-off reconciliation for users who already have merchant overrides.
SELECT public.auto_categorise_transactions(u.user_id)
FROM (SELECT DISTINCT user_id FROM money_hub_category_overrides
      WHERE transaction_id IS NULL AND user_id IS NOT NULL) u;
