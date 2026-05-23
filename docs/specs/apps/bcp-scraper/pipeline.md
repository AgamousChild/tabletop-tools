# apps/bcp-scraper/server/src/lib/pipeline.ts

> Incremental meta analytics cube builder — frames of reference + fact tables + aggregated meta_top.

## Prompt

Two exports: `generateFrames()` (pure function) and `runPipeline()` (DB operations).

### `generateFrames(events, dataslates, packs, editions): Frame[]`

Generate "frames of reference" (`meta_for` rows) for time-based analytics. Each event produces up to 5 frames:
1. **Event** (typeId=1): exact event, single day
2. **Weekend** (typeId=2): Saturday of the event's week
3. **Month** (typeId=3): calendar month with start/end dates
4. **Quarter** (typeId=4): calendar quarter with start/end dates
5. **Year** (typeId=5): calendar year

Additionally, create frames for each dimension record: dataslate (typeId=6), tournament pack (typeId=7), edition (typeId=8).

Each frame has: id (string like `event:{id}`, `month:2026-03`), typeId, date range, and references to active dataslate/pack/edition at that date (date-range lookup). Deduplicate by id (Set-based).

### `runPipeline(db: Db): Promise<void>`

1. Set `meta_cube_status` to `running`.
2. Find events imported since `last_completed_at`.
3. If no new events, mark `complete` and return.
4. Load dimension tables (`dim_dataslate`, `dim_tournament_pack`, `dim_edition`).
5. Generate frames for new events, `INSERT OR IGNORE` into `meta_for`.
6. For each new event, load pairings with player factions (JOIN). Create TWO `fact_game_results` rows per pairing — one from each player's perspective (symmetric). Result is 1.0 (win), 0.5 (draw), 0.0 (loss).
7. For affected frames, DELETE existing `meta_top` rows and rebuild. Aggregate: win_rate, draw_rate, over_rep (player % / expected %), four_oh_start, event placement counts (wins/finals/top4/top8/top16), player population %.
8. Mark `complete` or `failed`.

## Dependencies

- `drizzle-orm` — `sql`
- `@tabletop-tools/db` — `Db`
- `@tabletop-tools/server-core` — `generateId`

## Contracts

- Incremental: only processes events imported since last cube build
- `INSERT OR IGNORE` for frames preserves existing data
- Symmetric fact rows: each pairing becomes two rows (player and opponent perspectives)
- `meta_top` is fully rebuilt for affected frames (DELETE + INSERT OR REPLACE)
- Uses raw SQL (`sql.raw`) for dynamic WHERE clauses in frame aggregation
