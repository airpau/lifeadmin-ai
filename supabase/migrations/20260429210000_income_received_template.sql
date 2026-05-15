-- paybacker_income_received WhatsApp template — DB rows.
--
-- The TypeScript registry (src/lib/whatsapp/template-registry.ts) has the
-- canonical entry; these rows give the in-DB template-status reconciler
-- (whatsapp_message_templates) and the SID lookup table
-- (whatsapp_template_sids) something to read when the
-- update-template-status cron next runs.
--
-- Status fields are deliberately set to 'pending' — the SID column is
-- a placeholder string. Once the founder runs the submit-template
-- script (or the admin UI is built), both rows are updated with the
-- real SID, twilio_status='approved', and meta_status='approved'.
--
-- Both INSERTs use ON CONFLICT DO NOTHING so this migration is idempotent
-- and safe to re-run.

INSERT INTO whatsapp_message_templates
  (template_name, category, language_code, body_text, meta_status, twilio_status)
VALUES (
  'paybacker_income_received',
  'UTILITY',
  'en_GB',
  '{{1}} from {{2}} just landed in your account. Lifetime received: {{3}}. Tap to see the breakdown.',
  'pending',
  'pending'
)
ON CONFLICT (template_name) DO NOTHING;

INSERT INTO whatsapp_template_sids
  (template_name, sid, approval_status, category, language, notes)
VALUES (
  'paybacker_income_received',
  'PENDING_RESUBMISSION',
  'pending',
  'UTILITY',
  'en',
  'Submitted via PR feat/whatsapp-income-received-template (2026-04-29). Resubmit via Twilio Content API to populate the real SID before this template can fire outside the 24h customer-service window. Inside the window the dispatcher substitutes free-form text via renderAlertText(income_received).'
)
ON CONFLICT (template_name) DO NOTHING;
