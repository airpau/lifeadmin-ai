-- Documents vault integrations: Google Drive (drive.file) and Todoist.
--
-- Strictly additive. Tokens in both tables are written encrypted with
-- src/lib/email/token-crypto.ts (enc:v1: prefix) and read with
-- decryptToken, which also accepts legacy plain text.
--
-- RLS is enabled with NO end-user policies on purpose: these rows hold
-- OAuth tokens, so only server routes (service role) read or write them.
-- The dashboard learns the connection status from /api/documents/status.

-- ---------------------------------------------------------------------------
-- drive_connections: a drive.file grant used by the documents vault
-- ---------------------------------------------------------------------------
-- Separate from google_sheets_connections because connecting Sheets is
-- Pro only and has side effects (it creates a spreadsheet and starts a
-- backfill), while Drive import is available on every plan. When a Pro
-- user already has a Sheets connection (which also holds drive.file for
-- the same Google OAuth client) it is NOT reused: that connect asks
-- Google for include_granted_scopes, so its token can also carry the
-- Gmail scope. The vault only ever uses tokens from this table, whose
-- connect asks for drive.file and userinfo.email and nothing else.
CREATE TABLE IF NOT EXISTS public.drive_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email    text,
  access_token    text,
  refresh_token   text,
  token_expiry    timestamptz,
  scope           text,
  root_folder_id  text,           -- the "Paybacker" folder in the user's Drive, once created
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reauth', 'disconnected')),
  last_error      text,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drive_connections IS
  'Per-user Google Drive grant (drive.file only) for the documents vault: Picker import on every plan, and filing a copy of each document into a Paybacker folder for Pro. Tokens encrypted at rest. Service role only.';

-- ---------------------------------------------------------------------------
-- todoist_connections: Todoist OAuth for document reminders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.todoist_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token    text NOT NULL,
  scope           text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reauth', 'disconnected')),
  last_error      text,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.todoist_connections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.todoist_connections IS
  'Per-user Todoist OAuth token (data:read_write) used to create reminder tasks for document due, renewal and expiry dates. Token encrypted at rest. Service role only.';

-- updated_at triggers: table-specific functions (consumer_leads pattern),
-- because there is no shared set_updated_at() in production.
CREATE OR REPLACE FUNCTION public.drive_connections_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drive_connections_updated_at ON public.drive_connections;
CREATE TRIGGER drive_connections_updated_at
BEFORE UPDATE ON public.drive_connections
FOR EACH ROW EXECUTE FUNCTION public.drive_connections_set_updated_at();

CREATE OR REPLACE FUNCTION public.todoist_connections_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoist_connections_updated_at ON public.todoist_connections;
CREATE TRIGGER todoist_connections_updated_at
BEFORE UPDATE ON public.todoist_connections
FOR EACH ROW EXECUTE FUNCTION public.todoist_connections_set_updated_at();
