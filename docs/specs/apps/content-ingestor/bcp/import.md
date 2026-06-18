# apps/content-ingestor/src/bcp/import.ts

> Prepare scraped tournament records for import into new-meta database.

## Prompt

**`prepareForImport(bcpDataDir, outputDir)`** — reads JSON files from data dir, validates structure (eventName, players array), writes import-ready JSON to output dir. Returns `{ imported, skipped, errors }`.

**`generateSummaryCSV(outputDir)`** — generates CSV summary (name, date, format, player count, top faction/player).

## Dependencies

- `fs`, `path`
- `./event-parser` — `TournamentRecord`
