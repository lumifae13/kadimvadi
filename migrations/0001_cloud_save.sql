PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  character_id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  is_generated INTEGER NOT NULL DEFAULT 1 CHECK (is_generated IN (0, 1)),
  name_changes INTEGER NOT NULL DEFAULT 0 CHECK (name_changes >= 0),
  last_name_change_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  character_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES players(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_character ON sessions(character_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS username_change_intents (
  intent_id TEXT PRIMARY KEY,
  character_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL CHECK (price >= 0),
  expected_name_changes INTEGER NOT NULL CHECK (expected_name_changes >= 0),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES players(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_username_intents_character ON username_change_intents(character_id);
CREATE INDEX IF NOT EXISTS idx_username_intents_expiry ON username_change_intents(expires_at);

CREATE TABLE IF NOT EXISTS player_saves (
  character_id INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  save_version TEXT NOT NULL CHECK (length(save_version) BETWEEN 1 AND 32),
  state_json TEXT NOT NULL CHECK (length(state_json) <= 220000),
  player_class TEXT NOT NULL CHECK (player_class IN ('mage', 'warrior', 'ranger')),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10000),
  prestige INTEGER NOT NULL CHECK (prestige BETWEEN 0 AND 1000),
  total_kills INTEGER NOT NULL CHECK (total_kills BETWEEN 0 AND 1000000000),
  unique_count INTEGER NOT NULL CHECK (unique_count BETWEEN 0 AND 10000),
  power_score INTEGER NOT NULL CHECK (power_score >= 0),
  portrait_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES players(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_power
  ON player_saves(power_score DESC, level DESC, total_kills DESC, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_saves_updated ON player_saves(updated_at DESC);
