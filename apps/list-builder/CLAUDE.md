# CLAUDE.md — list-builder

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

list-builder is a smart army list builder for Warhammer 40K where every unit carries a live
performance rating derived from real GT+ tournament data. As you build a list, it surfaces
higher-rated alternatives at the same points cost.

**Port:** 3003 (server), Vite dev server proxies `/trpc` -> `:3003`

---

## Architecture

```
+------------------------------------+
|  Tier 1: React Client              |
|  - Faction selector                |
|  - Unit browser + search           |
|  - List builder (add/remove)       |
|  - Lists stored in server DB       |  ← V2: server is source of truth
|  - Name editing                    |
|  - Model count selection           |
|  - Unit data from IndexedDB        |
|  - Rating badges + suggestions     |
|  - tRPC client (from packages/ui)  |
+----------------+-------------------+
                 | tRPC over HTTP
+----------------v-------------------+
|  Tier 2: tRPC Server               |
|  - listV2 router (primary)         |  ← V2: all list CRUD goes here
|  - Rating router                   |
|  - SQLite via Turso                |
|  - Base infra from server-core     |
+------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.

### Data sources

**Unit catalog** (datasheets, weapons, abilities, detachments) lives in IndexedDB via
`@tabletop-tools/game-data-store`. Populated by the data-import app. No GW content is
committed to this repo.

**Army lists** are stored server-first in the `list` / `list_unit` / `list_unit_loadout` /
`list_unit_loadout_weapon` tables (Phase 2 schema). The client's IndexedDB `lists` /
`list_units` stores are deprecated as primary storage. A one-time migration runs on first
load to push any pre-V2 IndexedDB lists to the server.

---

## Features required to be considered functional

1. More than one screen; a screen with the names of lists and the ability to add new ones.
2. After creating a list, the next screen is battle size: 500, 1000, 2000, 3000 pts.
3. Then faction is chosen, then detachment.
4. In the unit selector, only legal choices are shown (legends excluded unless toggled).
5. Army creation rules enforced: limited duplicates per battle size, warlord required,
   points cap enforced.
6. Detachment unit choice limitations applied where they exist.
7. After each unit is added, show the unit's statistical information and a popup of
   higher-rated alternatives at the same or fewer points.
8. Done saves the list back to the server (user_id, faction_id, detachment_id, unit list).
9. Export copies the list as plain text to the clipboard.
10. "Use in Tournament" button stores the list in localStorage for the tournament app.

---

## Data Sources

### Unit Profiles: IndexedDB (via game-data-store)

Unit profiles come from BSData XML imported via the data-import app and stored client-side
in IndexedDB. The server has no access to unit profile data.

### Army Lists: Server (listV2 tRPC router) — Phase 2

Lists and list units are stored server-first via the `listV2` tRPC router. All list CRUD
operations write to the relational DB immediately. There is no offline/IndexedDB fallback for
list storage in V2.

**One-time migration** (`migrateIndexedDbLists.ts`): on first load after the V2 upgrade, any
lists found in the legacy IndexedDB `lists` / `list_units` stores are pushed to the server.
The migration is gated by `localStorage['list-builder:idb-migration-v2-done']`.

### Ratings: Native match records + imported tournament data

- **Native match records** -- games tracked in `apps/game-tracker` with `is_tournament = 1`
- **Imported tournament results** -- external CSV files imported via admin panel
- Ratings reset on dataslate/codex -- `meta_window` label changes

---

## Database Schema

### Server (Turso/SQLite) — ratings + army lists

```typescript
// unit_ratings
id               TEXT PRIMARY KEY
unit_content_id  TEXT NOT NULL
rating           TEXT NOT NULL      -- S / A / B / C / D
win_contrib      REAL NOT NULL
pts_eff          REAL NOT NULL
meta_window      TEXT NOT NULL
computed_at      INTEGER NOT NULL

// list (Phase 2 schema — packages/db/src/list-schema.ts)
id, user_id, name, edition, battle_size, total_points, source, author,
faction_id, subfaction_id, detachment_id, dataslate_id, created_at, updated_at

