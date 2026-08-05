-- 0018_rollup_granularities.sql
--
-- The cube was only half built. meta_top carried subfaction_id and
-- detachment_id columns and dim_granularity defined Faction / SubFaction /
-- Detachment, but the builder only ever grouped by faction and wrote
-- granularity_id = 1. Measured 2026-07-31: 6,859 rollup rows, every one of them
-- Faction, zero SubFaction, zero Detachment.
--
-- So every detachment-level question was a runtime aggregation over 75k
-- fact_game_results rows at request time — 4.3s for the detachment breakdown
-- and 3.7s for top lists on the faction page. That is exactly what the cube
-- exists to prevent: the interface reads pre-aggregated rollups, not joins.
--
-- Adds the combo level. A detachment COMBINATION is not a detachment, so it
-- cannot ride on granularity 3 — it needs its own level and its own key.
ALTER TABLE meta_top ADD COLUMN combo_id TEXT REFERENCES dim_detachment_combo(id);

-- dim_granularity is data, not schema, but the rollup builder and the API both
-- resolve this level BY NAME at runtime, so the row has to exist for the level
-- to be reachable at all.
INSERT OR IGNORE INTO dim_granularity (id, name) VALUES (4, 'Combo');

-- The read path is always (granularity, faction, frame) — that is the shape of
-- every dashboard query.
CREATE INDEX IF NOT EXISTS idx_meta_top_gran_faction_frame
  ON meta_top(granularity_id, faction_id, meta_for_id);
CREATE INDEX IF NOT EXISTS idx_meta_top_combo ON meta_top(combo_id);
CREATE INDEX IF NOT EXISTS idx_meta_top_detachment ON meta_top(detachment_id);

-- The display label for a combo ("Cursed Legion + Skyshroud Spearhead"),
-- denormalised onto the dimension row.
--
-- Deliberate star-schema denormalisation: dimensions are wide so the read path
-- does not have to reassemble them. Building this label at request time meant a
-- GROUP_CONCAT subquery across dim_detachment_combo_member per combo, which is
-- exactly the join the cube exists to remove. The bridge table stays — it is
-- how you ask "every combo containing Shield Host" — but the interface never
-- touches it.
ALTER TABLE dim_detachment_combo ADD COLUMN members TEXT;
