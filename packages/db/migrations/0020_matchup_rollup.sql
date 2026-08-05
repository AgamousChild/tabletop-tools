-- 0020_matchup_rollup.sql
--
-- The matchup matrix was the last runtime aggregation on the dashboard: a
-- GROUP BY across 75k fact_game_results rows on every page load, joined to
-- dim_faction twice.
--
-- It also had two correctness bugs that the rollup fixes by construction:
--
--   1. It ignored the frame entirely. `frame` was accepted as an input and
--      never referenced in the WHERE clause, so the matrix showed ALL-TIME
--      matchups no matter which quarter the selector said.
--   2. It was faction-only regardless of the selected granularity, so
--      switching to Detachment or Combo left a faction-vs-faction matrix
--      sitting underneath a detachment table.
--
-- Keyed by granularity so combo-vs-combo is the same shape as faction-vs-
-- faction. key_a < key_b is enforced by the builder, so each pairing appears
-- once and a_wins/b_wins are read relative to that ordering.
CREATE TABLE IF NOT EXISTS meta_matchup (
  id TEXT PRIMARY KEY,
  granularity_id INTEGER NOT NULL REFERENCES dim_granularity(id),
  meta_for_id TEXT NOT NULL REFERENCES meta_for(id),
  key_a TEXT NOT NULL,
  key_b TEXT NOT NULL,
  a_wins INTEGER NOT NULL DEFAULT 0,
  b_wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  a_win_rate REAL NOT NULL DEFAULT 0
);

-- The read is always (granularity, frame) — one clause, one composite key.
CREATE INDEX IF NOT EXISTS idx_meta_matchup_gran_frame
  ON meta_matchup(granularity_id, meta_for_id);
