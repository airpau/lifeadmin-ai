-- Migrate legacy 'plus' subscription tier to 'pro'
-- 'plus' was an old name before the tier was renamed to 'pro'.
-- 6 rows in profiles had this stale value; they should be treated as Pro subscribers.

UPDATE profiles
SET subscription_tier = 'pro',
    updated_at = NOW()
WHERE subscription_tier = 'plus';
