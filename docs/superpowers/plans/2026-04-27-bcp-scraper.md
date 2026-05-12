# BCP Tournament Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape 2 years of major Warhammer 40K tournament results (100+ players, 5+ rounds) from Best Coast Pairings and import them into the new-meta analytics database.

**Architecture:** CLI tool in `apps/content-ingestor/` (extend existing tool) using Playwright for browser automation on Micah's logged-in BCP session. Scrapes event pages, transforms data into `TournamentRecord[]`, and imports via the existing new-meta admin import pipeline.

**Tech Stack:** TypeScript, Playwright (browser automation), existing game-content `TournamentRecord` types, existing new-meta import router

---

## File Structure

```
apps/content-ingestor/
  src/
    bcp/
      scraper.ts              — Core BCP page scraper (Playwright)
      scraper.test.ts
      event-list.ts           — Paginate and collect all event URLs
      event-list.test.ts
      event-parser.ts         — Parse event page into TournamentRecord
      event-parser.test.ts
      standings.ts            — Parse standings/placings page
      standings.test.ts
      import.ts               — Transform + import into new-meta DB
      import.test.ts
    cli.ts                    — Add 'bcp' command group (modify existing)
```

---

### Task 1: Event list scraper

**Files:**
- Create: `apps/content-ingestor/src/bcp/event-list.ts`
- Create: `apps/content-ingestor/src/bcp/event-list.test.ts`

- [ ] **Step 1: Write event-list.ts**

```typescript
import { chromium, type Browser, type Page } from 'playwright'

export interface BCPEvent {
  id: string              // BCP event ID from URL
  url: string             // full event URL
  name: string
  date: string            // from event card
  playerCount: number     // parsed from "X / Y" or "X"
  rounds: number
  location: string
}

export async function scrapeEventList(
  searchUrl: string,
  browser: Browser,
): Promise<BCPEvent[]>
// 1. Navigate to searchUrl
// 2. Wait for event cards to load
// 3. Parse each event card: name, URL, date, player count, rounds, location
// 4. Check for pagination — "next page" button
// 5. If more pages, click next and repeat
// 6. Return all events
// 7. Extract event ID from URL: /event/{id} → id
```

The search URL with all filters baked in:
```
https://www.bestcoastpairings.com/play/events?search=true&startDate=2024-04-27&endDate=2026-04-27&gameSystemId=WGMSzfKFYA&numberOfRounds=5&numberOfPlayers=100&sortAsc=true&eventStatus=all&sortKey=eventDate
```

- [ ] **Step 2: Write tests**

Mock page content. Test: event card parsing, pagination detection, ID extraction from URL.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/content-ingestor/src/bcp/event-list.*
git commit -m "feat(bcp-scraper): event list scraper with pagination"
```

---

### Task 2: Event page standings scraper

**Files:**
- Create: `apps/content-ingestor/src/bcp/standings.ts`
- Create: `apps/content-ingestor/src/bcp/standings.test.ts`

- [ ] **Step 1: Write standings.ts**

```typescript
export interface BCPStanding {
  placement: number
  playerName: string
  faction: string
  wins: number
  losses: number
  draws: number
  points: number
  armyListUrl?: string    // link to army list if available
}

export async function scrapeStandings(
  eventUrl: string,
  page: Page,
): Promise<BCPStanding[]>
// 1. Navigate to eventUrl + "?active_tab=standings" (or find the standings tab)
// 2. Wait for standings table to load
// 3. Parse each row: placement, player name, faction, W/L/D, points
// 4. Handle pagination if standings span multiple pages
// 5. Return all standings
```

- [ ] **Step 2: Write tests**

Provide sample HTML of a BCP standings table. Test row parsing, pagination.

- [ ] **Step 3: Commit**

```bash
git add apps/content-ingestor/src/bcp/standings.*
git commit -m "feat(bcp-scraper): standings table scraper"
```

---

### Task 3: Army list scraper (subscriber feature)

**Files:**
- Create: `apps/content-ingestor/src/bcp/army-list.ts`
- Create: `apps/content-ingestor/src/bcp/army-list.test.ts`

- [ ] **Step 1: Write army-list.ts**

```typescript
export async function scrapeArmyList(
  listUrl: string,
  page: Page,
): Promise<string | null>
// 1. Navigate to the army list page
// 2. Wait for list content to load
// 3. Extract the army list text
// 4. Return as string, or null if not available/restricted
```

Note: Army lists require a paid BCP subscription (which Micah has). Some events may not have lists published.

- [ ] **Step 2: Write tests**

- [ ] **Step 3: Commit**

```bash
git add apps/content-ingestor/src/bcp/army-list.*
git commit -m "feat(bcp-scraper): army list scraper (subscriber feature)"
```

---

### Task 4: Event parser — transform to TournamentRecord

**Files:**
- Create: `apps/content-ingestor/src/bcp/event-parser.ts`
- Create: `apps/content-ingestor/src/bcp/event-parser.test.ts`

- [ ] **Step 1: Write event-parser.ts**

```typescript
import type { TournamentRecord, TournamentPlayer } from '@tabletop-tools/game-content'

export function toTournamentRecord(
  event: BCPEvent,
  standings: BCPStanding[],
): TournamentRecord
// Transform BCP data into the game-content TournamentRecord format:
// {
//   eventName: event.name,
//   eventDate: event.date (ISO format),
//   format: deriveFormat(event) — "GT" for 100+, "Major" for 200+, "Super Major" for 400+
//   players: standings.map(s => ({
//     name: s.playerName,
//     placement: s.placement,
//     faction: s.faction,
//     wins: s.wins,
//     losses: s.losses,
//     draws: s.draws,
//     points: s.points,
//     listText: s.armyList ?? undefined,
//   }))
// }

