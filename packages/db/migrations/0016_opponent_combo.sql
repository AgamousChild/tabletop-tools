-- 0016_opponent_combo.sql
--
-- fact_game_results already mirrors every army dimension for the opponent
-- (opponent_faction_id, opponent_subfaction_id, opponent_detachment_id) so a
-- matchup question is an indexed SELECT rather than a join back to
-- meta_event_players. Migration 0015 added combo_id but not its mirror, which
-- left the detachment SET as the only dimension you could not ask "versus" of —
-- and combo-vs-combo is the question the combo model exists to answer.
ALTER TABLE fact_game_results ADD COLUMN opponent_combo_id TEXT
  REFERENCES dim_detachment_combo(id);

CREATE INDEX IF NOT EXISTS idx_fact_game_results_combo_matchup
  ON fact_game_results(combo_id, opponent_combo_id);
