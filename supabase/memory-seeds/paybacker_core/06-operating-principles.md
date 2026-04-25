# Operating Principles — How the Managed-Agent System Works

## The reporting loop
Every managed-agent session follows the same loop. Memorise this.

1. **Read shared core** — confirm you've internalised `paybacker_core` (this store).
2. **Read your per-role memory** — recall prior findings, past recommendations, what worked.
3. **Read live state** — pull the data your role needs from Supabase (via the paybacker MCP
   server, or by writing read-only SQL through the Supabase MCP if available).
4. **Analyse** — form observations, recommendations, and a confidence level.
5. **Write to `business_log`** — every session, every time, even on a clean run. Use the
   paybacker MCP `append_context` tool with `file: "business-ops.md"`. Format:
   ```
   ## [agent_name] — [ISO timestamp]
   - Status: clean | finding | escalation
   - Findings: <bulleted list>
   - Recommendation: <single sentence, or "none">
   - Needs founder decision by: <ISO date or "next digest">
   ```
6. **Persist durable learnings to per-role memory** — only what is durable. Stamps and status
   notes belong in `business_log`, not in memory. Use `memory_type: learning` (something we
   discovered) or `memory_type: decision` (a rule we adopted).
7. **Telegram intervention?** Only if (a) something needs the founder's decision BEFORE the
   next digest cycle, OR (b) severity = critical.

## Three-digest cadence (UTC)
- **07:00** — Morning digest. Yesterday's activity + overnight findings + what needs decision.
- **12:30** — Midday digest. Morning agent runs + new findings.
- **19:00** — Evening digest. Day's roll-up + tomorrow's agent schedule.

The digest is built by `/api/cron/agent-digest` reading the last 8/5/7 hours of `business_log`
+ recent `executive_reports`. Format on Telegram:

```
🟢 Paybacker — [date] [time] digest
Active: <n agents fired since last digest>

🔍 Findings
• <agent>: <one-line finding>

⚠️ Needs your decision
• <recommendation> [✅ approve / ❌ skip / 🔍 ask agent]
```

If the cycle is fully clean, the digest still fires with a one-line "all clean" so you can see
the system is alive.

## Intervention thresholds (for `post_to_telegram_admin`)

Only post mid-cycle if one of these is true:
- **Critical**: production user-facing breakage detected (e.g. complaint letter generation
  failing, Stripe webhook 500s, Riley support agent silent for >2 hours).
- **Time-sensitive decision**: founder needs to approve something within 6 hours or revenue
  is at risk (e.g. expiring Meta token, a campaign about to send to wrong segment).
- **Security**: suspected leak, exposed API key, RLS policy regression.
- **Founder explicitly asked**: prior message with `priority=high` waiting for a follow-up.

If unsure → don't ping. Write to `business_log`. The next digest will surface it.

## Severity vocabulary
- `info` — routine clean run, no action needed.
- `notice` — interesting pattern worth noting, no action this cycle.
- `recommend` — proposed action, founder decides.
- `warn` — something is degraded, founder should know within next digest.
- `critical` — production impact, ping immediately.

## Memory hygiene
- Per-role memory files: max 100 KB each (Anthropic limit). If you write more, summarise.
- Title format: `<YYYY-MM-DD> <one-line summary>`.
- Prefer fewer high-quality `learning` files over many `context` snapshots.
- Stamp every memory file with the date you wrote it.
- Don't write secrets (API keys, user PII, complaint-letter user addresses) into memory.
  If you need to reference, point to the table+row id, not the value.

## Conflict resolution
If memory contradicts what you observe in live data, trust live data. Write a `learning` to
your per-role memory recording what changed and when. The founder will reconcile in the
next digest.
