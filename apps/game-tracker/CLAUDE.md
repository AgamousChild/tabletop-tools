# CLAUDE.md — game-tracker

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

game-tracker is a live game companion for Warhammer 40K matches. Records the full match turn
by turn -- one photo per turn of the board state, plus units lost, objectives scored, CP spent.
Match data feeds back into list-builder ratings.

**Port:** 3004 (server), Vite dev server proxies `/trpc` -> `:3004`

---

## Architecture

```
+---------------------------------+
|  Tier 1: React Client           |
|  - Match setup screen           |
|  - Live turn-by-turn entry      |
|  - Camera (board state photo)   |
|  - End-of-match summary         |
|  - tRPC client (type-safe)      |
+----------------+----------------+
                 | tRPC over HTTP
+----------------v----------------+
|  Tier 2: tRPC Server            |
|  - Match router                 |
|  - Turn router                  |
|  - Photo storage (R2)           |
|  - SQLite via Turso             |
+----------------+----------------+
                 |
    @tabletop-tools/server-core
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Photo storage uses Workers R2 binding API (not S3 SDK).

---

## Database Schema

```typescript
// matches
id                TEXT PRIMARY KEY
user_id           TEXT NOT NULL
list_id           TEXT              -- optional: references lists.id
opponent_faction  TEXT NOT NULL     -- user-entered string
mission           TEXT NOT NULL
result            TEXT              -- WIN | LOSS | DRAW -- null while in progress
your_final_score  INTEGER
their_final_score INTEGER
is_tournament     INTEGER NOT NULL DEFAULT 0
created_at        INTEGER NOT NULL
closed_at         INTEGER

// turns
id                TEXT PRIMARY KEY
match_id          TEXT NOT NULL     -- references matches.id
turn_number       INTEGER NOT NULL
photo_url         TEXT              -- Cloudflare R2
your_units_lost   TEXT NOT NULL     -- JSON: [{ contentId, name }]
their_units_lost  TEXT NOT NULL     -- JSON: [{ contentId, name }]
primary_scored    INTEGER NOT NULL
secondary_scored  INTEGER NOT NULL
cp_spent          INTEGER NOT NULL
notes             TEXT
created_at        INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Matches
match.start({ opponentFaction, mission, listId? })   -> match
match.get(id)                                         -> match + all turns
match.list()                                          -> match[]
match.close({ matchId, yourScore, theirScore })       -> { result, yourScore, theirScore }

// Turns
turn.add({ matchId, turnNumber, yourUnitsLost, theirUnitsLost, primaryScored, secondaryScored, cpSpent, notes?, photoDataUrl })
turn.update({ turnId, ...fields })
```

---

## Testing

**44 tests** (36 server + 8 client), all passing.

```
server/src/
  lib/
    scoring/result.ts / result.test.ts
    storage/r2.ts / r2.test.ts
  routers/                                 <- router integration tests
server/src/server.test.ts                  <- HTTP session integration tests
```

```bash
cd apps/game-tracker/server && pnpm test   # 36 server tests
cd apps/game-tracker/client && pnpm test   # 8 client tests
```
