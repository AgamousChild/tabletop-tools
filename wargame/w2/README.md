# Wargame 2: Technical Design & Implementation (non-LLM)

> **Purpose.** Apply the wargame method (decision analysis — see
> [`../00-methodology.md`](../00-methodology.md)) to the *technical design and
> implementation* of the site's apps: architecture, data model, API shape,
> deploy topology, failure modes, shared-package usage. **LLM/AI usage is out
> of scope** (owned by [wargame 1](../README.md)). **physics and study are out
> of scope** (Micah, 2026-07-06 — personal apps).
>
> Same discipline as W1: every claim anchored to code we read, not memory.
> Enumerate the real design alternatives, play them out against the platform
> rules (one data source per entity, DRY across apps, everything callable,
> data in datastores, bounded Workers, skinnable UI), score, recommend with a
> fallback.

## Scope roster (14 apps, verified against `apps/` 2026-07-06)

admin · auth-server · bcp-scraper · brain · content-ingestor · data-import ·
game-tracker · gateway · list-builder · new-meta · no-cheat · tournament ·
versus · widget-lab

Excluded: physics, study (personal apps, Micah 2026-07-06).

## Method deltas vs W1

- W1 scored model choices against hardware constraints; W2 scores **design
  choices against the platform rules and the Workers deploy model** (CPU
  budgets, isolate limits, Turso/libSQL, monorepo package boundaries).
- The census phase asks per app: what is the design *today* (grounded), where
  does it violate or strain a platform rule, what are the real alternatives,
  and what would a redesign cost vs buy?
- Census sweeps are delegated to Sonnet agents (read-only); synthesis,
  decision drafting, and scoring happen in the main loop.

## Plan of record

1. **Phase A — per-app design census** (`apps/*.md` here): grounded snapshot
   of each app's architecture, data model, API surface, deploy target,
   shared-package usage, drift between its CLAUDE.md and its code, and
   candidate design decision points. One file per app.
2. **Phase B — cross-cutting decision register** (`decisions/`): the design
   decisions that emerged from the census:

   | ID | Decision | Census evidence |
   |----|----------|-----------------|
   | D2-01 | **Tournament data-model unification** (Rule 1) — one canonical event model vs three writers + export pipeline; cube-build ownership | tournament, new-meta, bcp-scraper |
   | D2-02 | **Deploy topology & app-roster manifest** — single source of truth for the roster; verify-script coverage; cache-purge hardening; retire the per-app Pages story | gateway + the 5 apps with phantom deploy configs |
   | D2-03 | **Legacy-version retirement policy** — list v1/v2, match v1/v2, simulate v1/v2, three ingest generations: sunset criteria as policy | list-builder, game-tracker, versus, content-ingestor |
   | D2-04 | **Data-in-code cleanup** (Rule 6 cluster) — which hardcoded tables move to datastores; what counts as an acceptable parsing heuristic | admin, tournament, list-builder, bcp-scraper, data-import, brain, versus |
   | D2-05 | **Worker chunking patterns** (Rule 9 hotspots) — standard pattern (queue / cursor endpoints / CI offload) for the six identified hotspots | admin, new-meta, tournament, bcp-scraper, content-ingestor, brain |
   | D2-06 | **Silent-failure policy** — fail-loud standards: NullR2 photo loss, swallowed migrations, dropped STORE_MAP files, unpersisted scrape errors | game-tracker, no-cheat, list-builder, data-import, bcp-scraper, admin |
   | D2-07 | **Shared-utility consolidation** (Rule 3) — slugify ×3, dice math ×2, generateId per-router, 9 proxy handlers, AppShell nav slot | gateway, data-import, versus, game-tracker, admin |
   | D2-08 | **Documentation drift strategy** — generate, verify, or trim the state that docs duplicate from code (test counts, table counts, rosters) | every census found drift; widget-lab is the sole clean one |
   | D2-09 | **Dead-subsystem disposition** — wire-or-delete: bcp list parser (~800 lines), `lib/aggregate.ts`, `ingest.ts`, `detachment-map`, `update-data.yml` | bcp-scraper, new-meta, content-ingestor, data-import |
