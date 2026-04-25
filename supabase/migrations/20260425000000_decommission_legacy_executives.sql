-- Decommission legacy "executive" agents (Casey, Charlie, Sam, Alex, Jordan, Morgan, Jamie,
-- Taylor, Drew, Pippa, Leo, Nico, Bella, Finn). Their Railway agent-server was disabled
-- 2026-04-05 and they have produced no `executive_reports` rows since. We are replacing
-- them with 10 Claude Managed Agents (alert-tester, digest-compiler, support-triager,
-- email-marketer, ux-auditor, feature-tester, finance-analyst, bug-triager, reviewer,
-- builder) which now run with native memory.
--
-- This migration is ADDITIVE per CLAUDE.md rules: it sets `status='disabled'` on the
-- legacy rows. It does NOT delete rows, drop columns, or remove the table. Their
-- historical `executive_reports` remain intact for audit.
--
-- Riley (support_agent role) is preserved — it is the active worker firing every 15 min
-- via Vercel cron and must NOT be touched.

UPDATE ai_executives
SET
  status = 'disabled',
  updated_at = NOW(),
  config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
    'decommissioned_at', NOW()::text,
    'decommission_reason', 'Replaced by Claude Managed Agents with memory (April 2026 migration). Railway agent-server disabled 2026-04-05.',
    'replaced_by', CASE role
      WHEN 'cco' THEN 'email-marketer'
      WHEN 'cmo' THEN 'email-marketer'
      WHEN 'head_of_ads' THEN 'email-marketer'
      WHEN 'exec_assistant' THEN 'digest-compiler'
      WHEN 'support_lead' THEN 'support-triager'
      WHEN 'cto' THEN 'reviewer + bug-triager'
      WHEN 'cao' THEN 'reviewer'
      WHEN 'cxo' THEN 'ux-auditor'
      WHEN 'cro' THEN 'ux-auditor'
      WHEN 'cgo' THEN 'ux-auditor'
      WHEN 'clo' THEN 'feature-tester'
      WHEN 'cio' THEN 'feature-tester'
      WHEN 'cfo' THEN 'finance-analyst'
      WHEN 'cfraudo' THEN 'alert-tester'
      ELSE 'managed-agents (general)'
    END
  )
WHERE role IN (
  'cco',          -- Casey
  'cmo',          -- Taylor
  'head_of_ads',  -- Jordan
  'exec_assistant', -- Charlie
  'support_lead', -- Sam
  'cto',          -- Morgan
  'cao',          -- Jamie
  'cxo',          -- Bella
  'cro',          -- Pippa
  'cgo',          -- Drew
  'clo',          -- Leo
  'cio',          -- Nico
  'cfo',          -- Alex
  'cfraudo'       -- Finn
)
AND status <> 'disabled';

-- Audit row so the founder can see this migration ran in business_log.
-- INSERT IF NOT EXISTS pattern via WHERE NOT EXISTS to keep this idempotent on re-runs.
INSERT INTO business_log (category, title, content, created_by, created_at)
SELECT
  'agent_governance',
  'Decommissioned 14 legacy executive agents',
  'Replaced Casey, Charlie, Sam, Alex, Jordan, Morgan, Jamie, Taylor, Drew, Pippa, Leo, Nico, Bella, Finn with 10 Claude Managed Agents with memory (incl. finance-analyst). Railway agent-server stays disabled. Per-role replacement mapping in ai_executives.config.replaced_by.',
  'migration:20260425000000_decommission_legacy_executives',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM business_log
  WHERE created_by = 'migration:20260425000000_decommission_legacy_executives'
);
