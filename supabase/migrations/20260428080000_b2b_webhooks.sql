-- Customer-configured webhooks for B2B API events.
-- Customers register a URL + signing secret + event subscription;
-- the server POSTs JSON with an HMAC-SHA256 signature header on
-- matching events (key.created, key.revoked, key.usage_threshold,
-- usage.daily_summary). Failed deliveries record status + error;
-- consecutive failures auto-disable to protect the customer's URL.

CREATE TABLE IF NOT EXISTS b2b_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  signing_secret_hash TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivery_at TIMESTAMPTZ,
  last_delivery_status INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_webhooks_email_idx
  ON b2b_webhooks (owner_email, created_at DESC);
CREATE INDEX IF NOT EXISTS b2b_webhooks_active_idx
  ON b2b_webhooks (is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS b2b_webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES b2b_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_webhook_deliveries_webhook_idx
  ON b2b_webhook_deliveries (webhook_id, created_at DESC);
