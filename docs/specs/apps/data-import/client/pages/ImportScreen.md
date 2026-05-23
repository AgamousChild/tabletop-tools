# apps/data-import/client/src/pages/ImportScreen.tsx

> Main UI — two-tab interface for syncing game data and viewing stored data.

## Prompt

Single-page data import dashboard with two tabs: **Sync** and **Stored Data**. No auth required (public app).

### State

Sync tab state: `checking`, `updateAvailable`, `manifest`, `checkError`, `syncing`, `syncProgress`, `syncResult`.
Stored data tab state: `currentMeta` (ImportMeta), `rulesMeta` (RulesImportMeta), `storedFactions`, `factionCounts`, `factionWeaponCounts`, `clearing`, `clearMessage`, `includeLegends`.

On mount, `refreshStoredData()` loads import metadata, rules metadata, and stored factions from IndexedDB. For each faction, count units and weapons via `searchUnits({ faction })`. Also load the `includeLegends` preference.

### Sync Tab

Shows current data status banner if data exists (unit count, faction count, rules count, last sync date). If parser version is outdated (`currentMeta.parserVersion < PARSER_VERSION`), show amber warning recommending re-sync.

"Check for Updates" button calls `checkForUpdates()` from the sync module. Shows result: up-to-date (green), update available (amber banner with manifest details), or error (red).

"Sync All Data" / "Sync Updates" button (only visible when update available or no data exists) calls `syncAllData(manifest, onProgress)`. Progress bar shows current step name and fraction complete. On completion, shows green result card with unit/rules counts and expandable error details.

### Stored Data Tab

**Unit Profiles section**: faction list with unit and weapon counts per faction, scrollable (max-h-60). "Clear All Data" button with confirmation dialog.

**Settings section**: "Include Legends units" checkbox toggle. Calls `setIncludeLegends(val)` on change.

**Game Rules section**: 2-column grid showing counts for each rules category (detachments, stratagems, enhancements, leader attachments, etc.). "Clear Game Rules" button with confirmation. Shows "No game rules imported yet" if no rulesMeta.

### Layout

Header with home link (house icon + "Home"), app title "Data **Import**" (Import in amber), subtitle. Tab bar with rounded pill buttons (active = amber bg). Footer with BSData/Wahapedia attribution disclaimer.

## Dependencies

- `react` — useState, useEffect, useCallback
- `@tabletop-tools/game-content/src/adapters/bsdata/parser` — `PARSER_VERSION`
- `@tabletop-tools/game-data-store` — getImportMeta, listFactions, searchUnits, clearAll, clearGameRules, getRulesImportMeta, getIncludeLegends, setIncludeLegends
- `../lib/sync` — checkForUpdates, syncAllData, Manifest, SyncProgress, SyncResult

## Contracts

- No auth gate — data-import is publicly accessible
- No tRPC — all data operations are IndexedDB (game-data-store) and fetch (sync module)
- Progress callback updates state for real-time progress bar
- Clear operations are confirmation-gated with `confirm()`
