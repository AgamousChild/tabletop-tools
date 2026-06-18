# apps/new-meta/server/src/routers/admin.ts

> Admin-only tournament CSV import + Glicko-2 recomputation.

## Prompt

Write a tRPC router `adminRouter` with three `adminProcedure` endpoints.

**`import` (mutation):** Accept `{ csv, format ('bcp-csv'|'tabletop-admiral-csv'|'generic-csv'), eventName, eventDate (ISO), metaWindow, minRounds?, minPlayers? }`. Parse CSV using format-specific parsers from `@tabletop-tools/game-content` (`parseBcpCsv`, `parseTabletopAdmiralCsv`, `parseGenericCsv`). Store raw CSV + parsed JSON in `importedTournamentResults`. Then run Glicko-2 updates via internal `updateGlickoForImport()`. Return `{ importId, imported, skipped, errors, playersUpdated }`.

**`recomputeGlicko` (mutation):** Accept optional `{ fromImportId }`. Load all imports, re-run Glicko-2 for each. Return `{ playersUpdated }`.

**`linkPlayer` (mutation):** Accept `{ glickoId, userId }`. Update `playerGlicko.userId` to link an anonymous import entry to a platform account. Return updated row.

### Internal helper: `updateGlickoForImport(db, importId, records)`

1. Load all platform users for name matching via `matchPlayerName()`
2. Load all existing `playerGlicko` entries into a Map (by lowercase name)
3. For each unique player name in the import, find or create a Glicko entry
4. For each player, synthesize game results from W/L/D counts (against average opponent rating 1500, RD 200)
5. Call `updateGlicko2()` with current ratings + synthesized games
6. Update `playerGlicko` with new rating/RD/volatility
7. Insert `glickoHistory` row for audit trail
8. Return count of players updated

### Design decisions

- Synthesized games against "average" opponent (1500/200) because tournament CSVs only have W/L/D counts, not individual pairing-level data. This is a simplified model.
- Player matching is case-insensitive exact match only — no fuzzy matching to avoid false positives. Admin links unmatched players manually.

## Dependencies

- `zod` — `z`
- `drizzle-orm` — `eq`
- `@tabletop-tools/db` — `importedTournamentResults`, `playerGlicko`, `glickoHistory`, `authUsers`
- `@tabletop-tools/game-content` — `parseBcpCsv`, `parseTabletopAdmiralCsv`, `parseGenericCsv`, `TournamentRecord`
- `../lib/glicko2.js` — `updateGlicko2`
- `../lib/playerMatch.js` — `matchPlayerName`
- `../trpc.js` — `router`, `adminProcedure`