3. **Phase C — per-app design verdicts**: keep / refactor / redesign, each
   with scored alternatives and a fallback.
4. **Hardening**: re-verify claims, log corrections (`90-hardening-log.md`
   pattern from W1).

## Status board (loop-maintained)

- **2026-07-06** — W2 started (Micah). Roster verified against `apps/` (16
  found, 2 excluded → 14). Phase A census fan-out dispatched (Sonnet agents,
  read-only, one per app).
- **2026-07-06 (2)** — **Phase A COMPLETE: all 14 censuses landed**
  (`apps/*.md`). Headline cross-cutting findings for Phase B's register:
  (1) **Rule 1 violated at the platform's own named example** — three
  independent writers into `meta_events` (csv-import / tournament
  `exportToMeta` copy pipeline / bcp-scraper), three parallel "tournament"
  concepts, and the cube tables populated by a fourth app's orphaned script;
  (2) **stale-doc epidemic** — nearly every CLAUDE.md/PLAN.md has drift,
  `packages/db/CLAUDE.md` says 22 tables vs ~49 real, and 4+ apps claim
  `[x]` client deploy artifacts that don't exist (explained by the gateway:
  all clients actually ship through ONE Pages project — the per-app Pages
  story is a retired architecture nobody deleted); (3) **v2-ships-v1-never-
  retires pattern** — list v1/v2, match v1/v2, simulate v1/v2, three ingest
  generations all live simultaneously; (4) **Rule 3/6 violation clusters**
  (9 copy-pasted gateway proxies, slugify ×3, dice math ×2, battle-size
  table ×3, hardcoded missions/tasks/role/name lists); (5) **Rule 9
  hotspots** (admin `runLlmEvaluator`, new-meta `recomputeGlicko`,
  tournament `exportToMeta`, bcp-scraper fan-out, content-ingestor sync
  handlers, brain `getAllNodes`); (6) **silent-failure family** (prod
  photos discarded by NullR2, migration errors swallowed, STORE_MAP drops
  files, scraper errors not persisted); (7) **dead subsystems** (~800-line
  bcp list parser with no data feed, `lib/aggregate.ts`, `ingest.ts`).
  Next: Phase B — draft the cross-cutting decision register from these.
- **2026-07-06 (3)** — **Phase B COMPLETE: all 9 decisions drafted**
  (`decisions/D2-01`–`D2-09`, 2,288 lines; Sonnet drafters, each re-verified
  census claims against live code before writing). Drafting corrected the
  census in four places: game-tracker's v1/v2 situation is **inverted**
  (`matchV2` has zero production client callers — v1 is the only working
  feature; deferred, not retired); admin's stats router reads list-builder's
  v1 `lists`/`listUnits` directly (cross-app dep to patch before retirement);
  game-tracker hand-rolls **four** ID generators, not two; and BCP list text
  has **no REST fetch path** (the only precedent is Playwright browser
  automation, which Workers can't run) — so the ~800-line parser subsystem is
  *parked with an unpark condition*, not wired. Headline recommendations:
  D2-01 shared `upsertMetaEvent()` now + orphaned cube-script deletion, full
  table unification deferred behind named gates; D2-02 roster manifest +
  proxy factory + hard-fail cache purge; D2-03 standing sunset policy +
  immediate retirement of list-builder v1 / versus v1 / `ingest_jobs`;
  D2-05 four pattern classes (cursor endpoints for admin mutations, GH
  Actions offload for scheduled pipelines — Queues/DOs deferred with flip
  triggers); D2-06 two-track fail-loud rollout (live data-loss bugs first).
  Next: Phase C per-app verdicts, or start executing decisions — Micah's
  call.
