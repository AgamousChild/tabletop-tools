# PLAN.md — tournament

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/tournament/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema ✅ complete

`tournaments`, `tournament_players`, `rounds`, `pairings`, `player_elo`, `elo_history`
tables are in `packages/db` and tested.

---

## Phase 2: Scaffold

- [ ] Scaffold `apps/tournament/server/` — Hono + tRPC + TypeScript
- [ ] Scaffold `apps/tournament/client/` — Vite + React + TypeScript
- [ ] Wire `packages/auth`, `packages/db`, `packages/ui` into both
- [ ] Configure Vitest in both client and server
- [ ] Confirm `pnpm dev`, `pnpm test`, and `pnpm build` all work

**Exit criteria:** Blank app runs on port 3005. Tests run.

---

## Phase 3: Auth + Roles

- [ ] Mount shared Better Auth handler from `packages/auth` on the server
- [ ] Wire tRPC context to carry the authenticated user
- [ ] Add `protectedProcedure` middleware — unauthenticated calls rejected
- [ ] Add `toProcedure` middleware — rejects if user is not the TO for the given tournament
- [ ] Build login and register UI in the client
- [ ] Test: TO-only endpoints reject non-TO users; player endpoints work for all auth'd users

**Exit criteria:** Auth works. Role boundary is enforced on the server.

---

## Phase 4: Tournament Lifecycle

- [ ] Implement `tournament.create(...)` → DRAFT status
- [ ] Implement `tournament.get(id)` → tournament + status + player count
- [ ] Implement `tournament.listOpen()` → REGISTRATION or CHECK_IN events (public)
- [ ] Implement `tournament.listMine()` → TO's own events + events player is in
- [ ] Implement `tournament.advanceStatus(id)` → moves DRAFT→REGISTRATION→CHECK_IN→IN_PROGRESS→COMPLETE
- [ ] Implement `tournament.delete(id)` → DRAFT only
- [ ] Write tests for all status transitions (valid and invalid)
- [ ] Build TO dashboard: create tournament, view status, advance lifecycle
- [ ] Build public tournament browser (listOpen)

**Exit criteria:** TO can create an event, move it through lifecycle. Players can browse open events.

---

## Phase 5: Player Registration

- [ ] Implement `player.register({ tournamentId, displayName, faction, listText? })`
- [ ] Implement `player.updateList({ tournamentId, listText })` — blocked once `list_locked = 1`
- [ ] Implement `player.checkIn({ tournamentId })`
- [ ] Implement `player.drop({ tournamentId })`
- [ ] Implement `player.list({ tournamentId })` — TO only, lists visible
- [ ] Implement `player.lockLists({ tournamentId })` — TO only
- [ ] Implement `player.removePlayer({ playerId })` — TO only
- [ ] Write tests for all procedures, including lock/edit guard
- [ ] Build player registration form
- [ ] Build TO player management panel (list registrations, lock lists, mark checked-in)

**Exit criteria:** Players can register and submit lists. TO can lock lists and manage attendance.

---

## Phase 6: Swiss Pairing Algorithm

The most critical piece. Must be exhaustively tested before it touches a real event.

- [ ] Write tests first for all edge cases:
  - Round 1 (all players same record)
  - Mid-event (players ranked by W-L-D, margin, SOS)
  - Odd number of players (bye assigned to lowest-ranked unpaired)
  - Rematch avoidance (swap with adjacent pair in group)
  - Rematches unavoidable in small events (allowed with flag)
  - Dropped players excluded from pairings
- [ ] Implement `sortByStandings(players)` — wins DESC → margin DESC → SOS DESC → registration order
- [ ] Implement `groupByRecord(ranked)` — group by W-L-D string
- [ ] Implement within-group pairing (1st vs n/2+1, etc., with overflow to next group)
- [ ] Implement rematch check + swap logic
- [ ] Implement bye assignment
- [ ] Implement table number assignment (by rank of higher seed)
- [ ] Compose into `generatePairings(players, previousPairings)` → Pairing[]

**Exit criteria:** Swiss algorithm passes all edge case tests. Output is provably correct for known inputs.

---

## Phase 7: Round Management

- [ ] Implement `round.create({ tournamentId })` → round — TO only
- [ ] Implement `round.generatePairings({ roundId })` → pairing[] — TO only, calls Swiss algo
- [ ] Implement `round.get({ roundId })` → round + pairings — public once ACTIVE
- [ ] Implement `round.close({ roundId })` — TO only, all results must be confirmed first
- [ ] Write tests for all procedures
- [ ] Build pairings board UI (designed for venue display screen):
  - Table number, Player 1, Player 2, Mission
  - Visible to all once round is ACTIVE
  - Large, readable, no login required for view

**Exit criteria:** TO generates pairings. Pairings board goes live. Players see their table.

---

## Phase 8: Result Reporting

- [ ] Implement `result.report({ pairingId, player1VP, player2VP })` — either player
- [ ] Implement `result.confirm({ pairingId })` — the other player
- [ ] Implement `result.dispute({ pairingId })` — flags for TO
- [ ] Implement `result.override({ pairingId, player1VP, player2VP })` — TO only
- [ ] Implement `deriveResult(p1VP, p2VP)` → P1_WIN | P2_WIN | DRAW (pure function, tested)
- [ ] Write tests for: report → confirm flow, dispute flag, override, derived result logic
- [ ] Build result reporting UI for players: enter VP scores
- [ ] Build confirmation UI: confirm or dispute opponent's report
- [ ] Build TO dispute resolution panel

**Exit criteria:** Both players can report and confirm results. Disputes are flagged and resolved by TO. `round.close` is blocked until all results confirmed.

---

## Phase 9: Standings + ELO

- [ ] Implement `tournament.standings(id)` → ranked player list with W-L-D, VP, margin, SOS
- [ ] Implement tiebreaker logic: wins → margin → SOS → total VP (pure function, tested)
- [ ] Implement `updateElo(winnerRating, loserRating, kFactor, isDraw)` — pure function
- [ ] Implement ELO update trigger: runs when TO closes a round, commits all results together
- [ ] Implement `elo.get(userId)` → { rating, gamesPlayed }
- [ ] Implement `elo.history(userId)` → elo_history[]
- [ ] Implement `elo.leaderboard()` → ranked by rating
- [ ] Write tests: tiebreaker ordering with known inputs, ELO formula, K-factor threshold
- [ ] Build live standings UI (updates after each round close)
- [ ] Build ELO leaderboard page

**Exit criteria:** Standings are correct with proper tiebreakers. ELO updates after every round close, not just at tournament end.

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
