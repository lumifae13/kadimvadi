PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS player_cosmetics (
  character_id INTEGER NOT NULL,
  cosmetic_id TEXT NOT NULL CHECK (length(cosmetic_id) BETWEEN 1 AND 160),
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, cosmetic_id),
  FOREIGN KEY (character_id) REFERENCES players(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_cosmetics_character
  ON player_cosmetics(character_id, acquired_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_refreshes (
  period_key TEXT PRIMARY KEY,
  snapshot_day TEXT NOT NULL,
  generated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  period_key TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  public_id TEXT NOT NULL,
  username TEXT NOT NULL,
  player_class TEXT NOT NULL CHECK (player_class IN ('mage', 'warrior', 'ranger')),
  level INTEGER NOT NULL,
  prestige INTEGER NOT NULL,
  total_kills INTEGER NOT NULL,
  unique_count INTEGER NOT NULL,
  power_score INTEGER NOT NULL,
  portrait_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (period_key, character_id),
  FOREIGN KEY (character_id) REFERENCES players(character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard_power
  ON leaderboard_snapshots(period_key, power_score DESC, level DESC, total_kills DESC, character_id ASC);
