# CLAUDE.md — new-meta

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

new-meta is a Warhammer 40K meta analytics platform. The differentiator is radical
transparency: every tournament result, army list, and game record is publicly viewable
and downloadable. Analytics run on top of open data.

Stat-check.com shows aggregates. new-meta shows aggregates **and** every raw record
behind them. If a faction has a 54% win rate, you can click through to the 18
tournaments that produced that number, see every army list that won, and download the
full dataset. That's the whole premise.

---

## Current State

| Layer | Status |
|---|---|
| DB schema (playerGlicko, glickoHistory, detachment) | ✅ built + tested |
| packages/game-content CSV parsers (detachment, playerName) | ✅ built + tested |
| Server — all routers + lib | ✅ built + tested (51 tests) |
| Client — pages + components | 🔲 scaffold only (no logic wired) |

---

## Platform Context

```
tabletop-tools/
  packages/
    auth/           ← shared Better Auth (one login across all tools)
    db/             ← schema: playerGlicko, glickoHistory + detachment on tournamentPlayers
    game-content/   ← TournamentRecord[] parsing (BCP, TA, generic CSV)
  apps/
    new-meta/
      client/       ← Vite (port managed by Vite dev server, proxies /trpc → :3006)
      server/       ← port 3006
```

---

## Architecture

```
Client (React + tRPC)
  │
  │  HTTP — tRPC batch link → /trpc
  ▼
Server (Hono + tRPC, port 3006)
  │
  │  Drizzle ORM
  ▼
Turso SQLite
  ├── importedTournamentResults   ← primary meta source
  ├── playerGlicko                ← Glicko-2 ratings
  └── glickoHistory               ← rating audit trail
```

All tournament parsing (BCP CSV, Tabletop Admiral CSV, generic CSV) runs in
`admin.import`. Parsed JSON (`TournamentRecord[]`) is stored in `importedTournamentResults.parsedData`.
All meta queries read from that stored JSON — no re-parsing at query time.

No GW content ever touches the database. Faction, detachment, and army list strings
are stored exactly as the user typed them. The platform does not validate against any
GW-owned data.

---

## File Structure

```
apps/new-meta/
  CLAUDE.md
  client/
    package.json          name: "new-meta-client"
    index.html
    vite.config.ts        port: Vite default, proxy /trpc → localhost:3006
    tailwind.config.ts
    tsconfig.json
    tsconfig.node.json
    postcss.config.js
    src/
      App.tsx             state-machine navigation (no URL router)
      main.tsx
      index.css
      lib/
        trpc.ts           createTRPCReact<AppRouter> + httpBatchLink
        auth.ts           Better Auth client
      pages/
        Dashboard.tsx     faction table + matchup matrix + MetaWindowSelector
        FactionDetail.tsx detachments, units, top lists for one faction
        PlayerRanking.tsx Glicko-2 leaderboard with GlickoBar components
        SourceData.tsx    tournament list → links to TournamentDetail
        TournamentDetail.tsx  all players + lists for one event, download buttons
        Admin.tsx         CSV import form (protected)
      components/
        FactionTable.tsx      win rate colored ≥55%=emerald, ≤45%=red
        MatchupMatrix.tsx     N×N grid, mirror matches show —
        GlickoBar.tsx         rating ± 2×RD uncertainty visualization
        ListCard.tsx          collapsible army list text display
        MetaWindowSelector.tsx  dropdown from trpc.meta.windows
      test/
        setup.ts
  server/
    package.json          name: "new-meta-server"
    drizzle.config.ts
    tsconfig.json
    src/
      index.ts            port 3006
      server.ts           Hono + CORS + auth handler + tRPC handler
      trpc.ts             publicProcedure, protectedProcedure, Context
      routers/
        index.ts          appRouter (health + meta + player + source + admin)
        meta.ts           public — factions, faction, detachments, matchups, lists, timeline, windows
        player.ts         public — leaderboard, profile, search
        source.ts         public — tournaments, tournament, download
        admin.ts          protected — import, recomputeGlicko, linkPlayer
      lib/
        glicko2.ts        full Glicko-2 (Illinois algorithm, SCALE=173.7178, τ=0.5)
        glicko2.test.ts   9 tests — validates against Glickman 2012 worked example
        aggregate.ts      pure functions: FactionStat, DetachmentStat, MatchupCell, ListResult, WeeklyPoint
        aggregate.test.ts 23 tests — empty, win rates, draws×0.5, timeline, getWeekStart
        playerMatch.ts    matchPlayerName() — case-insensitive exact match only, no fuzzy
        playerMatch.test.ts  11 tests — exact match, displayUsername, no partial match
        detachment.ts     extractDetachment() — regex from list text (BattleScribe, New Recruit, dash)
        detachment.test.ts   8 tests — all three formats + null fallback
```

