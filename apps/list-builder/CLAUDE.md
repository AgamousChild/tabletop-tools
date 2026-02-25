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
|  - Rating badges + suggestions     |
|  - tRPC client (from packages/ui)  |
+----------------+-------------------+
                 | tRPC over HTTP
+----------------v-------------------+
|  Tier 2: tRPC Server               |
|  - Unit router (from game-content) |
|  - List router                     |
|  - Rating router                   |
|  - SQLite via Turso                |
|  - Base infra from server-core     |
+------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Unit router uses `createUnitRouter()` from `@tabletop-tools/game-content`.

---

## Data Sources

### Unit Profiles: BSData (via GameContentAdapter)

**The platform ships zero GW content.** Unit profiles loaded at runtime via `BSDataAdapter`
or `NullAdapter` if `BSDATA_DIR` is not set.

### Ratings: Native match records + imported tournament data

- **Native match records** -- games tracked in `apps/game-tracker` with `is_tournament = 1`
- **Imported tournament results** -- external CSV files imported via admin panel
- Ratings reset on dataslate/codex -- `meta_window` label changes

---

## Database Schema

No `units` table. `unit_content_id` columns are plain TEXT -- no FK into game content.

```typescript
// unit_ratings
id               TEXT PRIMARY KEY
unit_content_id  TEXT NOT NULL
rating           TEXT NOT NULL      -- S / A / B / C / D
win_contrib      REAL NOT NULL
pts_eff          REAL NOT NULL
meta_window      TEXT NOT NULL
computed_at      INTEGER NOT NULL

// lists
id         TEXT PRIMARY KEY
user_id    TEXT NOT NULL
faction    TEXT NOT NULL
name       TEXT NOT NULL
total_pts  INTEGER NOT NULL
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL

// list_units
id               TEXT PRIMARY KEY
list_id          TEXT NOT NULL      -- references lists.id
unit_content_id  TEXT NOT NULL
unit_name        TEXT NOT NULL      -- denormalized at add-time
unit_points      INTEGER NOT NULL
count            INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Units (from createUnitRouter in packages/game-content)
unit.listFactions()                           -> string[]
unit.search({ faction?, query? })             -> unit[]
unit.get(id)                                  -> unit

// Ratings
rating.get(unitId)                            -> { rating, winContrib, ptsEff }
rating.alternatives({ unitId, ptsRange? })    -> unit[]

// Lists
list.create({ faction, name })                -> list
list.get(id)                                  -> list + all units + ratings
list.list()                                   -> list[]
list.addUnit({ listId, unitId, count? })
list.removeUnit({ listId, listUnitId })
list.delete(id)
```

---

## Testing

**76 tests** (51 server + 25 client), all passing.

```
server/src/
  routers/
    list.test.ts             <- list CRUD, addUnit, removeUnit, points math
    rating.test.ts           <- rating get, alternatives query
  lib/ratings/
    score.ts / score.test.ts <- scoring logic: win contribution, points efficiency
server/src/server.test.ts    <- HTTP session integration tests
client/src/
  lib/
    useGameData.test.tsx     <- dual-source hook tests (IndexedDB vs tRPC fallback)
  components/
    ListBuilderScreen.test.tsx <- 15 tests: list CRUD, units, remove, export, empty state
    RatingBadge.test.tsx       <- 5 tests: null/undefined → dash, tier colors (S/B/D)
```

```bash
cd apps/list-builder/server && pnpm test   # 51 server tests
cd apps/list-builder/client && pnpm test   # 25 client tests
```
