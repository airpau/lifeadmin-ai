-- 2026-05-16: register paybacker_opted_out template
--
-- Companion to the new entry in src/lib/whatsapp/template-registry.ts.
-- The template-registry header rule: every new template entry needs a
-- matching whatsapp_message_templates row so the SID lookup table and
-- updateTemplateStatus cron know about it.
--
-- Status is 'pending' until Paul submits the body to Meta via the
-- Twilio Content Template Builder and Meta approves. The body here is
-- the canonical source for resubmission — must match the registry exactly.
--
-- Strictly additive: INSERT ... ON CONFLICT DO NOTHING.

INSERT INTO whatsapp_message_templates (template_name, category, body_text, meta_status, twilio_status)
VALUES (
  'paybacker_opted_out',
  'utility',
  'You''ve been unsubscribed from Paybacker alerts. Reply SUBSCRIBE to re-enable them at any time.',
  'pending',
  'pending'
)
ON CONFLICT (template_name) DO NOTHING;
