ALTER TABLE username_change_intents ADD COLUMN used_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_username_intents_used ON username_change_intents(used_at);
