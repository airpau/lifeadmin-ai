# TASK: Complaints Page — 3 Bug Fixes

## Bug 1: "Yes, it's great" button does nothing

In src/app/dashboard/complaints/page.tsx, the "Yes, it's great" button currently calls:
`onClick={() => setShowFeedback(false)}`

This does nothing useful — showFeedback is already false at that point.

**Fix:** The button should:
1. Mark the task/letter as confirmed/approved in the database — update the task status to 'approved' in the tasks table (add a PATCH /api/complaints/[id]/approve route if needed, or use the existing tasks table to set status='approved')
2. Show a success state in the UI — replace the satisfaction prompt with a green confirmation: "✅ Letter saved to your history" 
3. The confirmed state should persist — if the user closes and reopens the letter modal, it should show as already confirmed (check task.status === 'approved')

Create src/app/api/complaints/[id]/approve/route.ts:
- PATCH endpoint
- Authenticate user
- Update tasks table: set status='approved', updated_at=now() where id=[id] AND user_id=[user_id]
- Return { ok: true }

## Bug 2: History tab — letters not editable / amendable

When clicking a letter in the History tab, it opens the LetterModal which is READ ONLY. Users should be able to amend the content.

**Fix:** Add an edit mode to LetterModal:
- Add an "Edit Letter" button (pencil icon) in the modal header
- When clicked, replace the `<pre>` display with a `<textarea>` containing the letter text
- Add "Save Changes" button that:
  - PATCHes to /api/complaints/[id]/letter with the new letter text
  - Saves the updated letter back to agent_runs output_data.letter in Supabase
  - Shows "Saved ✓" confirmation
  - Returns to read mode
- Add "Cancel" button to discard edits

Create src/app/api/complaints/[id]/letter/route.ts:
- PATCH endpoint
- Authenticate user
- Verify task belongs to user
- Update agent_runs table: set output_data = jsonb_set(output_data, '{letter}', $letter) where task_id=[id]
- Return { ok: true }

## Bug 3: Plan gating not enforced on complaints — free users can generate unlimited letters

The usage check exists in /api/complaints/usage but the generate endpoint isn't properly blocking users who've hit their limit. Also the Supabase function `increment_usage` may not exist.

**Fix:**

1. Check if the `usage_logs` table and `increment_usage` RPC function exist in Supabase. If not, create a migration:

Create supabase/migrations/20260321140000_usage_logs.sql:
```sql
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  year_month TEXT NOT NULL, -- format: YYYY-MM
  count INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, action, year_month)
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON usage_logs FOR SELECT USING (auth.uid() = user_id);

-- Atomic increment function (upsert)
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_action TEXT, p_year_month TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_logs (user_id, action, year_month, count)
  VALUES (p_user_id, p_action, p_year_month, 1)
  ON CONFLICT (user_id, action, year_month)
  DO UPDATE SET count = usage_logs.count + 1, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

2. In src/app/api/complaints/generate/route.ts — check the usage check is actually enforced BEFORE generating the letter:
- Call checkUsageLimit at the START of the POST handler
- If !result.allowed, return 403 with { upgradeRequired: true, used: result.used, limit: result.limit, tier: result.tier }
- Only call incrementUsage AFTER successful generation

3. Apply the migration using the Supabase connection:
```
PGPASSWORD='[REDACTED-DB-PASS]' psql "postgresql://postgres@db.kcxxlesishltdmfctlmo.supabase.co:5432/postgres" -f supabase/migrations/20260321140000_usage_logs.sql
```

## NOTES
- TypeScript throughout, follow existing patterns  
- The tasks table is the source of truth for complaints — check its schema before writing queries
- Run `npm run build` when done to confirm no errors
- Commit all changes

When completely finished, run: openclaw system event --text "Done: Paybacker complaints fixes — approve button, editable history, plan gating enforced" --mode now
