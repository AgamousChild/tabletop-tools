-- 0019_top_lists_index.sql
--
-- The faction page's "top lists" query is WHERE faction_id = ? ORDER BY
-- placement — one clause, two columns, so one composite key. Without it SQLite
-- found the rows by faction_id and then built a TEMP B-TREE to sort every one
-- of them before applying LIMIT 20.
--
-- Measured on prod: 594ms -> 87ms, and the temp B-tree disappears from the
-- query plan entirely.
--
-- (The same query also dropped a correlated GROUP_CONCAT subquery that ran per
-- row against meta_event_player_detachment — 3.7s — in favour of reading the
-- denormalised label off dim_detachment_combo. Index and query together.)
CREATE INDEX IF NOT EXISTS idx_meta_event_players_faction_placement
  ON meta_event_players(faction_id, placement);
