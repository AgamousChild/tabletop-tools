# tournament — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day. Tests were RUN (100 server + 58 client,
> all passing).

## Purpose

Tournament management: TOs create/run events (registration, check-in, Swiss
pairings, result reporting); players register and submit lists; public
standings/pairings view (`CLAUDE.md:7-14`).

## Architecture

- Server: Hono + tRPC on server-core, port 3005. Entries `worker.ts:13-22` /
  `index.ts:8-17` → `server.ts:7-13`. Routers (`routers/index.ts:12-23`):
  tournament, player, round, result, card, award, metric, passthrough,
  bcpRegistration. **No `elo` router.**
- Domain libs: Swiss pairing (`lib/swiss/pairings.ts`), legacy standings
  (`lib/standings/compute.ts`), metric-stack standings
  (`lib/standings/metric-compute.ts`), VP result derivation
  (`lib/result/derive.ts`).
- Client: React + tRPC, hash routing; TournamentScreen, ManageTournament,
  MetricStackStandings, FactionDetachmentPicker, PassthroughDirectory,
  BcpListDrop.

## Data model

All in shared `packages/db/src/schema.ts`: core `tournaments` (:372-401),
`tournamentPlayers` (:403-440), `rounds` (:442-460), `pairings` (:462-490);
V3 `tournamentCards`/`tournamentAwards`; Phase 3 metric-stack
`rankingMetric`/`tournamentPairingMetric`/`tournamentPlacingMetric`; BCP
`passthroughEvent`/`bcpRegistration`.

**Rule 1 — VIOLATED (the platform's own named example):**
- Native tournaments live in `tournaments`/... while BCP-scraped ones are
  written by bcp-scraper into `metaEvents`/`metaEventPlayers`/`metaPairings`
  (`source: 'bcp'`).
- On TO "complete," `advanceStatus` → `exportToMeta()`
  (`tournament.ts:200-202, 330-515`) **copies a snapshot** into the meta
  tables (`source: 'native'`) then runs Glicko-2 — exactly the
  "import/export pipeline between apps" root CLAUDE.md:33-35 forbids.
- Net: **three parallel tournament concepts** — operational, meta-analytics,
  BCP-directory (`passthroughEvent`) — with copy/export glue.

**Rule 6 — VIOLATED twice:** hardcoded `MISSIONS` array (6 names,
`round.ts:10-17`) despite `scoringMission`/`contentEntity` existing for
exactly this; `seedTestPlayers` hardcodes 16 fake players
(`player.ts:230-255`).

**JSON blob:** `tournaments.missionPool` (`schema.ts:393`).
**Phase 3 win:** `factionEntityId`/`detachmentEntityId` FK into
`content_entity` (`schema.ts:419-423`) — canonical-registry compliant.

## API surface

tournament.create/get/listOpen/search/listMine/advanceStatus/delete/standings;
player.register/updateList/checkIn/drop/list/lockLists/reinstate/
removePlayer/seedTestPlayers/myProfile/searchLists/searchPlayers/
listFactions/listDetachments; round.create/generatePairings/get/close;
result.report/confirm/dispute/override; card.*; award.*;
metric.listMetrics/upsertMetric/getStack/setStack; passthrough.*;
bcpRegistration.*. No crons/queues.

## Deploy

Worker `tabletop-tools-tournament` (`wrangler.toml:1-4`); client Pages via
script. **Rule 9 risk:** `exportToMeta` + `computeGlicko2ForEvent` run
per-player/per-pairing sequential writes (one UPDATE per player :431-436,
one INSERT each per player/pairing :441-511, then second Glicko pass with 2
more writes/player :521-665) in ONE synchronous mutation — unchunked,
non-resumable; fine at dozens of players, Rule 9-shaped at GT scale.

## Shared-package usage

db (+ `resolveFaction` — correctly centralized), server-core (incl.
`updateGlicko2` — Glicko lives once, shared with new-meta), ui, auth. No
cross-app logic duplication found beyond the Rule 6 items.

## CLAUDE.md drift

1. **ELO system documented but doesn't exist**: CLAUDE.md:120-125 describes
   `player_elo`/`elo_history` tables + `elo.*` router — zero matches in
   schema or routers. Platform actually uses Glicko-2 via new-meta.
2. `bcpRegistration.status` documented as submitted|failed|pending; schema
   enum is only `['submitted','failed']` (`schema.ts:610`).
3. **Metric-stack standings not wired to pairings**: `generatePairings`
   (`round.ts:118`) still calls legacy `computeStandings` — a TO's
   configured pairing metric stack never affects matchmaking.
4. `packages/db/CLAUDE.md` "22 tables" + elo ownership claims stale vs the
   real 40+-table schema.

## Health signals

- 100 server + 58 client tests, all passing (run during census). Swiss
  algorithm has 10 good tests (round 1, grouping, bye, rematch avoidance);
  no integration test of pairing×metric-stack (consistent — it's unwired).
- No TODO/FIXME anywhere.
- **Rule 7 borderline:** `seedTestPlayers` (`player.ts:217-279`) is a live
  protected mutation with no dev-gate — any TO can inject 16 fake players
  into a production bracket.
- `exportToMeta`/`computeGlicko2ForEvent` take `db: any`
  (`tournament.ts:331,521`) — untyped in the highest-blast-radius function.

## Candidate design decision points

1. **Unify the tournament data model (Rule 1)** — native events become
   rows in the meta tables directly (`source='native'`), `exportToMeta`
   deleted — vs keep copy-on-complete (two sources of truth forever).
2. **Wire pairings to the metric stack** — or explicitly declare stacks
   display-only (today's behavior misleads TOs).
3. **Missions as data** — move the hardcoded array into
   `scoringMission`/`content_entity` (schema-ready today).
4. **Chunk `exportToMeta`** per Rule 9 — orchestrated steps or queue.
5. **Gate or remove `seedTestPlayers`** from prod (Rule 7).
6. **ELO: implement or delete the docs** — decide whether per-tournament
   ratings should exist at all.
