-- Add unique constraint on user_id to prevent duplicate bank connections on reconnect
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_user_id_key UNIQUE (user_id);
