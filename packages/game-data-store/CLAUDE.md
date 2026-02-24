# CLAUDE.md -- packages/game-data-store

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

A shared IndexedDB store and React hooks for client-side game data. Provides the persistence
layer that lets users import BSData content once (via data-import) and use it across all apps
without re-downloading.

**Consumers:**
- **data-import** -- writes: fetches BSData XML from GitHub, parses it, saves UnitProfile[] via `saveUnits`
- **versus** -- reads: loads units/factions from IndexedDB via dual-source hooks (IndexedDB first, tRPC fallback)
- **list-builder** -- reads: same dual-source pattern as versus

The dual-source hooks live in each consumer app (`src/lib/useGameData.ts`), not in this package.
This package provides the raw IndexedDB operations and simple React hooks.

---

## File Structure

```
packages/game-data-store/
  src/
    store.ts          <- IndexedDB operations (17 tests)
    store.test.ts
    hooks.ts          <- React hooks (9 tests)
    hooks.test.ts
    index.ts          <- barrel export
  vitest.config.ts
  package.json
  tsconfig.json
```

---

## Exports

```typescript
// Store functions
export { saveUnits, getUnit, searchUnits, listFactions, clearFaction, clearAll, getImportMeta, setImportMeta }
export type { ImportMeta }

// React hooks
export { useUnit, useUnitSearch, useFactions, useGameDataAvailable }
```

### IndexedDB Schema

```
Database: 'tabletop-tools-game-data'
Version:  1

Object stores:
  units
    keyPath: 'id'
    indexes: ['faction']       <- index on unit.faction for faction-filtered queries

  meta
    keyPath: 'key'             <- stores metadata (last import timestamp, etc.)
```

BSData IDs are stable hex GUIDs. Re-importing the same catalogue overwrites the same
IndexedDB keys -- in-place update by design, not a duplicate.

### Store API

```typescript
saveUnits(units: UnitProfile[]): Promise<void>          // batched single transaction
getUnit(id: string): Promise<UnitProfile | undefined>
searchUnits(opts?: { faction?: string; query?: string }): Promise<UnitProfile[]>
listFactions(): Promise<string[]>
clearFaction(faction: string): Promise<void>
clearAll(): Promise<void>
setImportMeta(meta: ImportMeta): Promise<void>
getImportMeta(): Promise<ImportMeta | undefined>
```

`saveUnits` uses a single `readwrite` transaction for batch efficiency -- all `put()` calls
are queued synchronously within the transaction and committed atomically.

### Hooks API

```typescript
useUnit(id: string): { data: UnitProfile | null; error: string | null; isLoading: boolean }
useUnitSearch(opts: { faction?: string; query?: string }): { data: UnitProfile[]; error: string | null; isLoading: boolean }
useFactions(): { data: string[]; error: string | null; isLoading: boolean }
useGameDataAvailable(): boolean    // simple boolean -- true if any units exist in IndexedDB
```

Hooks return `{ data, error, isLoading }` -- they never throw on IndexedDB failure. When
IndexedDB is unavailable, hooks return empty results with an error message.

---

## Testing

**26 tests** across 2 test files:

| File | Tests | What it covers |
|---|---|---|
| `store.test.ts` | 17 | openDb, saveUnits (batch), getUnit, searchUnits, listFactions, clearFaction, clearAll, setImportMeta/getImportMeta |
| `hooks.test.ts` | 9 | useUnit data/loading, useUnitSearch filters, useFactions, useGameDataAvailable, error handling |

Tests use `fake-indexeddb/auto` for in-memory IndexedDB. Consumer apps (versus, list-builder)
must add `fake-indexeddb` to their `devDependencies` and import the auto polyfill in their test setup.

```bash
cd packages/game-data-store && pnpm test
```
