ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_data TEXT; -- base64 encoded image
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_generated_at TIMESTAMPTZ;
