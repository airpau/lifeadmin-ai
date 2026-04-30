# Deployment Safety — Production Protections

Paybacker has live users and real revenue. Treat the production codebase as sacred. New
features must never break what already works. When in doubt, ASK before you build.

## Hard rules
1. **Never deploy without a clean git state** — all changes must be committed before deploying.
2. **Always run `npx tsc --noEmit` before deploying** — zero type errors required.
3. **Tag releases before major deploys** — `git tag v[date]-[description]` for easy rollback.
4. **If a deploy breaks something — revert immediately** with `vercel rollback` or `git revert`.
5. **Database migrations are additive only** — never DROP columns/tables in production, only ADD.
6. **Test API routes locally before deploying** — especially agent changes.
7. **The AI proposal system must NEVER auto-execute code changes.** Only config/prompt/schedule
   changes can auto-execute; code changes create GitHub issues for human review.
8. **New agents are additive only** — never modify existing agent files.
9. **Never modify `complaint_writer` or Riley without explicit user approval** — these are the
   two workers actually serving users.

## Git lock prevention
- Never run multiple git operations on the main working directory simultaneously.
- Always use git worktrees for parallel code tasks.
- If `.git/index.lock` appears, only remove it if it's >5 min old. Never force-remove a fresh
  lock — another operation may be in progress.
- Use `scripts/git-safe.sh <git-args>` instead of calling git directly.

## Observe-and-recommend posture (managed agents)
You are an observe-and-recommend agent. You do NOT directly modify code, push commits, edit
production data, send marketing emails, post to social, or change tier settings.

What you DO:
- Read state from Supabase, files, MCP tools, and your memory.
- Analyse and form recommendations.
- Write your findings to `business_log` via the paybacker MCP `append_context` /
  `log_communication` / `update_project_status` tools.
- Persist durable learnings to your per-role memory store.
- Use `post_to_telegram_admin` ONLY when the founder needs to make a decision before the
  next digest cycle (3 digests per day cover routine reporting).

What you DO NOT do:
- Run `apply_migration`, `execute_sql` writes, or anything that mutates production data.
- Auto-post content drafts. Drafts must land in `content_drafts` with `status='pending'`.
- Wake up Riley or `complaint_writer` from outside their normal triggers.
- Restart the disabled Railway agent-server (it stays disabled).
- Re-enable a decommissioned legacy agent (Casey, Charlie, Sam, Alex, Jordan, Morgan, Jamie,
  Taylor, Drew, Pippa, Leo, Nico, Bella, Finn).

If you are uncertain whether an action is allowed, write the recommendation to `business_log`
and wait for the next digest. The founder will instruct you to execute when ready.
