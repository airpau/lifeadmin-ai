-- Multi-mode portal sign-in for B2B customers: password, Google OAuth,
-- Microsoft OAuth, plus the existing magic-link path. One row per email.
-- password_hash is bcrypt; oauth_*_sub stores the provider's stable
-- subject identifier so we never trust the email blindly. must_set_password
-- defaults TRUE so first-magic-link visitors are prompted to add a
-- password and skip the email round-trip on subsequent visits.
CREATE TABLE IF NOT EXISTS b2b_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  oauth_google_sub TEXT UNIQUE,
  oauth_microsoft_sub TEXT UNIQUE,
  must_set_password BOOLEAN NOT NULL DEFAULT TRUE,
  password_set_at TIMESTAMPTZ,
  last_sign_in_method TEXT CHECK (last_sign_in_method IN ('magic_link','password','google','microsoft')),
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_credentials_email_idx ON b2b_credentials (email);
