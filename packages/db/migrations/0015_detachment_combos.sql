-- 0015_detachment_combos.sql
--
-- 11th edition armies take MULTIPLE detachments (measured 2026-07-29: 3,978 of
-- 6,246 scraped Jun-Jul lists carry a "Detachment Points" marker — 64%). The
-- existing model stores exactly one detachment per player, which silently
-- represents a two-detachment army as a one-detachment army.
--
-- 11e rules: each detachment costs 1-3 Detachment Points; the budget is 2 DP at
-- Incursion (1,000 pts) and 3 DP at Strike Force (2,000 pts). So a legal Strike
-- Force army is one 3pt, or a 2pt + a 1pt, or three 1pt detachments.
--
-- This migration adds:
--   1. dim_detachment.dp             — the point cost, sourced from the brain
--   2. dim_detachment_combo          — the SET of detachments as a first-class
--                                      dimension, so "which pairing wins" is an
--                                      indexed lookup rather than a query-time
--                                      GROUP_CONCAT
--   3. meta_event_player_detachment  — bridge: one row per detachment per player
--   4. combo_id on meta_event_players and fact_game_results
--
-- meta_event_players.detachment_id is KEPT and continues to hold the primary
-- (position 1) detachment, so existing queries and the cube keep working while
-- consumers migrate to combo_id.

-- 1. Detachment point cost. Nullable: 10e-era rows in dim_detachment have no
--    11e cost and must stay distinguishable from a cost of 0.
ALTER TABLE dim_detachment ADD COLUMN dp INTEGER;

-- 2. The combination dimension.
--    id is the faction plus its members' slugs sorted and joined with "+", so
--    the same set always produces the same id regardless of the order a player
--    happened to write them in.
--    is_legal marks combos enumerated from the DP rules. Combos observed in
--    real lists that are NOT legal (bad data, unknown detachment, illegal
--    build) still get a row so fact rows have something to reference — they
--    are recorded with is_legal = 0 rather than silently dropped.
CREATE TABLE IF NOT EXISTS dim_detachment_combo (
  id TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL REFERENCES dim_faction(id),
  member_count INTEGER NOT NULL,
  total_dp INTEGER,
  is_legal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dim_detachment_combo_faction
  ON dim_detachment_combo(faction_id);
CREATE INDEX IF NOT EXISTS idx_dim_detachment_combo_legal
  ON dim_detachment_combo(is_legal);

-- Bridge from a combo to its member detachments. Lets you ask "every combo
-- containing Shield Host" without parsing the combo id.
CREATE TABLE IF NOT EXISTS dim_detachment_combo_member (
  combo_id TEXT NOT NULL REFERENCES dim_detachment_combo(id) ON DELETE CASCADE,
  detachment_id TEXT NOT NULL REFERENCES dim_detachment(id),
  PRIMARY KEY (combo_id, detachment_id)
);

CREATE INDEX IF NOT EXISTS idx_dim_detachment_combo_member_detachment
  ON dim_detachment_combo_member(detachment_id);

-- 3. What each player actually brought. position preserves the order written
--    in the list; detachment_points is the per-detachment cost at the time the
--    list was played, denormalised on purpose so historical rows survive a
--    later points change in dim_detachment.
CREATE TABLE IF NOT EXISTS meta_event_player_detachment (
  player_id TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
  detachment_id TEXT NOT NULL REFERENCES dim_detachment(id),
  position INTEGER NOT NULL,
  detachment_points INTEGER,
  PRIMARY KEY (player_id, detachment_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_event_player_detachment_detachment
  ON meta_event_player_detachment(detachment_id);

-- 4. combo_id on the player row and on the fact grain. Fact grain is unchanged
--    (one row per player per game) — the combo is an attribute of the army, not
--    a reason to fan out rows, which would corrupt game counts.
ALTER TABLE meta_event_players ADD COLUMN combo_id TEXT REFERENCES dim_detachment_combo(id);
ALTER TABLE fact_game_results ADD COLUMN combo_id TEXT REFERENCES dim_detachment_combo(id);

CREATE INDEX IF NOT EXISTS idx_meta_event_players_combo ON meta_event_players(combo_id);
CREATE INDEX IF NOT EXISTS idx_fact_game_results_combo ON fact_game_results(combo_id);
