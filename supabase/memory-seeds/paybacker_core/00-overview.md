# Paybacker — Shared Operating Knowledge

This memory store is shared (read-only) across all 9 Claude Managed Agents. It holds product
facts, architecture rules, and operating principles that every agent must know before acting.
Read this first whenever you start a session. Do NOT write to this store from agent runs —
durable updates to product facts are made by the founder (Paul) via the bootstrap script in
`scripts/bootstrap-managed-agents-memory.ts`.

Files in this store:
- `01-product.md` — what Paybacker is, target audience, mission
- `02-pricing.md` — Free / Essential / Pro tier matrix and tier-logic rules
- `03-tech-stack.md` — stack, architecture rules, never-violate integration constraints
- `04-deployment-safety.md` — production safety, migration rules, code-change gating
- `05-agent-roster.md` — which agents are active, which are decommissioned, who reports what
- `06-operating-principles.md` — observe-and-recommend rule, digest cadence, escalation thresholds
- `07-features-detail.md` — granular per-feature breakdown with file paths and tables
- `08-data-model.md` — key tables, what they store, what NOT to touch
- `09-current-state.md` — where Paybacker is right now (priors; verify before citing)
- `10-coming-soon.md` — roadmap; what's planned but not built

If anything in your per-role memory contradicts this store, treat THIS store as the source of
truth and flag the conflict in your next session output.
