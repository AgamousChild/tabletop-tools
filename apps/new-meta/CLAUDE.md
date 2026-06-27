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
meta.factions({ frame?, granularityId?, granularity?, minGames? })   -> FactionStat[]
meta.faction({ factionId, frame?, granularityId?, granularity? })    -> FactionDetail
meta.matchups({ frame?, minGames? })                                 -> MatchupCell[]
meta.frames({ granularityId?, granularity? })                        -> FrameRow[]
meta.availableFilters({ granularityId?, granularity? })              -> {
  granularityId, types, granularities, framesByType
}
meta.windows({ granularityId?, granularity? })                       -> string[]
```

All meta procedures derive type ids (Quarter, Month, …) and granularity ids
(Faction, SubFaction, Detachment) from `dim_for_type` and `dim_granularity`
at request time. Source code never embeds those numeric ids (Rule 6).

- `frame` — the `meta_for.id` to scope the query (e.g. `"quarter:2026:3"`).
  When omitted, the server resolves it to the most-recent **populated**
  frame at the chosen granularity, preferring the configured default type
  (Quarter) and falling back to any populated frame of any type.
- `granularityId` / `granularity` — pass either the numeric id from
  `dim_granularity` or the dim name (`"Faction"`, `"SubFaction"`,
  `"Detachment"`). Default: `"Faction"`.
- `availableFilters` — discovery endpoint for the filter UI. Returns the
  available types (with per-type counts of populated frames), the
  populated granularities, and frames grouped by type with a `hasData`
  flag. Use this to build optgroups without hardcoding type ids.

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

Server + client suites run independently; both must pass before deploys.

```bash
pnpm -F new-meta-server test
pnpm -F new-meta-client test
```

Server lib coverage of note:

```
lib/glicko2.test.ts       — Glickman 2012 worked example, inactivity, edge cases
lib/aggregate.test.ts     — faction stats, win rates, draws, timeline, getWeekStart
lib/playerMatch.test.ts   — case-insensitive, displayUsername, no partial/fuzzy
lib/detachment.test.ts    — BattleScribe, New Recruit, dash format, null fallback
lib/frameFilters.test.ts  — dim-driven type/granularity discovery, default frame resolution
server.test.ts            — HTTP session integration (admin + public endpoints)
```
