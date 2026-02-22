# CLAUDE.md — new-meta

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

new-meta is a Warhammer 40K meta analytics platform. It publishes source data — every
tournament result, army list, and game record is publicly viewable and downloadable.
Analytics run on top of transparent data.

**Differentiator**: publishes source data. Stat-check shows aggregates. new-meta shows
aggregates AND every raw record behind them.

---

## Platform Context

```
tabletop-tools/
  packages/
    db/             ← playerGlicko, glickoHistory tables + detachment in tournamentPlayers
    game-content/   ← TournamentRecord[] parsing (BCP, TA, generic CSV)
  apps/
    new-meta/       ← this app
      client/       ← port managed by Vite (proxies to :3006)
      server/       ← port 3006
```

---

## Features

1. Faction win rates, representation, matchup matrix
2. Top detachments per faction
3. Top competitive lists (full army list text) per faction/detachment
4. Win rate timeline — faction performance across meta windows
5. Glicko-2 player leaderboard (rating ± 2×RD uncertainty band)
6. Source data — browse and download every imported tournament result
7. Admin import — operator loads CSV exports from BCP, Tabletop Admiral, generic

---

## Architecture

```
Client (React + tRPC) → Server (Hono + tRPC, port 3006) → Turso SQLite
                                                           ↑
                                                   importedTournamentResults
                                                   playerGlicko / glickoHistory
```

All tournament parsing happens server-side in the admin.import mutation.
No GW content ever touches the database — only user-entered strings.

---

## Glicko-2

Rating period = one imported tournament. Update algorithm: see lib/glicko2.ts.
Tests validate against Glickman (2012) worked example.

Display: `1687 ± 94` (rating ± 2×RD). Wide band = uncertain/new player.

Anonymous players (no username match) appear in leaderboard as name-string entries.
Admin can link them manually via admin.linkPlayer.

---

## Testing

Tests before code. No exceptions.

Critical tests:
- glicko2.test.ts — must match Glickman 2012 worked example (< 0.001 tolerance)
- aggregate.test.ts — mirror match exclusion, missing detachment, empty faction, weekly rollup
- playerMatch.test.ts — case-insensitive exact match, no partial match, no fuzzy
- detachment.test.ts — BattleScribe format, New Recruit format, fallback null

---

## Rules for Every Session

- Plan before touching anything.
- No features that aren't needed yet.
- Keep the stack shallow.
- Stop when it works.
