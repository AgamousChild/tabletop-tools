# apps/data-import/client/src/lib/sync.ts

> Client-side sync module — fetches pre-processed JSON from the data-import Worker API and saves to IndexedDB.

## Prompt

Three exported types and two exported functions for syncing game data from the server Worker to the client's IndexedDB.

### Types

`Manifest` — mirrors the server's Manifest type: `{ version, updatedAt, wahapedia?, bsdata?, missions?, files }`.

`SyncProgress` — `{ current: number, total: number, currentStep: string }` for progress reporting.

`SyncResult` — `{ unitCount: number, rulesCount: number, errors: string[] }`.

### `getApiBase(): string` (not exported)

Returns the API base URL. Uses `VITE_DATA_IMPORT_API_URL` env var if set, otherwise defaults to `${window.location.origin}/data-import/api` (gateway proxy).

### `checkForUpdates(currentVersion?: number)`

Fetch `/manifest.json` from the API. If `currentVersion` is null/undefined or manifest version is newer, return `{ available: true, manifest }`. On fetch failure, return `{ available: false, manifest: null }`.

### `syncAllData(manifest, onProgress)`

Iterate over `manifest.files`, filtering to files that exist in `STORE_MAP`. For each file:
1. Report progress with the file's label
2. Fetch the JSON data from `/data/{filename}`
3. Validate it's an array
4. Call the corresponding save function from game-data-store

`STORE_MAP` is a constant mapping filename → `{ save, label, rulesKey? }`. It covers 19 files: `bsdata-units.json` (→ saveUnits), `datasheets.json`, `detachments.json`, `stratagems.json`, `enhancements.json`, etc. Each entry except bsdata-units and factions has a `rulesKey` for counting.

After syncing all files, update import metadata (`setImportMeta` with lastImport, totalUnits, commitSha) and rules metadata (`setRulesImportMeta` with per-category counts).

Factions.json has a no-op save function (factions don't have a separate store — they're derived from unit data).

## Dependencies

- `@tabletop-tools/game-data-store` — 19 save functions + setImportMeta + setRulesImportMeta

## Contracts

- Uses Vite's `import.meta.env` for API URL configuration (needs `/// <reference types="vite/client" />`)
- Files not in STORE_MAP are silently skipped
- Errors per-file are accumulated, not thrown — partial sync is possible
- Progress callback fires once per file with step name
