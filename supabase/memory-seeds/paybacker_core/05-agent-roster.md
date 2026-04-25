# Agent Roster — Source of Truth

The Paybacker AI workforce is divided into three layers. Before you cite another agent's
output, verify recency in `agent_runs` / `executive_reports` / `business_log`. Configured ≠
firing.

## Layer 1 — User-facing workers (do not modify without founder approval)

| Worker | Trigger | Source | What it does |
|---|---|---|---|
| `complaint_writer` | On-demand (user clicks) | `src/app/api/complaints/generate/route.ts` | UK-legislation-cited complaint letters |
| `riley-support-agent` | Vercel cron (every 15 min) | `src/app/api/cron/support-agent/route.ts` | Support ticket auto-response |

## Layer 2 — Claude Managed Agents (this is YOU)

These ten agents run on platform.claude.com via beta header `managed-agents-2026-04-01`.
Each has its own memory store plus shared read access to `paybacker_core`. Triggered by
Vercel cron via `/api/cron/managed-agents`.

| Agent | Schedule (UTC) | Mission |
|---|---|---|
| `alert-tester` | 0 */6 * * * | Monitor MCP server health + error logs, raise alerts |
| `digest-compiler` | 0 7,12,17,20 * * * | Synthesise activity into shared-context handoff notes |
| `support-triager` | 0 */6 * * * | Triage tickets by severity/type, queue priorities |
| `email-marketer` | 0 8 * * * | Review engagement, propose lifecycle email drafts (pending) |
| `ux-auditor` | 0 9 * * * | Analyse support tickets + feedback for UX patterns |
| `feature-tester` | 0 10 * * * | Verify key API endpoints + critical user flows |
| `finance-analyst` | 0 11 * * * | Track MRR / churn / tier mix / Stripe webhook health |
| `bug-triager` | 0 */12 * * * | Categorise GitHub issues + error logs, recommend fixes |
| `reviewer` | 0 */12 * * * | Check open PRs against CLAUDE.md rules |
| `builder` | On-demand only | Pick highest-priority dev task, draft PR (founder reviews) |

The founder receives a Telegram digest at 07:00, 12:30, and 19:00 UTC summarising activity.
Mid-cycle Telegram pings only fire when something needs the founder's decision before the
next digest.

## Layer 3 — Intelligence crons (preserve, do not duplicate)

| Cron | Schedule | Purpose |
|---|---|---|
| `discover-features` | Daily 02:00 | Scans `src/` for new routes |
| `analyze-chatbot-gaps` | Mon 06:00 | Groups unanswered chatbot questions |
| `daily-ceo-report` | Daily | CEO summary email |
| `aggregate-provider-intelligence` | Sun 00:00 | Provider competitive analysis |

## Layer 4 — DECOMMISSIONED (do not cite, do not restart)

The Railway agent-server was disabled 5 April 2026. The following 14 legacy "executives" no
longer fire. Their `ai_executives.status` is `disabled`. Their historical
`executive_reports` rows remain for audit, but no new ones are produced.

`Casey (cco)`, `Charlie (exec_assistant)`, `Sam (support_lead)`, `Alex (cfo)`,
`Jordan (head_of_ads)`, `Morgan (cto)`, `Jamie (cao)`, `Taylor (cmo)`, `Drew (cgo)`,
`Pippa (cro)`, `Leo (clo)`, `Nico (cio)`, `Bella (cxo)`, `Finn (cfraudo)`.

The replacement mapping (their durable learnings have been seeded into the new agents):
- `Charlie (exec_assistant)` → `digest-compiler`
- `Sam (support_lead)` → `support-triager`
- `Casey (cco)` + `Taylor (cmo)` + `Jordan (head_of_ads)` → `email-marketer`
- `Morgan (cto)` → `reviewer` + `bug-triager`
- `Jamie (cao)` → `reviewer`
- `Bella (cxo)` + `Pippa (cro)` + `Drew (cgo)` → `ux-auditor`
- `Alex (cfo)` → `finance-analyst` (dedicated finance role)
- `Finn (cfraudo)` → `alert-tester`
- `Leo (clo)` + `Nico (cio)` → `feature-tester` (compliance + research signals)

If a stakeholder asks "what is Casey doing?", the answer is: nothing — Casey is
decommissioned; their content-drafting work is handled by `email-marketer` (drafts only,
pending founder approval as per the original Casey rule).

## Disabled endpoints (do not wire anything to)
- `/api/cron/executive-agents` — returns `{status: 'deprecated'}`. Stays that way.
- The Railway agent-server. Stays disabled.
