# new-meta — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Meta-analytics app: public win-rate, matchup, and Glicko-2 player-rating
stats aggregated from tournament results (`CLAUDE.md:7-11`).

## Architecture

- Server: Hono + tRPC, port 3006 (`index.ts:13-17`; Worker
  `worker.ts:14-27`). `adminProcedure` = email allowlist (`trpc.ts:10-26`).
  Routers: `meta`, `player`, `source`, `admin` (`routers/index.ts:7-13`).
- Libs: `lib/glicko2.ts` (in-app copy — relationship to server-core's
  `updateGlicko2` unverified, **possible second implementation**),
  `lib/aggregate.ts` (345 lines of pure aggregation — **appears unused by
  any live router**, which query the SQL cube directly),
  `lib/playerMatch.ts`, `lib/detachment.ts` (regex list parsing),
  `lib/frameFilters.ts` (dim-driven, explicitly built to honor Rule 6).
- Client: Vite/React hash router; Dashboard, FactionDetail, PlayerRanking,
  PlayerProfile, SourceData, TournamentDetail, Admin pages.

## Data model

All in shared schema. Owns `playerGlicko` (:672-688), `glickoHistory`
(:690-709), `importedTournamentResults` (:1028-1044, likely unused). Reads
the full meta set: `dim*` (:713-793), `metaEvents`/`metaEventPlayers`/
`metaPairings`/… (:797-921), derived cube `metaFor`/`metaTop`/
`factGameResults`/`metaCubeStatus` (:925-1024).

**Rule 1 — VIOLATED (mirror of the tournament finding):**
- `meta_events` has **three independent writers**: `csv-import` (new-meta
  admin.import), `native` (tournament's `exportToMeta`), `bcp`
  (bcp-scraper) — discriminated by a `source` column, three bespoke write
  paths, only tournament's having delete-then-reinsert dedup.
- **The cube tables new-meta reads are populated by a fourth app** —
  `apps/content-ingestor/src/meta/build-cube.ts` — a standalone script no
  app schedules or calls. new-meta cannot populate its own primary read
  tables.
- PLAN.md:74 lists tournament auto-export as *future* work; the code already
  does it — docs behind the (rule-violating) reality.

**Rule 6: honored well** — `frameFilters.ts` resolves dim ids at request
time; `meta.ts:18-29` cites Rule 6 by name. No JSON blobs in owned tables
(`importedTournamentResults.rawData/parsedData` are blobs but table unused).

## API surface

`meta.factions/faction/matchups/frames/availableFilters/windows` (public);
`player.leaderboard/profile/search`; `source.tournaments/tournament`
(**takes `eventId`, not the documented `importId`; no `download` procedure
exists**); `admin.import/recomputeGlicko/linkPlayer`. No crons/queues —
cube-build and scraping live in other apps.

## Deploy

Worker `tabletop-tools-new-meta` (secrets unset per PLAN.md:62). Client
Pages script but **no client wrangler.toml / functions proxy** despite
PLAN.md:60-61 checking them off.

**Rule 9 risk:** `admin.recomputeGlicko` (`admin.ts:113-129`) deletes all
Glicko rows then loops **every** metaEvents row through
`updateGlickoForEvent` (multiple sequential selects/inserts/updates per
player per event, :157-324) in one unbounded synchronous handler — the
exact pattern behind the data-import 1102 incident.

## Shared-package usage

auth, db (incl. `resolveFaction` — correct), game-content (CSV parsers —
correct), server-core (`updateGlicko2` — correct), ui (client plumbing).
Rule 3 flags: `lib/aggregate.ts` duplicates faction-winrate/matchup math the
`meta` router reimplements as raw SQL; possible second in-app Glicko impl.

## CLAUDE.md drift

1. `source.tournament({importId})` documented; code takes `eventId`
   (`source.ts:44-46`).
2. `source.download({importId, format})` documented (**and PLAN.md claims
   "Download buttons wired for JSON + CSV"**); no download code exists
   anywhere.
3. `admin.import` return shape documented with real importId/errors; code
   always returns hardcoded `importId: 'batch'` and `errors: []`
   (`admin.ts:103-109`) — malformed rows fail silently.
4. Client deploy artifacts claimed done, absent.
5. `packages/db/CLAUDE.md` undercounts the meta footprint by ~15+ tables.

## Health signals

- Tests present and substantial (6 server files incl. HTTP integration; 12
  client files; CLAUDE.md claims 122). No TODO/FIXME.
- `meta.ts:44-47` throws plain `Error` not `TRPCError` — inconsistent error
  mapping.
- `updateGlickoForEvent(db: any, …)` — untyped in the most complex function.
- Likely dead: `lib/aggregate.ts` (confirm via import graph, then wire into
  dry-run preview or delete).

## Candidate design decision points

1. **Unify tournament + meta data model (Rule 1)** — same decision as the
   tournament census, seen from the consumer side.
2. **Who owns cube-building** — orphaned script in content-ingestor today;
   move under new-meta's admin surface, or formalize as a scheduled job with
   health/status (partially started via `meta_cube_status`).
3. **Reconcile three `meta_events` writers** — one shared ingestion
   service/interface with common idempotency semantics.
4. **Fate of `lib/aggregate.ts`** — wire in or delete.
5. **Chunk `admin.recomputeGlicko`** (Rule 9) — cursor/batch by event range.
6. **Real vs approximated matchups** — `computeMatchups` is documented
   best-effort (top/bottom-half) for CSV imports; require pairing-level data
   for exact matrices, or keep the approximation labeled.
