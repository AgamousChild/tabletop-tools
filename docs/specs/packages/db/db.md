# packages/db/src/ — Database Package

## client.ts
`createDb(config)` — create Turso client + Drizzle wrapper from URL/token config. `createDbFromClient(client)` — wrap existing libSQL client. `Db` type exported.

## schema.ts
Complete SQLite schema with 49 tables, indexes, unique constraints, and cascade deletes. Table groups:

- **Auth** (4): authUsers, authSessions, authAccounts, authVerifications
- **No-cheat** (3): diceSets, diceRollingSessions, rolls
- **Versus** (1): simulations
- **List-builder** (2): lists, listUnits
- **Game-tracker** (2): matches, turns
- **Tournament** (8): tournaments, tournamentPlayers, rounds, pairings, playerElo, eloHistory, tournamentCards, tournamentAwards
- **Ratings** (5): unitRatings, playerGlicko, glickoHistory, importedTournamentResults
- **Meta analytics** (18): dim_faction, dim_subfaction, dim_detachment, dim_for_type, dim_granularity, dim_dataslate, dim_tournament_pack, dim_edition, dim_region, meta_events, meta_event_players, meta_pairings, meta_for, meta_top, meta_cube_status, fact_game_results
- **BCP scraper** (1): bcpScrapeJobs
- **Content ingestor** (1): ingestJobs
- **Match extras** (2): matchSecondaries, stratagemLog
- **User management** (1): userBans

All FKs have ON DELETE CASCADE. Query-critical columns have indexes.

## index.ts
Barrel re-export of client.ts + schema.ts.
