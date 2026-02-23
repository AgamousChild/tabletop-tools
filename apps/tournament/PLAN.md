# PLAN.md — tournament

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/tournament/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema ✅ complete

`tournaments`, `tournament_players`, `rounds`, `pairings`, `player_elo`, `elo_history`
tables are in `packages/db` and tested.

---

## Phase 2: Scaffold ✅ complete

`apps/tournament/server/` and `apps/tournament/client/` scaffolded.
Hono + tRPC + TypeScript. Vite + React + TypeScript. Vitest in both.

---

## Phase 3: Auth + Roles ✅ complete

`validateSession` + `protectedProcedure` wired on server. `AuthScreen` built on client.

---

## Phase 4: Tournament Lifecycle ✅ complete

`tournament.create`, `tournament.get`, `tournament.listOpen`, `tournament.listMine`,
`tournament.advanceStatus`, `tournament.delete` — all tested.

---

## Phase 5: Player Registration ✅ complete

`player.register`, `player.updateList`, `player.checkIn`, `player.drop`,
`player.list`, `player.lockLists`, `player.removePlayer` — all implemented.

---

## Phase 6: Swiss Pairing Algorithm ✅ complete

`generatePairings()` — 10 tests covering: round 1, mid-event, odd players, rematch
avoidance, bye assignment, table numbers, win groups, unavoidable rematches.

---

## Phase 7: Round Management ✅ complete

`round.create`, `round.generatePairings`, `round.get`, `round.close` — all tested.

---

## Phase 8: Result Reporting ✅ complete

`result.report`, `result.confirm`, `result.dispute`, `result.override` — tested.
`deriveResult()` pure function — 3 tests passing.

---

## Phase 9: Standings + ELO ✅ complete

`tournament.standings` — 8 tests covering all tiebreakers.
`updateElo()` / `getKFactor()` — 10 tests covering formula, K-factor, zero-sum.
`elo.get`, `elo.history`, `elo.leaderboard` — implemented.

**Total: 42 server tests + 10 client tests = 52 tests.**

---

## Phase 10: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server
- [ ] Configure Cloudflare Pages for the React client
- [ ] Set environment variables (Turso connection, auth secrets)
- [ ] Run full end-to-end test on deployed environment

**Exit criteria:** Tournament is live and accessible by URL. A full event can be run from DRAFT to COMPLETE.

---

## Open After Launch

- Army list viewer with syntax highlighting
- TO-configurable missions list
- Public event archive (results visible to anyone, not just registered players)
- Integration with new-meta: completed tournament results exported to meta analytics
