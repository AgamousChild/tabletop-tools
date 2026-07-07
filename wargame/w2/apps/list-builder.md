# list-builder — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Army list builder where units carry live performance ratings (S/A/B/C/D)
derived from tournament data, surfacing higher-rated same-cost alternatives as
the list is built (`apps/list-builder/CLAUDE.md:9-11`).

## Architecture

Two-tier: React client (Vite) + tRPC/Hono server on the shared Turso DB.

- Server dev entry: `server/src/index.ts:13-17` (`startDevServer`, port 3003);
  prod entry `server/src/worker.ts:13-22` (`createWorkerHandler`, libsql web
  client). Shared factory `server/src/server.ts:6-12` → `createBaseServer`.
  Auth handled entirely inside `packages/server-core/src/server.ts:17-32`
  (calls `validateSession` per request); the app never touches auth itself.
- Routers: `health`, `rating`, `list` (legacy), `listV2` (primary)
  (`server/src/routers/index.ts:7-12`).
- Client: `main.tsx:10-23` (tRPC + React Query, `renderApp` from ui);
  `App.tsx:6-29` gates on `authClient.useSession()`. Screen flow is a state
  machine (no router) in `ListBuilderScreen.tsx:32-42`. One-time
  IndexedDB→server migration on mount (`ListBuilderScreen.tsx:71-80`).
- **Monolith flag:** core builder UI is one ~1160-line file
  (`UnitSelectionScreen.tsx`) containing pickers, army view, export, and
  rating-suggestion logic.

## Data model

Schema central in `packages/db`: legacy `lists`/`listUnits` + `unitRatings`
(`schema.ts`), V2 relational model `list`/`listUnit`/`listUnitLoadout`/
`listUnitLoadoutWeapon` (`list-schema.ts:12-102`). No JSON-blob columns in
either; scalar fields with FKs into `content_entity`. `list_unit.list_id` NOT
NULL by design — no scratch rows (`CLAUDE.md:129-133`).

**Two parallel list-storage schemas coexist** (legacy denormalized vs V2
relational) — both live.

**Rule 6 violations (hardcoded lookup data in .ts):**
- `client/src/lib/armyRules.ts:8-13` — `BATTLE_SIZES` table.
- `client/src/lib/useListsV2.ts:271-276` — `BATTLE_SIZE_POINTS` duplicate.
- `client/src/components/ListBuilderScreen.tsx:56-63` — third restatement
  (`byName`), already inconsistent with the first (Strike Force 1000
  maxDuplicates handling).
- `UnitSelectionScreen.tsx:369-376` — `ROLE_FILTERS` role taxonomy hardcoded.

Correctly data-driven counterexamples: `content_can_lead` attachment
eligibility and `can_deploy_solo` (`list-v2.ts:365-368`).

## API surface

No crons/queues. Hono `/trpc/*`. `rating.get/alternatives`
(`routers/rating.ts:6-33`); legacy `list.sync/syncAll/getAll/delete`; `listV2`
full CRUD + `addUnit/updateUnit/removeUnit/setLoadout/computePoints/
eligibleBodyguards/canDeploySolo` (`list-v2.ts:32-422`), all
`protectedProcedure` with per-call ownership checks (`eq(list.userId,
ctx.user.id)`).

## Deploy

- Server: CF Worker (`server/wrangler.toml:1-4`, `nodejs_compat`, no
  `[limits]` override — default CPU budget).
- Client: `wrangler pages deploy dist` script but **no client wrangler.toml
  checked in**; `PLAN.md:79` claims `client/wrangler.toml` +
  `client/functions/trpc/[[path]].ts` exist ([x]-checked) — neither is on
  disk. Deploy config is implicit/CLI-driven.
- **Rule 9:** V2 mutations are per-unit (up to 4 sequential queries,
  `list-v2.ts:199-278`) — no acute risk. The one unbounded loop is legacy
  `list.syncAll` (`list.ts:88-145`): per-list insert+delete+insert over
  unbounded input — could approach the ceiling for a user with many legacy
  lists.

## Shared-package usage

- Server: `@tabletop-tools/db`, `@tabletop-tools/server-core` (+ `auth`
  transitively). Client: `@tabletop-tools/game-data-store` (IndexedDB
  catalog), `@tabletop-tools/ui`.
- **Rule 3 candidate:** battle-size table defined 3× in this app alone (see
  above) — belongs in one source, ideally DB-backed per Rule 6.
- `packages/db/CLAUDE.md` ownership map is stale: lists this app owning only
  `lists`/`listUnits`, doesn't mention the 4 V2 tables at all.

## CLAUDE.md drift

- **Test counts wrong:** CLAUDE.md claims "129 tests (53 server + 76 client)"
  (`CLAUDE.md:203`) and omits `AttachmentPicker.test.tsx`. Actual counts on
  disk: server ≈113 (`list-v2` 78, `list` 10, `rating` 7, `server` 4, `score`
  14), client ≈82 across 11 files.
- **PLAN.md deploy claims contradicted by filesystem** (see Deploy).
- Architecture claims otherwise consistent (V2-primary, migration flag key
  matches `migrateIndexedDbLists.ts:13`).

## Health signals

- No TODO/FIXME anywhere in app source. Tests substantial (~195).
- Legacy `list` router fully duplicates V2 logic, deprecated in docs but still
  mounted (`routers/index.ts:10`) — dead-code-in-waiting.
- **Silent migration failure:** `migrateIndexedDbLists.ts` swallows per-list/
  per-unit errors (bare `catch {}` at 77-79, 83-85, 87-89) and marks
  migration done even on partial failure (91-92); UI never surfaces
  `result.failed` (`ListBuilderScreen.tsx:75-79`) — failed users silently
  lose pre-V2 lists with no retry path.
- Export clipboard fallback uses `document.write` of unescaped list text into
  a popup (`UnitSelectionScreen.tsx:1078-1087`) — fragile.
- Coarse cache invalidation: `useUpdateUnitV2` invalidates all `listV2.get`
  queries (acknowledged workaround, `useListsV2.ts:126-128`).

## Candidate design decision points

1. **List storage model** — V2's 4-table fan-out (3 sequential selects per
   `get`, `list-v2.ts:108-124`) vs single joined query vs snapshot column.
   Latency/correctness tradeoff.
2. **Validation engine placement** — `validateArmy` (`armyRules.ts:29-68`)
   is client-only; server accepts over-cap/duplicate-violating lists. Move or
   duplicate server-side?
3. **Battle-size taxonomy as data** — Rule 6 fix: single-source the 3×
   hardcoded table into the DB/content registry.
4. **Sharing/collaboration model** — strict per-`userId` ownership, zero
   hooks for sharing; tournament/game-tracker reportedly read these tables —
   decide before the schema is load-bearing elsewhere.
5. **Rating-suggestion fetch pattern** — unfiltered `rating.alternatives({})`
   full-table fetch on every unit add (`UnitSelectionScreen.tsx:928-979`);
   fine now, won't scale.
6. **Legacy router retirement** — explicit sunset criteria for `list` v1 +
   its 2 tables instead of indefinite dual-mount.
