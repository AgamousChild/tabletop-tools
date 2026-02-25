# CLAUDE.md -- tools/wahapedia-sync

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

A local CLI tool that syncs Wahapedia's 40K 10th Edition data into a local SQLite database
and generates per-faction markdown files. Runs on-demand, stores everything under `.local/wahapedia/`.
No connection to the deployed platform -- purely a local reference tool.

---

## What It Does

1. Checks Wahapedia's `Last_update.csv` timestamp against stored metadata
2. If changed, downloads all 13 pipe-delimited CSV files (factions, datasheets, models, abilities, stratagems, enhancements, wargear, etc.)
3. Downloads the Excel data spec (non-critical, for reference)
4. Parses CSVs with the pipe-delimited parser
5. Imports all data into a local SQLite database (full replace per sync)
6. Generates per-faction markdown files with stat blocks, weapons, abilities, stratagems, and enhancements
7. Saves sync metadata (timestamp, row counts) to skip redundant downloads

---

## Architecture

```
tools/wahapedia-sync/
  src/
    index.ts              <- CLI entry point, orchestrates the full sync pipeline
    types.ts              <- CSV file names, row interfaces, ParsedData, SyncMetadata
    csv-parser.ts         <- pipe-delimited CSV parser + HTML stripper
    csv-parser.test.ts
    fetcher.ts            <- fetch CSVs from wahapedia.ru, download Excel spec
    fetcher.test.ts
    metadata.ts           <- load/save metadata.json, change detection
    metadata.test.ts
    db.ts                 <- Drizzle schema, createTables, importData, query helpers
    db.test.ts
    markdown.ts           <- per-faction markdown generation + INDEX.md
    markdown.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

### Output Structure

```
.local/wahapedia/
  csv/                    <- raw downloaded CSVs + Excel spec
  markdown/
    INDEX.md              <- links to all faction files
    space-marines.md      <- stat blocks, weapons, abilities, stratagems, enhancements
    orks.md
    ...
  data.db                 <- SQLite database (12 tables, indexed by faction)
  metadata.json           <- last_update timestamp, per-file row counts
```

---

## Data Flow

```
wahapedia.ru CSVs (pipe-delimited)
  → csv-parser.ts (parsePipeCsv)
  → typed ParsedData
  → db.ts (importData → SQLite, full replace in transaction)
  → markdown.ts (generateAllMarkdown → per-faction .md files)
```

### Key Design Decisions

- **Pipe-delimited CSV**: Wahapedia uses `|` as delimiter, not commas. `parsePipeCsv` handles this.
- **HTML in fields**: Ability descriptions contain HTML tags. `stripHtml()` converts to plain text for markdown output.
- **Full replace**: Each sync drops all rows and re-inserts. No incremental updates.
- **Change detection**: Compares `Last_update.csv` timestamp against stored metadata. Skips sync if unchanged.
- **SQLite indexes**: 10 indexes on faction_id and datasheet_id foreign keys for query performance.

---

## Dependencies

| Package | Purpose |
|---|---|
| better-sqlite3 | SQLite driver for local database |
| drizzle-orm | Type-safe schema and query helpers |
| exceljs | Read Excel data spec (optional reference) |
| tsx | TypeScript execution |

---

## Running

```bash
# From repo root
pnpm sync:wahapedia

# Or directly
cd tools/wahapedia-sync && pnpm start
```

---

## Testing

**49 tests** across 5 test files, all passing:

| File | Tests | What it covers |
|---|---|---|
| `csv-parser.test.ts` | 13 | Pipe parsing, header extraction, empty input, HTML stripping |
| `metadata.test.ts` | 8 | Load/save metadata, change detection, missing file handling |
| `fetcher.test.ts` | 7 | CSV fetching, last_update extraction, downloadAllCsvs, error handling |
| `db.test.ts` | 11 | Table creation, data import, re-import replace, all 7 query helpers |
| `markdown.test.ts` | 10 | Faction heading, stat blocks, weapons, abilities, stratagems, enhancements, INDEX.md |

```bash
cd tools/wahapedia-sync && pnpm test
```

Note: `db.test.ts` and `markdown.test.ts` require `better-sqlite3` native bindings. If these
fail with a missing package error, run `pnpm install` from the repo root to trigger the native build.
