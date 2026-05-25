-- 0011: Tournament → Meta direct integration
-- Replace importedTournamentResults with direct writes to metaEvents/metaEventPlayers/metaPairings

-- Add unknown faction for unresolvable factions
INSERT OR IGNORE INTO dim_faction (id, name, allegiance) VALUES ('unknown', 'Unknown', 'unknown');

-- Drop the old table
DROP TABLE IF EXISTS imported_tournament_results;
