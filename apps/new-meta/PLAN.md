# PLAN.md — new-meta

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/new-meta/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: Server + DB ✅ complete

All server routers and lib are built and tested (51 tests passing):
- `lib/glicko2.ts` — Glicko-2 rating system, validated against Glickman 2012
- `lib/aggregate.ts` — faction stats, win rates, detachments, matchups, timeline
- `lib/playerMatch.ts` — case-insensitive exact player name matching
- `lib/detachment.ts` — detachment extraction from BattleScribe / New Recruit / dash format
- All tRPC routers: `meta`, `player`, `source`, `admin`

Client scaffold exists (Vite + React), but no logic is wired yet.

---

## Phase 2: Wire Dashboard Page

- [ ] Connect `Dashboard.tsx` to `trpc.meta.factions()`
- [ ] Build `FactionTable` component: faction name, win rate, game count, color coding
  - Win rate ≥ 55% → emerald
  - Win rate ≤ 45% → red
  - Otherwise → neutral
- [ ] Connect `Dashboard.tsx` to `trpc.meta.matchups()`
- [ ] Build `MatchupMatrix` component: N×N grid, mirror matches show —
- [ ] Wire `MetaWindowSelector` dropdown to `trpc.meta.windows()`
- [ ] All three components filter by selected meta window
- [ ] Write component tests (mock tRPC, known faction/matchup data)

**Exit criteria:** Dashboard loads faction table and matchup matrix, filtered by meta window.

---

## Phase 3: Wire FactionDetail Page

- [ ] Connect `FactionDetail.tsx` to `trpc.meta.faction({ faction })`
- [ ] Show: faction win rate, game count, top detachments
- [ ] Connect to `trpc.meta.detachments({ faction })`
- [ ] Show detachment breakdown: name, win rate, game count
- [ ] Connect to `trpc.meta.lists({ faction, limit? })`
- [ ] Render army lists using `ListCard` component (collapsible text display)
- [ ] Connect to `trpc.meta.timeline({ faction })`
- [ ] Build weekly win rate chart (simple line chart or table)
- [ ] Write component tests

**Exit criteria:** Clicking a faction shows its full breakdown: detachments, top lists, win rate over time.

---

## Phase 4: Wire PlayerRanking Page

- [ ] Connect `PlayerRanking.tsx` to `trpc.player.leaderboard()`
- [ ] Build `GlickoBar` component: displays `rating ± 2×RD` — wide bar = uncertain player
- [ ] Show ranked leaderboard: position, name, rating ± uncertainty, games played
- [ ] Wire player search to `trpc.player.search({ name })`
- [ ] Wire player profile link to `trpc.player.profile({ playerId })`
- [ ] Build player profile view: rating history, recent results
- [ ] Write component tests

**Exit criteria:** Leaderboard shows all ranked players with Glicko-2 ratings and uncertainty bands. Player profiles load correctly.

---

## Phase 5: Wire SourceData + TournamentDetail Pages

- [ ] Connect `SourceData.tsx` to `trpc.source.tournaments()`
- [ ] Show tournament list: name, date, player count, format, meta window
- [ ] Link each tournament to `TournamentDetail.tsx`
- [ ] Connect `TournamentDetail.tsx` to `trpc.source.tournament({ importId })`
- [ ] Show all players + submitted lists for the event
- [ ] Wire download buttons to `trpc.source.download({ importId, format })`
  - JSON download: full parsed `TournamentRecord[]`
  - CSV download: flattened records
- [ ] Write component tests

**Exit criteria:** Every imported tournament is browsable. Every record is downloadable. Radical transparency — nothing is hidden.

---

## Phase 6: Wire Admin Page

- [ ] Connect `Admin.tsx` to `trpc.admin.import(...)` — protected, auth required
- [ ] Build CSV import form:
  - CSV file input (paste or upload)
  - Format selector: BCP | Tabletop Admiral | Generic
  - Event name, event date, meta window label, min rounds, min players
  - Submit → shows import summary: imported, skipped, errors, players updated
- [ ] Wire "Recompute Glicko" button to `trpc.admin.recomputeGlicko()`
- [ ] Wire player linking form to `trpc.admin.linkPlayer({ glickoId, userId })`
- [ ] Ensure Admin page is only visible and accessible to authenticated users

**Exit criteria:** Admin can import a CSV, see import results, trigger Glicko recomputation, and link anonymous player records to accounts.

---

## Phase 7: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server (port 3006)
- [ ] Configure Cloudflare Pages for the React client
- [ ] Set environment variables (Turso connection, auth secrets)
- [ ] Run full end-to-end test on deployed environment with a real CSV import

**Exit criteria:** new-meta is live. An admin can import a tournament CSV and see results in the dashboard within seconds.

---

## Open After Launch

- Pairing-level Glicko-2 (requires per-game opponent data — currently approximated)
- Exact matchup matrix (requires pairings table — currently approximated with top/bottom half)
- Faction alias normalization (e.g. "Space Marines" vs "Adeptus Astartes" → same entry)
- Integration with tournament app: completed events auto-export to new-meta import queue
