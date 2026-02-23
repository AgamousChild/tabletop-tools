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

---

## Phase 2: Dashboard Page ✅ complete

`Dashboard.tsx` connected to `trpc.meta.factions()` and `trpc.meta.matchups()`.
`FactionTable`, `MatchupMatrix`, `MetaWindowSelector` components built and tested.
All filter by selected meta window.

---

## Phase 3: FactionDetail Page ✅ complete

`FactionDetail.tsx` connected to `meta.faction`, `meta.detachments`, `meta.lists`,
`meta.timeline`. `ListCard` component built.

---

## Phase 4: PlayerRanking Page ✅ complete

`PlayerRanking.tsx` connected to `player.leaderboard()` and `player.search()`.
`GlickoBar` component built — displays `rating ± 2×RD` uncertainty band.

---

## Phase 5: SourceData + TournamentDetail Pages ✅ complete

`SourceData.tsx` and `TournamentDetail.tsx` connected to `source.tournaments()`,
`source.tournament()`, and `source.download()`. Download buttons wired for JSON + CSV.

---

## Phase 6: Admin Page ✅ complete

`Admin.tsx` connected to `admin.import()`, `admin.recomputeGlicko()`, `admin.linkPlayer()`.
Protected — requires authenticated session.

**Total: 71 client tests + 51 server tests = 122 tests.**

---

## Phase 7: Deployment ✅ infrastructure ready

- [x] Configure Cloudflare Workers for the tRPC server — `server/wrangler.toml` + `server/src/worker.ts`
- [x] Configure Cloudflare Pages for the React client — `client/wrangler.toml` + `client/functions/trpc/[[path]].ts`
- [ ] Set environment variables — `wrangler secret put TURSO_DB_URL` + `wrangler secret put TURSO_AUTH_TOKEN`
- [ ] Run full end-to-end test on deployed environment with a real CSV import

**Exit criteria:** new-meta is live. An admin can import a tournament CSV and see results in the dashboard within seconds.

---

## Open After Launch

- Pairing-level Glicko-2 (requires per-game opponent data — currently approximated)
- Exact matchup matrix (requires pairings table — currently approximated with top/bottom half)
- Faction alias normalization (e.g. "Space Marines" vs "Adeptus Astartes" → same entry)
- Integration with tournament app: completed events auto-export to new-meta import queue
