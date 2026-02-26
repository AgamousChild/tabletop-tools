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

## Features required to be considered functional 
  
1. More than one screen, create a screen with the names of the lists chosen. and the ability to add lists.
2. After creating a list, the next screen should be the size of the army, with the associated battle size name 500, 1000, 2000, 3000 pts
3. Then the faction should be chosen on the next screen, with the detachment then chosen.
4. In the unit selector, only legal choices should be shown, we can worry about legends later.
5. There are rules in army creation, limited choices for 500 pt games, 2 of any in 1000 pt games, and 3 of any in 2000 pt games, plus warlords must be chosen. And the user cant choose more than the allotted number of points.
6. Some detachments have unit choice limitations, use them if they exist.
7. During unit selection, after each unit is chosen, show the statistical information about that unit, and in a popup, show units that have the same or fewer points in the same role that have higher win rates.
8. There should be a done button, and then the list selections should be saved back to the server, associated with the user and the list name, it should just be user_id, faction_id, detachment_id, unit_id(S) for that list. This is the same as saved locally, except that the user can a list name, and a description to the list.
9. The export should export in full text format, and the user can then edit that text before saving off, it should be stored in the clipboard, and the user should see a note.
10. The user should be able to select a list and then a button should be available that says use list in tournament tracker. that list is then used when the user registers for a tournament.

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
