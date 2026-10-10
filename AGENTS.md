<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Start of every session (do this first)

1. Run `git pull --ff-only` (if there are unsaved changes, skip the pull and say so).
2. Read `HANDOVER.md` if it exists.
3. Run `git status` and `git log -5`.
4. Tell Paul in a few plain lines where things stand, then wait for his instruction.

Paul switches between Claude, Codex and other tools, including from his phone. `HANDOVER.md` is how they stay in step. Before you stop, update it: what was asked, what is done, what is half done, the exact next step, and what must not be touched.


## Never deploy from a local folder

Only deploy code that is already pushed to GitHub. Before any deploy (`vercel --prod`, `fly deploy` or any other), run `git pull --ff-only`, then check that `git status` is clean and `git log origin/HEAD..HEAD` is empty. If either check fails, commit and push first (on a branch if you are not Claude). Never deploy uncommitted, unpushed or branch-only work. This stops one tool's deploy from wiping out another tool's work. Deploying pushed code the usual way is unchanged.
