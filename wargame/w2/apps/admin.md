# admin — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Platform admin dashboard: authenticated, email-whitelisted control panel for
platform-wide stats (users, sessions, per-app activity) and content-pipeline
operations (BCP scraper, content ingestor, brain crosswalk validation).

## Architecture

- Client: React 18 + tRPC + TanStack Query. Entry `client/src/main.tsx:23`;
  `App.tsx:41-127` is a hand-rolled auth gate + `useState<Page>` tab nav (no
  router) over **10 pages**: Dashboard, Users, Sessions, Activity, Imports,
  Pipeline, Scraper, Ingest, Tasks, Crosswalk.
- Server: Hono + tRPC, port 3007. Dev `server/src/index.ts:1-22`; Worker
  `server/src/worker.ts:18-38`; `server.ts:7-21` wraps `createBaseServer`
  injecting `adminEmails`, optional `bcpScraper`/`contentIngestor` service
  bindings, optional `ai` binding.
- `trpc.ts:32-40` — `adminProcedure`: `ctx.user` + email whitelist, else
  `UNAUTHORIZED`/`FORBIDDEN`.
- Routers: `health` (public), `stats`, `crosswalk` (`routers/index.ts:5-9`).

## Data model

- Owns no schema. Reads across nearly every domain table: auth, no-cheat,
  versus, list-builder, game-tracker, tournament, new-meta, content/crosswalk,
  ingest, scraper (`routers/stats.ts:1-19`, `schemas/ingest.ts`).
- **Raw-SQL bypass:** `stats.pipeline` (`stats.ts:294-364`) fires ~10 raw
  `sql` queries against tables with no Drizzle import (`meta_events`,
  `fact_game_results`, `meta_top`, `dim_faction`, …) — no compile-time
  safety. `listParserStatus` (`stats.ts:411-430`) uses `json_extract` on a
  JSON column directly.
- **Rule 6 violation:** `client/src/pages/TasksPage.tsx:1-191` hardcodes a
  28-item project task list (status/category/priority) in source — no
  datastore backing; can't update without a deploy.

## API surface

- tRPC only; no crons/queues (triggers other Workers via service bindings).
- `stats`: overview, recentUsers, activeSessions, appActivity, recentEvents,
  topFactions, matchResults, revokeSession, revokeAllSessions, deleteUser,
  pipeline, bcpScraperStatus/History, triggerBcpScrape, triggerMetaPipeline
  (**permanent stub** returning `not-configured`, `stats.ts:407-409`),
  listParserStatus, ingest source/job management, trigger* endpoints,
  bsdataVersion (public, calls GitHub API from the Worker, `stats.ts:566-586`).
- `crosswalk`: listPending, candidate.byId/approve/reject/override/
  approveBulk/rejectBulk, runLlmEvaluator, stats.

## Deploy

- Worker `tabletop-tools-admin` (`wrangler.toml:1-21`): `[ai]`, service
  bindings `BCP_SCRAPER`, `CONTENT_INGESTOR`. Secrets: TURSO_*, ADMIN_EMAILS,
  AUTH_SECRET. No `[limits]` — default CPU budget.
- **Rule 9 risk:** `runLlmEvaluator` (`crosswalk.ts:439-610`) loops up to
  `batchSize` (max 200, default 50) candidates sequentially — 2-3 selects +
  1 Workers AI call + transactional write each — in ONE mutation, no
  chunking/cursor/resume. 200 sequential AI round-trips can hit the ceiling.

## Shared-package usage

- `server-core`, `db`, `ui` (client), `auth` (test helpers).
- **Rule 2/3:** `packages/ui` exports `AppShell` (header/Home/sign-out,
  `AppShell.tsx:9-40`); admin reimplements equivalent chrome inline
  (`App.tsx:64-111`) because AppShell lacks a nav slot — candidate to extend
  AppShell rather than fork it.
- `ZodForm` (`client/src/lib/form/ZodForm.tsx`) is admin-local; promotion
  candidate only if other apps grow similar forms.

## CLAUDE.md drift

- **Accurate:** "80 passing, 16 failing in crosswalk" verified by running
  tests — exactly 80/16. Root cause: `crosswalk.test.ts:59` hand-writes a
  `CREATE TABLE content_entity` fixture predating migration 0012
  (`can_deploy_solo`); every typed insert fails against the stale fixture.
- **Drift:** File-structure section lists 5 pages + 1 router; reality is 10
  pages + 2 routers + `lib/llm-evaluator.ts` + `schemas/ingest.ts`.
- **Drift:** Router docs omit the entire `crosswalk` router (9 procedures)
  and ~17 `stats` procedures that exist in code.
- **Unremarked:** Workers AI binding + crosswalk feature never mentioned in
  CLAUDE.md despite being built, tested, deployed.

## Health signals

- Server 96 tests (80/16, root-caused above); client 74 all passing. No
  TODO/FIXME anywhere.
- Dead/stub: `triggerMetaPipeline` no-ops behind a live "Rebuild Cube" button
  (`ScraperPage.tsx:112-123`) with no UI indication.
- `stats.ts:29-32` `count()` helper typed `(db: any, table: any)`.
- `pipeline` swallows all query failures via `.catch(() => [{n: 0}])` — a
  missing table reports as "0", masking schema drift.
- Bulk crosswalk ops collect per-item errors but the client barely renders
  them.

## Candidate design decision points

1. **TasksPage data source** — real `tasks` table + router vs generated
   asset vs accept-as-scratchpad. (Rule 6.)
2. **Raw-SQL analytics queries vs Drizzle schema** — add the meta/cube tables
   to the shared schema for type safety, or document the escape hatch.
3. **LLM evaluator batch model** — chunk per Rule 9 (queue/cron + polling)
   vs lower default cap.
4. **AppShell nav slot** — extend shared shell vs per-app header forks.
5. **Service-binding triggers vs importable functions (Rule 4)** — Worker-to-
   Worker RPC vs importing scraper/ingestor core logic directly.
6. **Test-fixture generation** — derive fixtures from real migrations so
   schema changes can't silently break admin's tests again.
