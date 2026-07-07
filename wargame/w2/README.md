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
   decisions that emerge from the census (expected candidates: data-layer
   ownership boundaries, auth topology, deploy/chunking patterns, shared-UI
   adoption gaps, schema drift handling — but the census decides the list,
   not this README).
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
