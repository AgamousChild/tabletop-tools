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
|  - Lists stored in IndexedDB       |
|  - Unit data from IndexedDB        |
|  - Rating badges + suggestions     |
|  - tRPC client (from packages/ui)  |
+----------------+-------------------+
                 | tRPC over HTTP
+----------------v-------------------+
|  Tier 2: tRPC Server               |
|  - Rating router                   |
|  - SQLite via Turso                |
|  - Base infra from server-core     |
+------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Unit data and army lists stored client-side in IndexedDB via `@tabletop-tools/game-data-store`.
Server only provides rating data — all list CRUD and unit lookups happen client-side.

---

## Data Sources

### Unit Profiles: IndexedDB (via game-data-store)

**The platform ships zero GW content.** Unit profiles come from BSData XML imported via the
data-import app and stored client-side in IndexedDB. The server has no access to unit data.

### Army Lists: IndexedDB (via game-data-store)

Lists and list units are stored client-side in IndexedDB. All list CRUD operations (create,
add unit, remove unit, delete) happen directly in the browser. This means lists work offline
and don't depend on the server Worker being available.

### Ratings: Native match records + imported tournament data

- **Native match records** -- games tracked in `apps/game-tracker` with `is_tournament = 1`
- **Imported tournament results** -- external CSV files imported via admin panel
- Ratings reset on dataslate/codex -- `meta_window` label changes

---

## Database Schema

### Server (Turso/SQLite) — ratings only

```typescript
// unit_ratings
id               TEXT PRIMARY KEY
unit_content_id  TEXT NOT NULL
rating           TEXT NOT NULL      -- S / A / B / C / D
win_contrib      REAL NOT NULL
pts_eff          REAL NOT NULL
meta_window      TEXT NOT NULL
computed_at      INTEGER NOT NULL
```

### Client (IndexedDB) — lists and units

Lists and list units are stored in the `lists` and `list_units` object stores in IndexedDB
via `@tabletop-tools/game-data-store`. See game-data-store CLAUDE.md for the schema.

The server-side `lists` and `list_units` tables in Turso still exist (historical data) but
are no longer read or written by the app.

---

## tRPC Routers

```typescript
// Ratings (server-side only — unit data and lists are client-side)
rating.get(unitId)                            -> { rating, winContrib, ptsEff }
rating.alternatives({ metaWindow? })          -> rating[]   // client filters by points
```

Unit browsing, list CRUD, and suggestion filtering all happen client-side using IndexedDB data.

---

## Testing

**48 tests** (25 server + 23 client), all passing.

```
server/src/
  routers/
    rating.test.ts           <- rating get, alternatives query
  lib/ratings/
    score.ts / score.test.ts <- scoring logic: win contribution, points efficiency
server/src/server.test.ts    <- HTTP session integration tests
client/src/
  lib/
    useGameData.test.tsx     <- IndexedDB hook tests
  components/
    ListBuilderScreen.test.tsx <- list CRUD, units, remove, export, empty state
    RatingBadge.test.tsx       <- 5 tests: null/undefined → dash, tier colors (S/B/D)
```

List CRUD tests moved from server to client (list operations now happen in IndexedDB).

```bash
cd apps/list-builder/server && pnpm test   # 25 server tests
cd apps/list-builder/client && pnpm test   # 23 client tests
```
