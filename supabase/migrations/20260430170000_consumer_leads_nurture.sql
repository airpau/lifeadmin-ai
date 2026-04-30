-- Consumer abandonment nurture CRM
--
-- B2C-only abandoned-checkout / pricing-page-exit nurture funnel.
-- The existing public.leads table is for social DM leads (Instagram,
-- Facebook, comment funnels) — keep it untouched. This migration adds
-- a separate consumer_leads table to model the SaaS-checkout funnel
-- without coupling the two.
--
-- Strictly additive. Idempotent.

CREATE TABLE IF NOT EXISTS public.consumer_leads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       text NOT NULL,
  name                        text,
  phone                       text,
  source                      text NOT NULL CHECK (source IN (
                                'signup_form',
                                'stripe_checkout_abandoned',
                                'pricing_page_exit',
                                'onboarding_dropoff'
                              )),
  stripe_checkout_session_id  text,
  stripe_customer_id          text,
  stripe_recovery_url         text,
  intended_tier               text CHECK (intended_tier IN ('essential', 'pro')),
  intended_billing_interval   text CHECK (intended_billing_interval IN ('monthly', 'yearly')),
  funnel_stage                text NOT NULL DEFAULT 'new' CHECK (funnel_stage IN (
                                'new',
                                'email_1_sent',
                                'email_2_sent',
                                'email_3_sent',
                                'email_4_sent',
                                'converted_paid',
                                'converted_free',
                                'unsubscribed',
                                'expired',
                                'manual_handling'
                              )),
  captured_at                 timestamptz NOT NULL DEFAULT now(),
  last_emailed_at             timestamptz,
  email_count                 integer NOT NULL DEFAULT 0,
  discount_code               text,
  discount_coupon_id          text,
  discount_code_expires_at    timestamptz,
  discount_redeemed_at        timestamptz,
  converted_at                timestamptz,
  converted_user_id           uuid,
  unsubscribed_at             timestamptz,
  unsubscribe_token           text NOT NULL,
  ip_address                  inet,
  user_agent                  text,
  utm_source                  text,
  utm_medium                  text,
  utm_campaign                text,
  notes                       text,
  last_contacted_via          text CHECK (last_contacted_via IN ('email', 'manual_note', 'phone')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consumer_leads_email_idx           ON public.consumer_leads (lower(email));
CREATE INDEX IF NOT EXISTS consumer_leads_funnel_stage_idx    ON public.consumer_leads (funnel_stage);
CREATE INDEX IF NOT EXISTS consumer_leads_captured_at_idx     ON public.consumer_leads (captured_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS consumer_leads_unsub_token_uniq
  ON public.consumer_leads (unsubscribe_token);
CREATE UNIQUE INDEX IF NOT EXISTS consumer_leads_session_uniq
  ON public.consumer_leads (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Updated-at trigger (re-uses the standard pattern other tables use)
CREATE OR REPLACE FUNCTION public.consumer_leads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consumer_leads_updated_at ON public.consumer_leads;
CREATE TRIGGER consumer_leads_updated_at
BEFORE UPDATE ON public.consumer_leads
FOR EACH ROW EXECUTE FUNCTION public.consumer_leads_set_updated_at();

ALTER TABLE public.consumer_leads ENABLE ROW LEVEL SECURITY;

-- Service role only. Admin endpoints use the service-role client; anon /
-- authed users have no business reading the lead funnel directly.
DROP POLICY IF EXISTS consumer_leads_service_role_all ON public.consumer_leads;
CREATE POLICY consumer_leads_service_role_all
  ON public.consumer_leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Audit log of every send (ICO retention)
CREATE TABLE IF NOT EXISTS public.consumer_lead_email_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_lead_id    uuid NOT NULL REFERENCES public.consumer_leads(id) ON DELETE CASCADE,
  template            text NOT NULL,
  subject             text,
  resend_message_id   text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS consumer_lead_email_log_lead_idx
  ON public.consumer_lead_email_log (consumer_lead_id, sent_at DESC);

ALTER TABLE public.consumer_lead_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumer_lead_email_log_service_role_all ON public.consumer_lead_email_log;
CREATE POLICY consumer_lead_email_log_service_role_all
  ON public.consumer_lead_email_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.consumer_leads IS
  'B2C abandonment nurture funnel. Captures pricing-page subscribe clicks and Stripe checkout.session.expired events. Drives 4-email Klaviyo-style nurture sequence with PECR soft opt-in unsubscribe handling. Does NOT include B2B leads (those flow through b2b_waitlist + founder-direct alerts).';

COMMENT ON TABLE public.consumer_lead_email_log IS
  'Append-only audit of every nurture email send. Retained for ICO direct-marketing audit. One row per send, never updated.';
