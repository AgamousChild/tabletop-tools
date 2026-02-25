# CLAUDE.md -- packages/game-data-store

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

A shared IndexedDB store and React hooks for client-side game data. Provides the persistence
layer that lets users import BSData content once (via data-import) and use it across all apps
without re-downloading.

**Consumers:**
- **data-import** -- writes: fetches BSData XML from GitHub, parses it, saves UnitProfile[] via `saveUnits`
- **versus** -- reads: loads units/factions from IndexedDB via hooks (IndexedDB only, no tRPC fallback)
- **list-builder** -- reads: loads units/factions from IndexedDB + stores army lists in IndexedDB

Consumer apps have thin wrappers in `src/lib/useGameData.ts` that delegate to this package's hooks.
This package provides the raw IndexedDB operations, React hooks, and list storage.

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
// Store functions — units
export { saveUnits, getUnit, searchUnits, listFactions, clearFaction, clearAll, getImportMeta, setImportMeta }
export type { ImportMeta }

// Store functions — lists
export { createList, getLists, getList, updateList, deleteList, addListUnit, getListUnits, removeListUnit }
export type { LocalList, LocalListUnit }

// React hooks — units
export { useUnit, useUnitSearch, useFactions, useGameDataAvailable }

// React hooks — lists
export { useLists, useList }
```

### IndexedDB Schema

```
Database: 'tabletop-tools-game-data'
Version:  2

Object stores:
  units
    keyPath: 'id'
    indexes: ['faction']       <- index on unit.faction for faction-filtered queries

  meta
    keyPath: 'key'             <- stores metadata (last import timestamp, etc.)

  lists
    keyPath: 'id'              <- army lists (faction, name, totalPts, timestamps)

  list_units
    keyPath: 'id'
    indexes: ['listId']        <- units within a list (unitContentId, unitName, unitPoints, count)
```

BSData IDs are stable hex GUIDs. Re-importing the same catalogue overwrites the same
IndexedDB keys -- in-place update by design, not a duplicate.

### Store API — Units

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

### Store API — Lists

```typescript
createList(list: LocalList): Promise<void>
getLists(): Promise<LocalList[]>
getList(id: string): Promise<LocalList | undefined>
updateList(id: string, updates: Partial<Pick<LocalList, 'name' | 'faction' | 'totalPts' | 'updatedAt'>>): Promise<void>
deleteList(id: string): Promise<void>                   // cascading: also deletes list_units
addListUnit(unit: LocalListUnit): Promise<void>
getListUnits(listId: string): Promise<LocalListUnit[]>
removeListUnit(id: string): Promise<void>
```

### Hooks API — Units

```typescript
useUnit(id: string): { data: UnitProfile | null; error: string | null; isLoading: boolean }
useUnitSearch(opts: { faction?: string; query?: string }): { data: UnitProfile[]; error: string | null; isLoading: boolean }
useFactions(): { data: string[]; error: string | null; isLoading: boolean }
useGameDataAvailable(): boolean    // simple boolean -- true if any units exist in IndexedDB
```

### Hooks API — Lists

```typescript
useLists(): { data: LocalList[]; refetch: () => void }
useList(id: string | null): { data: (LocalList & { units: LocalListUnit[] }) | null; refetch: () => void }
```

All hooks return data and never throw on IndexedDB failure. Unit hooks include `{ data, error, isLoading }`.
List hooks use a `refetch()` callback pattern for manual cache invalidation after mutations.

---

## Testing

**44 tests** across 2 test files:

| File | Tests | What it covers |
|---|---|---|
| `store.test.ts` | 29 | openDb, saveUnits (batch), getUnit, searchUnits, listFactions, clearFaction, clearAll, setImportMeta/getImportMeta, parserVersion round-trip, createList, getLists, getList, updateList, deleteList (cascade), addListUnit, getListUnits, removeListUnit |
| `hooks.test.ts` | 15 | useUnit data/loading, useUnitSearch filters, useFactions, useGameDataAvailable, error handling, useLists, useList (with units), useList refetch, useList null id |

Tests use `fake-indexeddb/auto` for in-memory IndexedDB. Consumer apps (versus, list-builder)
must add `fake-indexeddb` to their `devDependencies` and import the auto polyfill in their test setup.

```bash
cd packages/game-data-store && pnpm test
```