---

## tRPC Routers

### meta (public)

```typescript
meta.factions({ metaWindow?, format?, minGames? })          → FactionStat[]
meta.faction({ faction, metaWindow?, format? })              → FactionDetail
meta.detachments({ faction?, metaWindow?, format? })         → DetachmentStat[]
meta.matchups({ metaWindow?, format?, minGames? })           → MatchupCell[]
meta.lists({ faction?, detachment?, metaWindow?, limit? })   → ListResult[]
meta.timeline({ faction?, metaWindow? })                     → WeeklyPoint[]
meta.windows()                                               → string[]
```

All meta queries filter `importedTournamentResults` by `metaWindow` (the `meta_window`
column set at import time). If no window is specified, all imported data is included.

**Matchup matrix caveat**: The current implementation uses a top-half vs bottom-half
approximation (players who finished in the top 50% of one faction versus players who
finished in the bottom 50% of another). Exact pairings would require the pairings table,
which is only available for native tournament events. This is a known limitation and is
the right trade-off until pairing-level import data is available.

### player (public)

```typescript
player.leaderboard({ limit?, minGames?, metaWindow? })   → GlickoEntry[]
player.profile({ playerId })                              → { player, history, recentResults }
player.search({ name })                                   → GlickoEntry[]
```

Display format: `1687 ± 94` (rating ± 2×RD). Wide band = uncertain / new player.

### source (public)

```typescript
source.tournaments({ format?, after?, before?, limit? })   → TournamentSummary[]
source.tournament({ importId })                             → { event, players }
source.download({ importId, format: 'json' | 'csv' })      → string
```

Download provides the full parsed `TournamentRecord[]` as JSON, or flattened as CSV.
This is the transparency feature — every record is retrievable.

### admin (protected)

```typescript
admin.import({ csv, format, eventName, eventDate, metaWindow, minRounds?, minPlayers? })
  → { importId, imported, skipped, errors, playersUpdated }

admin.recomputeGlicko({ fromImportId? })   → { playersUpdated }
admin.linkPlayer({ glickoId, userId })     → GlickoEntry
```

Import stores the raw CSV + parsed JSON, then runs `updateGlickoForImport`. Glicko-2
updates synthesize game results from wins/losses/draws against an average opponent
(1500 rating, 200 RD) — a known approximation. Full pairing-level Glicko-2 requires
per-game opponent data which CSV exports do not contain.

---

## Glicko-2 Rating System

Implementation: `server/src/lib/glicko2.ts`
Validated against: Glickman (2012) worked example — r'≈1464.06, RD'≈151.52, σ'≈0.05999

| Parameter | Value |
|---|---|
| Starting rating | 1500 |
| Starting RD | 350 |
| Starting volatility | 0.06 |
| Scale constant | 173.7178 |
| System constant τ | 0.5 |
| Rating period | one imported tournament |

**Player matching**: Case-insensitive exact match on `authUsers.username` or
`authUsers.displayUsername`. No fuzzy matching — a name mismatch creates an anonymous
entry (`userId = null`) rather than silently merging the wrong accounts. Admins can
link anonymous entries to accounts via `admin.linkPlayer`.

**Inactivity**: If a player has no games in a period, RD grows (`φ* = sqrt(φ² + σ²)`)
but rating and volatility are unchanged.

---

## Meta Windows

A meta window is an operator-defined label (e.g. `"2025-Q2"`) applied at import time.
It lets the platform filter analytics to a specific competitive period — post-dataslate,
post-codex, etc. All analytics procedures accept an optional `metaWindow` filter.

`meta.windows()` returns all distinct window labels that appear in the imported data.

---

## Testing

Tests are written before the code. No exceptions.

```
lib/glicko2.test.ts     9 tests — Glickman 2012 worked example, inactivity, edge cases
lib/aggregate.test.ts  23 tests — faction stats, win rates, draws×0.5, detachments, lists,
                                  timeline, getWeekStart, empty input
lib/playerMatch.test.ts 11 tests — case-insensitive, displayUsername, no partial/fuzzy
lib/detachment.test.ts  8 tests — BattleScribe, New Recruit, dash format, null fallback
Total: 51 tests, all passing
```

Client has no logic tests yet (scaffold only). Tests will be written as pages are wired.

---

## Rules for Every Session

See root `CLAUDE.md` — Rules for Every Session.
