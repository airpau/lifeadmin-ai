-- Migrate existing complaint_letter tasks into the new disputes + correspondence model
-- This is safe to run multiple times (idempotent)

-- For each existing complaint_letter task that doesn't already have a dispute_id,
-- create a dispute and link the task + correspondence entry

DO $$
DECLARE
  task_row RECORD;
  new_dispute_id UUID;
  letter_content TEXT;
BEGIN
  FOR task_row IN
    SELECT t.id, t.user_id, t.provider_name, t.description, t.disputed_amount,
           t.account_number, t.status, t.created_at, t.title,
           ar.output_data
    FROM tasks t
    LEFT JOIN agent_runs ar ON ar.task_id = t.id AND ar.agent_type = 'complaint_writer'
    WHERE t.type = 'complaint_letter'
      AND t.dispute_id IS NULL
      AND t.provider_name IS NOT NULL
    ORDER BY t.created_at ASC
  LOOP
    -- Map old task status to dispute status
    DECLARE
      dispute_status TEXT := 'open';
    BEGIN
      IF task_row.status IN ('resolved_success') THEN
        dispute_status := 'resolved_won';
      ELSIF task_row.status IN ('resolved_partial') THEN
        dispute_status := 'resolved_partial';
      ELSIF task_row.status IN ('resolved_failed') THEN
        dispute_status := 'resolved_lost';
      ELSIF task_row.status IN ('awaiting_response') THEN
        dispute_status := 'awaiting_response';
      ELSIF task_row.status IN ('escalated') THEN
        dispute_status := 'escalated';
      ELSIF task_row.status IN ('cancelled') THEN
        dispute_status := 'closed';
      ELSE
        dispute_status := 'open';
      END IF;

      -- Create the dispute
      INSERT INTO disputes (
        user_id, provider_name, issue_type, issue_summary,
        disputed_amount, account_number, status, created_at, updated_at
      ) VALUES (
        task_row.user_id,
        task_row.provider_name,
        'complaint', -- default type for legacy letters
        COALESCE(task_row.description, 'Migrated from letter history'),
        task_row.disputed_amount,
        task_row.account_number,
        dispute_status,
        task_row.created_at,
        task_row.created_at
      )
      RETURNING id INTO new_dispute_id;

      -- Link the task to the dispute
      UPDATE tasks SET dispute_id = new_dispute_id WHERE id = task_row.id;

      -- Create correspondence entry for the AI letter
      letter_content := '';
      IF task_row.output_data IS NOT NULL AND task_row.output_data->>'letter' IS NOT NULL THEN
        letter_content := task_row.output_data->>'letter';
      END IF;

      IF letter_content != '' THEN
        INSERT INTO correspondence (
          dispute_id, user_id, entry_type, title, content, task_id, entry_date, created_at
        ) VALUES (
          new_dispute_id,
          task_row.user_id,
          'ai_letter',
          task_row.title,
          letter_content,
          task_row.id,
          task_row.created_at,
          task_row.created_at
        );
      END IF;
    END;
  END LOOP;
END $$;
