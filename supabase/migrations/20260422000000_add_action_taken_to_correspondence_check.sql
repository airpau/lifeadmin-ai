-- Add 'action_taken' to the correspondence.entry_type CHECK constraint.
-- The API (POST /api/disputes/[id]/correspondence) already accepts this value;
-- without this migration Supabase would reject the INSERT with a constraint error.
ALTER TABLE correspondence DROP CONSTRAINT IF EXISTS correspondence_entry_type_check;
ALTER TABLE correspondence ADD CONSTRAINT correspondence_entry_type_check CHECK (entry_type IN (
  'ai_letter',
  'company_email',
  'company_letter',
  'phone_call',
  'user_note',
  'company_response',
  'action_taken'
));