export function deriveFormat(event: BCPEvent): string
// 100-199 players → "GT"
// 200-399 players → "Major"
// 400+ players → "Super Major"
```

- [ ] **Step 2: Write tests**

Test format derivation, data mapping, edge cases (missing fields).

- [ ] **Step 3: Commit**

```bash
git add apps/content-ingestor/src/bcp/event-parser.*
git commit -m "feat(bcp-scraper): transform BCP data to TournamentRecord"
```

---

### Task 5: Import into new-meta database

**Files:**
- Create: `apps/content-ingestor/src/bcp/import.ts`
- Create: `apps/content-ingestor/src/bcp/import.test.ts`

- [ ] **Step 1: Write import.ts**

```typescript
import { createDb } from '@tabletop-tools/db'

export async function importToNewMeta(
  records: TournamentRecord[],
  dbUrl: string,
  authToken: string,
  importedBy: string,
): Promise<{ imported: number; skipped: number }>
// For each TournamentRecord:
// 1. Check if event already imported (by eventName + eventDate)
// 2. If already exists, skip
// 3. Insert into importedTournamentResults with:
//    - id: generateId()
//    - importedBy: importedBy (admin user ID)
//    - eventName, eventDate, format, metaWindow (derive from date)
//    - rawData: JSON.stringify of BCP scraped data
//    - parsedData: JSON.stringify of TournamentRecord
//    - importedAt: now
// 4. Return counts

export function deriveMetaWindow(eventDate: string): string
// "2024-Q3", "2025-Q1", etc. based on event date
```

- [ ] **Step 2: Write tests**

Use in-memory SQLite. Test: import new event, skip duplicate, meta window derivation.

- [ ] **Step 3: Commit**

```bash
git add apps/content-ingestor/src/bcp/import.*
git commit -m "feat(bcp-scraper): import TournamentRecords into new-meta DB"
```

---

### Task 6: CLI command + full pipeline

**Files:**
- Modify: `apps/content-ingestor/src/cli.ts`

- [ ] **Step 1: Add BCP commands to CLI**

```typescript
program
  .command('bcp-scan')
  .description('Scan BCP for major 40K events (100+ players, 5+ rounds, last 2 years)')
  .action(async () => {
    // 1. Launch Playwright browser (non-headless so user can log in if needed)
    // 2. Navigate to saved search URL
    // 3. Scrape all event listings
    // 4. Save event list to .local/ingest/bcp/events.json
    // 5. Print summary: N events found
  })

program
  .command('bcp-scrape [eventId]')
  .description('Scrape standings from a BCP event (or all events if no ID)')
  .action(async (eventId?: string) => {
    // 1. Load event list from .local/ingest/bcp/events.json
    // 2. If eventId provided, scrape just that one
    // 3. Otherwise, scrape all events sequentially
    // 4. For each event:
    //    a. scrapeStandings(eventUrl, page)
    //    b. Optionally scrapeArmyList for top players
    //    c. toTournamentRecord(event, standings)
    //    d. Save to .local/ingest/bcp/{eventId}.json
    // 5. Print progress: [N/total] Event Name — X players scraped
  })

program
  .command('bcp-import')
  .description('Import scraped BCP events into new-meta database')
  .option('--db-url <url>', 'Turso DB URL')
  .option('--auth-token <token>', 'Turso auth token')
  .action(async (opts) => {
    // 1. Load all .local/ingest/bcp/*.json files
    // 2. Parse each as TournamentRecord
    // 3. Import into new-meta via importToNewMeta()
    // 4. Print: N imported, M skipped (duplicates)
  })
```

- [ ] **Step 2: Test end-to-end with one event**

Manually test: `bcp-scan` → `bcp-scrape <one-event-id>` → verify JSON output

- [ ] **Step 3: Commit**

```bash
git add apps/content-ingestor/src/cli.ts
git commit -m "feat(bcp-scraper): CLI commands — bcp-scan, bcp-scrape, bcp-import"
```

---

### Task 7: Full scrape run

**Files:** None (manual execution)

- [ ] **Step 1: Run bcp-scan**

```bash
cd apps/content-ingestor && npx tsx src/cli.ts bcp-scan
```

Verify: event list saved with all major events

- [ ] **Step 2: Run bcp-scrape (all events)**

```bash
cd apps/content-ingestor && npx tsx src/cli.ts bcp-scrape
```

This will take a while — scraping standings for each event. Monitor progress.

- [ ] **Step 3: Verify scraped data quality**

Spot-check a few event JSON files. Verify: player names, factions, W/L/D records look correct.

- [ ] **Step 4: Run bcp-import**

```bash
cd apps/content-ingestor && npx tsx src/cli.ts bcp-import --db-url $TURSO_DB_URL --auth-token $TURSO_AUTH_TOKEN
```

- [ ] **Step 5: Verify in new-meta app**

Check tabletop-tools.net/new-meta — do the imported events show up? Are faction win rates populated?

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "feat(bcp-scraper): full scrape of 2-year major event data"
```

---

## Notes

- **Authentication**: Micah must be logged into BCP in the Playwright browser. The scraper uses his paid subscriber session.
- **Rate limiting**: Add delays between page loads (1-2 seconds) to avoid getting rate-limited by BCP.
- **Playwright mode**: Use `headless: false` for initial runs so Micah can log in. Switch to `headless: true` once cookies are captured.
- **Army lists**: Only available to paid subscribers. Scrape for top 10 players per event to keep it manageable.
- **Duplicate detection**: Check by eventName + eventDate before importing to avoid re-importing the same event.
- **Meta window**: Derive from event date — Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec).
