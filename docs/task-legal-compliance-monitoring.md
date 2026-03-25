# Task: Legal Compliance Monitoring via Leo (CLO)

## Status: SCHEDULED FOR NEXT SESSION

## Problem
Paybacker generates complaint letters citing specific UK laws (Consumer Rights Act 2015, Consumer Contracts Regulations 2013, UK261, Ofcom rules, Ofgem rules, etc.). If any of these laws change, our letters could cite outdated or incorrect legislation, which would damage user trust and potentially expose us to liability.

## What Leo (CLO) Should Monitor
Leo already has the Perplexity research tool. He needs enhanced instructions to:

1. **Weekly regulatory scan** - search Perplexity for:
   - Changes to Consumer Rights Act 2015
   - Updates to Consumer Contracts Regulations 2013
   - New Ofcom rules on broadband/mobile
   - New Ofgem rules on energy
   - UK261/EU261 flight compensation updates
   - FCA consumer credit regulation changes
   - GDPR/data protection updates
   - Council tax legislation changes
   - Parking charge appeal process changes
   - Debt collection regulation updates

2. **Audit complaint letter templates** - check the system prompts in:
   - /api/complaints/generate (main complaint letter AI)
   - /api/forms/generate (government form letters)
   - Verify all cited Acts and sections are still current

3. **Flag urgent changes** - if a law changes that affects our letters:
   - Create an urgent action_item for the founder
   - Create a task for Morgan (CTO) to update the letter generation prompts
   - Log to compliance_log table
   - Send alert email via Resend

4. **Monthly compliance report** - summarise:
   - All laws scanned and their current status
   - Any changes detected
   - Any letters that need updating
   - GDPR compliance status

## Implementation Steps

1. Update Leo's system prompt with the specific laws to monitor
2. Ensure Leo has research tools (already configured)
3. Add a 'log_compliance_check' tool that writes to compliance_log table
4. Set Leo's schedule to run weekly (already set)
5. Add specific instructions for what to do when changes are detected

## Current Leo Schedule
Every 2 days (from scheduler.ts MIN_INTERVALS)

## Recommended Schedule
Weekly scan is sufficient - legislation doesn't change daily

## Dependencies
- Leo already has: Perplexity research tool, Supabase tools, task creation
- compliance_log table already exists
- No new infrastructure needed

## Priority
CRITICAL - legal accuracy is the core differentiator of Paybacker. If letters cite wrong law, the product is worthless.
