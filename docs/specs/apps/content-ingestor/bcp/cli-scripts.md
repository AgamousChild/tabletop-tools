# apps/content-ingestor/src/bcp/ — CLI Scripts

> Standalone Playwright-based scripts for BCP data collection. All are `npx tsx` CLI scripts, not library modules.

## Scripts

### login.ts
Launch persistent headless=false browser for manual BCP login. Saves cookies to `.local/ingest/bcp/browser-state`.

### scan-all-events.ts
Scan BCP for major 40K events (100+ players, 5+ rounds) via monthly windowed scraping. Merges with existing `events.json`, preserving cached dates/locations.

### scrape-pairings-standalone.ts
Scrape all pairings from all events with persistent login. Reuses browser cookies, checks if logged in, prompts for manual login if not. Saves to `pairings-{eventId}.json`.

### scrape-dates.ts
Fill missing event dates by visiting BCP event Overview tabs. Extracts date/location from h5/h6 DOM patterns, backfills pairings files.

### scrape-first-turn.ts
Scrape "First Turn" checkbox state from BCP game detail pages. Resumable via `first-turn-progress.json`.

### scrape-lists.ts
Scrape army list text from BCP list URLs. Deduplicates list URLs from pairings files, saves to `army-lists.json`, backfills pairings files with listText.

### direct-import.ts
Import scraped tournament records directly into Turso DB from JSON files. Upserts into `imported_tournament_results` table.

### import-lists.ts
Import army list text from pairings JSON into `bcp_army_lists` table. Normalizes faction names, batches inserts.

### reimport-from-pairings.ts
Re-import tournament data from pairings JSON with real W/L/D records calculated from pairing results.

### stamp-community-dates.ts
Stamp `publishedAt` dates on brain community nodes using video ID mappings from ingest directories.

### mcp-scrape-event.ts
Generate Playwright MCP `browser_run_code` JavaScript snippet for scraping pairings from a single event.

### scrape-all-pairings.ts
Helper types and functions: `PairingResult`, `FullEventData`, `calculatePlayerRecords()`, `toImportRecord()`.

## Dependencies

All scripts use: `playwright` (dynamic import), `fs`, `path`, `@libsql/client`, `@tabletop-tools/db`.
