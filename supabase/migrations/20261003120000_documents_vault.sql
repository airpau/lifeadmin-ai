-- Documents vault (stage two of the email upgrade).
--
-- Strictly additive: new tables, new indexes, one new nullable column on
-- email_connections (documents_scanned_at), a new private storage bucket
-- and its read policy. Nothing existing is changed or dropped.
--
-- Why a new table rather than the Contract Vault's contract_extractions:
-- contract_extractions has a CHECK constraint that every row is linked to
-- a dispute or a subscription, and its columns are contract terms
-- (notice period, unfair clauses, cooling off). A receipt, a gas safety
-- certificate or a bank statement fits none of that, and loosening the
-- constraint would change what the Contract Vault page shows. The two
-- vaults sit side by side; the Contract Vault is untouched.
--
-- Why a new bucket rather than the existing `contracts` bucket: the
-- `contracts` bucket's storage policies are not in version control (it
-- was created through the dashboard), so we cannot reason about who can
-- read what in it. `documents` is created here with its policy in the
-- same file, a 15 MB object cap, and objects always stored under
-- `<user_id>/...` so the owner-only read rule is a single expression.

-- ---------------------------------------------------------------------------
-- documents: one row per stored file
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Where it came from
  source                text NOT NULL CHECK (source IN ('email', 'drive', 'upload')),
  -- email_connections.id for email documents. No foreign key on purpose:
  -- disconnecting an inbox must not delete the user's saved documents.
  connection_id         uuid,
  provider              text,           -- 'google' | 'outlook' | 'google_drive'
  message_id            text,           -- Gmail / Graph message id
  part_key              text,           -- attachment id or part id, 'body' for an email snapshot
  drive_source_file_id  text,           -- Drive file id when imported from Drive
  email_subject         text,
  email_from            text,
  email_date            timestamptz,

  -- The file
  filename              text NOT NULL,
  mime_type             text NOT NULL,
  size_bytes            bigint NOT NULL DEFAULT 0,
  sha256                text NOT NULL,
  storage_bucket        text NOT NULL DEFAULT 'documents',
  storage_path          text,

  -- What the classifier made of it
  doc_type              text NOT NULL DEFAULT 'other' CHECK (doc_type IN (
                          'receipt', 'invoice', 'bill', 'statement', 'certificate',
                          'policy', 'contract', 'letter', 'other'
                        )),
  supplier              text,
  amount                numeric(12, 2),
  currency              text,
  vat_amount            numeric(12, 2),
  doc_date              date,
  due_date              date,
  expiry_date           date,
  renewal_date          date,
  summary               text,
  confidence            numeric(4, 3) NOT NULL DEFAULT 0,
  classification_model  text,

  -- Pro: copy filed into the user's own Google Drive
  drive_file_id         text,
  drive_link            text,
  drive_filed_at        timestamptz,
  drive_error           text,

  -- Reminders
  todoist_task_id       text,

  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- The same file is never stored twice for one user, wherever it came from.
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_sha256_key
  ON public.documents (user_id, sha256);

-- The same attachment of the same message is never stored twice. NULL
-- message ids (Drive imports, uploads) are distinct, so they never clash.
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_message_part_key
  ON public.documents (user_id, provider, message_id, part_key);

CREATE INDEX IF NOT EXISTS documents_user_created_idx
  ON public.documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS documents_user_doc_date_idx
  ON public.documents (user_id, doc_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS documents_user_type_idx
  ON public.documents (user_id, doc_type)
  WHERE status = 'active';

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Owners may read their own rows. All writes go through server routes
-- using the service role, so there are deliberately no insert, update or
-- delete policies for end users.
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents"
  ON public.documents
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.documents IS
  'Documents vault: receipts, invoices, bills, statements, certificates, policies, contracts and letters found in connected inboxes or imported from Google Drive. Files live in the private documents storage bucket under <user_id>/. Written only by server routes (service role).';

-- ---------------------------------------------------------------------------
-- document_processed_messages: a message is only ever handled once
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_processed_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id    uuid NOT NULL,
  provider         text NOT NULL,
  message_id       text NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN (
                     'saved', 'duplicate', 'no_documents', 'not_document', 'skipped'
                   )),
  documents_saved  integer NOT NULL DEFAULT 0,
  detail           text,
  processed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_processed_messages_key
  ON public.document_processed_messages (user_id, connection_id, message_id);

CREATE INDEX IF NOT EXISTS document_processed_messages_user_idx
  ON public.document_processed_messages (user_id, processed_at DESC);

ALTER TABLE public.document_processed_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own processed messages" ON public.document_processed_messages;
CREATE POLICY "Users can view own processed messages"
  ON public.document_processed_messages
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.document_processed_messages IS
  'Bookkeeping for the documents vault: every email message the finder has fully handled, so it is never downloaded or classified twice. Transient failures and quota stops are NOT recorded, so those messages are retried next run.';

-- ---------------------------------------------------------------------------
-- Incremental cursor for automatic filing (additive column)
-- ---------------------------------------------------------------------------
-- Set only after a complete documents pass over an inbox. The daily cron
-- looks at messages since this time (less a two day overlap); the manual
-- "Find my documents" button always does a full lookback.
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS documents_scanned_at timestamptz;

-- ---------------------------------------------------------------------------
-- Private storage bucket for the files
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 15728640)
ON CONFLICT (id) DO NOTHING;

-- Owners may read objects under their own <user_id>/ prefix. Uploads and
-- deletes are server side with the service role, which bypasses RLS, so
-- there is no insert, update or delete policy for end users.
DROP POLICY IF EXISTS "documents_owner_read" ON storage.objects;
CREATE POLICY "documents_owner_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Keep updated_at current (reuse the shared trigger function if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at_documents ON public.documents;
    CREATE TRIGGER set_updated_at_documents
      BEFORE UPDATE ON public.documents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