// list_unit
id, list_id, datasheet_id, enhancement_id, is_warlord, points,
attached_to_unit_id, attach_role

// list_unit_loadout
id, list_unit_id, model_count

// list_unit_loadout_weapon
id, loadout_id, weapon_id, count
```

### Client (IndexedDB) — catalog only

IndexedDB stores unit profiles, factions, detachments, weapons, abilities etc. via
`@tabletop-tools/game-data-store`. The `lists` and `list_units` IndexedDB stores are
deprecated and kept only for the one-time migration read.

---

## tRPC Routers

```typescript
// Ratings
rating.get(unitId)                            -> { rating, winContrib, ptsEff }
rating.alternatives({ metaWindow? })          -> rating[]

// Lists (primary — Phase 2 relational model)
listV2.create(...)                            -> { id }
listV2.update({ id, ... })                    -> { success }
listV2.get({ id })                            -> list with units + loadouts
listV2.getAll()                               -> list[]
listV2.delete({ id })                         -> { success }
listV2.addUnit({ listId, datasheetId, ... })  -> { id }
listV2.updateUnit({ id, ... })                -> { success }
listV2.removeUnit({ id })                     -> { success }
listV2.setLoadout({ unitId, loadouts[] })     -> { success }
listV2.computePoints({ listId })              -> { totalPoints }

// Legacy list router (kept for backward compat; deprecated)
list.sync(...)       -> { success }
list.syncAll(...)    -> { success }
list.getAll()        -> list[]
list.delete({ id })  -> { success }
```

---

## Client hooks (`apps/list-builder/client/src/lib/`)

```typescript
// useListsV2.ts — primary hooks
useListsV2()             -> { data: ListSummaryV2[]; ... }
useListV2(id)            -> { data: ListV2 | null; ... }
useCreateListV2()        -> mutation hook
useUpdateListV2()        -> mutation hook
useDeleteListV2()        -> mutation hook
useAddUnitV2()           -> mutation hook
useUpdateUnitV2()        -> mutation hook
useRemoveUnitV2()        -> mutation hook
useInvalidateListsV2()   -> invalidate callback

// Imperative helpers (for event handlers)
createListV2Imperative(input)  -> Promise<string>  (returns id)
addUnitV2Imperative(input)     -> Promise<string>  (returns unit id)
updateListV2Imperative(input)  -> Promise<{ success }>
removeUnitV2Imperative(id)     -> Promise<{ success }>
deleteListV2Imperative(id)     -> Promise<{ success }>
updateUnitV2Imperative(input)  -> Promise<{ success }>

// migrateIndexedDbLists.ts — one-time migration
migrateIndexedDbLists()       -> Promise<MigrationResult>
isMigrationDone()             -> boolean
markMigrationDone()           -> void
```

---

## Testing

**129 tests** (53 server + 76 client), all passing.

```
server/src/
  routers/
    rating.test.ts           <- rating get, alternatives query (7 tests)
    list.test.ts             <- legacy sync, syncAll, getAll, delete (10 tests)
    list-v2.test.ts          <- V2 CRUD + attachment enforcement (18 tests)
  lib/ratings/
    score.ts / score.test.ts <- scoring logic (14 tests)
server/src/server.test.ts    <- HTTP session integration tests (4 tests)
client/src/
  lib/
    useGameData.test.tsx     <- IndexedDB hook wrappers (3 tests)
    modelOptions.test.ts     <- model count parser (8 tests)
    armyRules.test.ts        <- army validation (11 tests)
    detachmentRestrictions.test.ts  (11 tests)
    useListsV2.test.ts       <- pointsToBattleSizeEnum + utilities (5 tests)
    migrateIndexedDbLists.test.ts   <- migration helper (7 tests)
  components/
    ListBuilderScreen.test.tsx  <- navigation + V2 integration (12 tests)
    MyListsScreen.test.tsx   <- V2 list display + tournament (9 tests)
    BattleSizeScreen.test.tsx   <- (5 tests)
    RatingBadge.test.tsx     <- (5 tests)
```

```bash
cd apps/list-builder/server && pnpm test   # 53 server tests
cd apps/list-builder/client && pnpm test   # 76 client tests
```
