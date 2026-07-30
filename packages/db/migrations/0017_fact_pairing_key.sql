-- 0017_fact_pairing_key.sql
--
-- fact_game_results had no key of its own. Idempotency rested entirely on
-- buildCubeForEvents issuing DELETE-by-event then INSERTs as separate,
-- non-transactional statements — so anything that re-applied a request
-- duplicated rows silently.
--
-- It did. The 2026-07-30 rebuild of 155 events left 23,995 duplicate rows
-- (90,690 rows for 66,695 real games), each affected game counted twice in
-- every win rate, with no error anywhere.
--
-- The grain is one row per player per GAME, and a game is a pairing.
-- (event_id, player_id, round) looks like the natural key but is not: 27
-- players legitimately have two pairings in one round against different
-- opponents. The pairing is what identifies the game.
--
-- pairing_id is nullable because rows written before this migration have no
-- pairing to point at; SQLite treats NULLs as distinct, so those rows neither
-- block the index nor gain its protection until their event is next rebuilt.
ALTER TABLE fact_game_results ADD COLUMN pairing_id TEXT REFERENCES meta_pairings(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fact_game_results_pairing_player
  ON fact_game_results(pairing_id, player_id);
