# CLAUDE.md — new-meta

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

new-meta is a Warhammer 40K meta analytics platform. The differentiator is radical
transparency: every tournament result, army list, and game record is publicly viewable
and downloadable.

**Port:** 3006 (server), Vite dev server proxies `/trpc` -> `:3006`

---

## Architecture

```
Client (React + tRPC)
  |
  |  HTTP -- tRPC batch link -> /trpc
  v
Server (Hono + tRPC, port 3006)
  |
  |  Drizzle ORM
  v
Turso SQLite
  +-- importedTournamentResults   <- primary meta source
  +-- playerGlicko                <- Glicko-2 ratings
  +-- glickoHistory               <- rating audit trail
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.

Admin routes use `adminProcedure` with `ADMIN_EMAILS` env var allowlist (same pattern as admin app).

---

## Client-Side Hash Routing

Bookmarkable, shareable URLs for detail pages:

```
#/                              -> Dashboard (faction table + matchup matrix)
#/faction/{name}                -> FactionDetail
#/players                       -> PlayerRanking (Glicko-2 leaderboard)
#/player/{id}                   -> PlayerProfile
#/source                        -> SourceData (tournament list)
#/tournament/{importId}         -> TournamentDetail
#/admin                         -> Admin (CSV import)
```

Uses `parseHash()` + `navigate()` + `hashchange` listener pattern. Navigation components
update the hash instead of calling setState.

---

## File Structure

```
apps/new-meta/
  client/
    src/
      App.tsx             hash-based routing
      main.tsx
      lib/trpc.ts, auth.ts
      pages/
        Dashboard.tsx, FactionDetail.tsx, PlayerRanking.tsx,
        SourceData.tsx, TournamentDetail.tsx, Admin.tsx
      components/
        FactionTable.tsx, MatchupMatrix.tsx, GlickoBar.tsx,
        ListCard.tsx, MetaWindowSelector.tsx
  server/
    src/
      index.ts, server.ts, trpc.ts (with adminProcedure)
      routers/
        index.ts, meta.ts, player.ts, source.ts, admin.ts
      lib/
        glicko2.ts, aggregate.ts, playerMatch.ts, detachment.ts
```

---

## tRPC Routers

### meta (public)

```typescript
meta.factions({ metaWindow?, format?, minGames? })          -> FactionStat[]
meta.faction({ faction, metaWindow?, format? })              -> FactionDetail
meta.detachments({ faction?, metaWindow?, format? })         -> DetachmentStat[]
meta.matchups({ metaWindow?, format?, minGames? })           -> MatchupCell[]
meta.lists({ faction?, detachment?, metaWindow?, limit? })   -> ListResult[]
meta.timeline({ faction?, metaWindow? })                     -> WeeklyPoint[]
meta.windows()                                               -> string[]
```

### player (public)

```typescript
player.leaderboard({ limit?, minGames?, metaWindow? })   -> GlickoEntry[]
player.profile({ playerId })                              -> { player, history, recentResults }
player.search({ name })                                   -> GlickoEntry[]
```

### source (public)

```typescript
source.tournaments({ format?, after?, before?, limit? })   -> TournamentSummary[]
source.tournament({ importId })                             -> { event, players }
source.download({ importId, format: 'json' | 'csv' })      -> string
```

### admin (adminProcedure -- ADMIN_EMAILS allowlist)

```typescript
admin.import({ csv, format, eventName, eventDate, metaWindow, ... }) -> { importId, imported, skipped, errors, playersUpdated }
admin.recomputeGlicko({ fromImportId? })   -> { playersUpdated }
admin.linkPlayer({ glickoId, userId })     -> GlickoEntry
```

---

## Glicko-2 Rating System

Implementation validated against Glickman (2012) worked example.

| Parameter | Value |
|---|---|
| Starting rating | 1500 |
| Starting RD | 350 |
| Starting volatility | 0.06 |
| Scale constant | 173.7178 |
| System constant tau | 0.5 |
| Rating period | one imported tournament |

**Player matching**: Case-insensitive exact match on username/displayUsername. No fuzzy matching --
mismatches create anonymous entries. Admins link them via `admin.linkPlayer`.

---

## Testing

**128 tests** (57 server + 71 client), all passing.

### Server Tests

```
lib/glicko2.test.ts     9 tests -- Glickman 2012 worked example, inactivity, edge cases
lib/aggregate.test.ts  23 tests -- faction stats, win rates, draws, timeline, getWeekStart
lib/playerMatch.test.ts 11 tests -- case-insensitive, displayUsername, no partial/fuzzy
lib/detachment.test.ts  8 tests -- BattleScribe, New Recruit, dash format, null fallback
server.test.ts          6 tests -- HTTP session integration
Total server: 57 tests
```

### Client Tests

```
71 tests across pages and components
Total client: 71 tests
```

```bash
cd apps/new-meta/server && pnpm test   # 57 server tests
cd apps/new-meta/client && pnpm test   # 71 client tests
```
