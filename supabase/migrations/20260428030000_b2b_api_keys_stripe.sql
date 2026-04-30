-- Link a B2B API key to its Stripe subscription so the webhook can
-- mint on checkout.session.completed and revoke on customer.subscription.deleted.
ALTER TABLE b2b_api_keys
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS b2b_api_keys_stripe_sub_idx
  ON b2b_api_keys (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
