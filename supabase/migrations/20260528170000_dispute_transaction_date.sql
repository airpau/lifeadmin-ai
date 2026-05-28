-- WhatsApp Pocket Agent — pre-flight grounding gate needs a real
-- `transaction_date` on each dispute. Today the dispute row only carries
-- `created_at` (when the dispute was OPENED, not when the disputed
-- transaction happened) and `disputed_amount`, but the date the charge
-- actually appeared on the bill is critical context for any UK consumer
-- rights letter (it sets the limitation-period clock under the Limitation
-- Act 1980 and is the anchor for "the £X charge on …" prose).
--
-- Strictly additive — nullable so existing rows stay valid. The grounded
-- letter writer treats null as "ask the user" and persists their answer
-- back here via `update_dispute_field`.

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS transaction_date DATE;

COMMENT ON COLUMN disputes.transaction_date IS
  'Date the disputed transaction occurred (NOT when the dispute was opened — that is created_at). Required by the WhatsApp Pocket Agent grounded letter writer; nullable for legacy rows.';
