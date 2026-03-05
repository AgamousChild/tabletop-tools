# CLAUDE.md — data-import

> Read the root CLAUDE.md for platform-wide conventions.

---

## What data-import Is

data-import has a server Worker that fetches game data from external sources (BSData, Wahapedia),
processes it into JSON, and stores it in R2. The client SPA downloads pre-processed JSON from
the Worker API and saves it to IndexedDB. Other apps (versus, list-builder) read from IndexedDB.

**Port:** No dev port (server is a Cloudflare Worker with cron trigger)

---

## Architecture

```
apps/data-import/
  server/
    src/
      worker.ts                    <- Hono app: HTTP endpoints + cron handler
      types.ts                     <- Env, Manifest types
      lib/
        sync.ts                    <- runSync(): orchestrates all sources
        id-mapping.ts              <- Wahapedia↔BSData ID mapping (server-side)
        parsers/
          wahapedia-csv.ts         <- parsePipeCsv(), htmlToMarkdown(), stripHtml()
        sources/
          wahapedia.ts             <- fetchAndProcessWahapedia(): CSV→JSON
          bsdata.ts                <- fetchAndProcessBSData(): XML→JSON
          missions.ts              <- fetchAndProcessMissions(): stub (via Wahapedia)
    wrangler.toml                  <- R2 binding + cron trigger (Monday 3am UTC)
  client/
    src/
      App.tsx                      <- renders ImportScreen
      main.tsx                     <- Vite entry (renderApp from packages/ui)
      pages/
        ImportScreen.tsx           <- 2 tabs: Sync, Stored Data
      lib/
        sync.ts                    <- checkForUpdates(), syncAllData()
      test/
        setup.ts                   <- fake-indexeddb/auto
```

### Server Worker

Hono app with three endpoints (no tRPC, no auth):
- `GET /manifest.json` — returns manifest from R2
- `GET /data/:file` — returns JSON data file from R2
- `POST /sync` — manual trigger (protected by SYNC_SECRET bearer token)
- `scheduled` handler — weekly cron (Monday 3am UTC)

### Data Flow

1. **Weekly cron** (or manual POST /sync):
   - Fetch Wahapedia CSVs → parse, transform columns, HTML→markdown → JSON
   - Fetch BSData catalog XMLs from GitHub → parse with `parseBSDataXml()` → JSON
   - Build ID mapping (Wahapedia name → BSData unit ID)
   - Re-key all Wahapedia files with BSData IDs and full faction names
   - Write all JSON files + manifest to R2

2. **Client sync** (user-triggered):
   - Fetch `/data-import/api/manifest.json` → compare version
   - If newer: download each JSON file → save to IndexedDB via game-data-store
   - Consumer apps unchanged (read from IndexedDB via hooks)

### Key Dependencies

Server:
- `@tabletop-tools/game-content/src/adapters/bsdata/parser` — BSData XML parser
- `hono` — HTTP framework

Client:
- `@tabletop-tools/game-data-store` — IndexedDB CRUD
- `@tabletop-tools/ui` — renderApp, Tailwind preset

### Gateway Routing

- Service binding: `DATA_IMPORT_API` → `tabletop-tools-data-import`
- Pages Function: `functions/data-import/api/[[path]].ts`
- Client fetches: `/data-import/api/manifest.json`, `/data-import/api/data/:file`

---

## Testing

```bash
cd apps/data-import/server && pnpm test   # server tests
cd apps/data-import/client && pnpm test   # client tests
```

Server tests: parsers (27), ID mapping (20), Wahapedia source (5), BSData source (4) = 56 tests
Client tests: sync module (8), ImportScreen UI (14) = 22 tests
