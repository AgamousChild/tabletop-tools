# apps/content-ingestor/src/bcp/event-parser.ts

> Parse BCP event metadata into normalized tournament records.

## Prompt

Exports: `TournamentRecord`, `deriveFormat()`, `normalizeDate()`, `deriveMetaWindow()`, `toTournamentRecord()`.

`deriveFormat(playerCount)` — 400+ = Super Major, 200+ = Major, 100+ = GT, 30+ = RTT, else Local.

`normalizeDate(dateStr)` — parse various date formats to ISO string.

`deriveMetaWindow(dateStr)` — derive meta window string by quarter (e.g., "2026-Q1").

`toTournamentRecord(event, standings, armyLists?)` — combine event metadata, standings, and optional army list text into a typed `TournamentRecord`.
