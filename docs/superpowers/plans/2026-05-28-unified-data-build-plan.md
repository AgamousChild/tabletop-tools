# Build Plan — Unified Data Source + App Redesigns

> The single ordered plan for turning the locked design specs into real schema + working apps.
> Work it top-down. Each step names its spec, its concrete deliverable, and its **gate** (how we know it's done).
> Principle throughout: **real in `schema.ts`** (types, NOT-NULL, indexes, unique, FK cascade) — never prose; verify in Drizzle Studio. **Validate against real data** (match rates / counts) before trusting, the way the BCP backfill did (154/154). No GW content committed.

---

## Already done (this session)

- ✅ **Phase 0 — migration history reconciled** (commit `4e9b847`). Squashed migrations 0000–0011 → single `0000_baseline`; `schema.ts` ↔ live DB reconciled; `__drizzle_migrations` stamped; `drizzle-kit generate` reports no changes. DB backed up first. See Phase 0 section.
- ✅ **Phase 1.2 + 1.3 — content seam** (commit `6f0401d`). `content_entity` + `content_node_link` in `schema.ts`, applied to prod via `0001_content_foundation` (first end-to-end use of the reconciled workflow), 66 db tests pass. **Next: Phase 1.1 then 1.4.**
- ✅ **Admin pipeline tables** — `pipeline_source` / `pipeline_item` / `pipeline_run` / `pipeline_run_item` in `schema.ts` + live DB, 6 sources seeded. *(spec: 2026-05-28-admin-pipeline-observability)*
- ✅ **BCP data work** — scraper now captures `user.id`; `source_player_id` backfilled to 96%; Glicko-2 computed + persisted (`gl2_*` across 30k players / 75k pairings); official BCP placings stored.
- ✅ **Locked specs** — versus, list, game-tracker, tournament-bcp, ratings-derived, admin-pipeline, content-silo-bridge.
- ✅ **Tooling** — Drizzle Studio is the live schema viewer (`npx drizzle-kit studio`); the hand-rolled HTML viewer is retired.

---

## The dependency spine

```
Phase 0  migration-history reconciliation (debt — unblocks clean migrations)
   ↓
Phase 1  CONTENT FOUNDATION  (content_entity + content_node_link + canonical ids + unified ETL)
   ↓
Phase 2  LIST  (list_unit — the shared configured unit everything else consumes)
   ↓
Phase 3  VERSUS · GAME TRACKER · TOURNAMENT  (all FK content_entity + list_unit)
   ↓
Phase 4  ADMIN rewire + drop the old scatter
```

Nothing in Phase 2+ is real until Phase 1 exists — every app FKs the content seam.

---

## Phase 0 — Migration-history reconciliation (debt) — ✅ DONE (`4e9b847`)

**Was:** `drizzle-kit generate` wanted to recreate ~half the schema (snapshot/journal frozen at 0008; `__drizzle_migrations` recorded only 0000–0004; orphaned 0009–0011 SQL); tables had gone in via direct DDL.

**What was done:**
1. **Backed up** the live DB (full logical dump, `.local/db-backup-*`) and the migrations folder.
2. **Reconciled `schema.ts` ↔ live DB** (verified table + column + index level via an in-memory apply of the baseline): created `dim_faction_alias` (+82 valid alias seed), recreated `ingest_sources`/`ingest_content` empty, re-added `imported_tournament_results` to `schema.ts` (kept — 21 real rows), dropped empty `player_elo`/`elo_history`, added `rounds.start_time` + intended unique indexes.
3. **Squashed** migrations 0000–0011 → a single `0000_baseline`; **stamped** `__drizzle_migrations` with the baseline's exact `sha256`+`when` (per the migrator source — migrate compares only max `created_at`).

- **Gate MET:** `drizzle-kit generate` → "No schema changes, nothing to migrate". 60 db tests pass, tsc clean.
- **Accepted residue (deliberate):** 19 hand-DDL'd meta/dim/fact tables have a nullable PK (`id TEXT PRIMARY KEY` w/o explicit `NOT NULL`) vs the baseline's `NOT NULL`. Cosmetic — `generate` never flags it (compares schema↔snapshot), future migrations apply fine, a fresh rebuild is just safely stricter. Rebuilding 30k/75k-row tables for a no-op `NOT NULL` is not worth it.
- **Workflow going forward:** edit `schema.ts` → `drizzle-kit generate` → migrate. `schema.ts` is the source of truth.
- **Phase 1 finding surfaced:** `dim_faction` is missing 5 standalone factions (`blood-angels`, `black-templars`, `dark-angels`, `deathwatch`, `space-wolves`) — the hand-seeded `dim_*` rule-#6 violation; `content_entity` fixes it.

---

## Phase 1 — Content foundation  *(spec: 2026-05-28-content-silo-bridge)*

The seam every app FKs into.

- **1.1 Canonical id scheme** — ✅ DONE. `id-mapping.ts` `canonicalIdFiles` now covers ability / stratagem / enhancement / detachment_ability / mission. `canonicalContentId('mission', sourceId)` returns `'mission:{id}'`. 28 id-mapping tests pass (vitest), including the mission-stamping case. Mission Wahapedia source currently flows empty (the 11th-leak path writes content_entity rows directly via `scripts/11th-ingest/ingest-game-tracker.mjs`) — the scheme is ready when a Wahapedia mission source lights up.
- **1.2 `content_entity` registry → `schema.ts`** — ✅ DONE (`6f0401d`). Self-ref faction/parent FKs, `dim_dataslate` FK, type enum, `r2_key`. Applied via `0001_content_foundation`.
- **1.3 `content_node_link` crosswalk → `schema.ts`** — ✅ DONE (`6f0401d`). Brain bridge, additive, cascade. 6 focused tests.
- **1.4 Unify the content ETL** — ⏳ **the big one, to scope.** One pipeline → R2 canonical docs + `content_entity`; build `content_node_link` by matching against ~25k brain nodes. `game-data-store` + `brain/build-graph` consume it. Touches **two live pipelines** + real Wahapedia/BSData data. **Gate:** `content_entity` populated from a real import; crosswalk match-rate counted (matched/unmatched, BCP-style); brain graph untouched.

> **Resume point:** Phase 1.4 has already landed (✅). Phase 1.1 ✅ as well. All of Phase 1 complete. Next: Phase 4 (admin rewire + drop the legacy scatter), or pick up open Phase 3 polish (list-builder Task 5 e2e). Migration workflow: edit `schema.ts` → `drizzle-kit generate` → `migrate` (env `TURSO_DB_URL`/`TURSO_AUTH_TOKEN` from root `.env`).

---

## Phase 2 — List  *(spec: 2026-05-26-list-data-model-design)* — ✅ DONE (server + client)

`list_unit` is the shared **configured unit** consumed by Versus / Game Tracker / Tournament — so it moves from IndexedDB to **relational** (it must be FK-able).

- **Tables → `schema.ts`:** `list`, `list_unit` (self-ref Leader/Support attachment), `list_unit_loadout`, `list_unit_loadout_weapon`. Cost layer (`unit_cost`, `wargear_option`) is content — lives in `content_entity` / R2, dataslate-versioned.
- `list_unit.datasheet_id` + loadout `weapon_id` **FK `content_entity`**.
- **Gate MET (server):** 16 new unit tests (points-derivation + attachment engine), no-scratch-row invariant enforced at DB + router level, attachment slot constraint (≤1 leader + ≤1 support) enforced in `updateUnit`, 15 router tests, 10 schema tests. Migration `0006_list_data_model.sql` applied to prod. `listV2` tRPC router: create/update/get/getAll/delete/addUnit/updateUnit/removeUnit/setLoadout/computePoints.
- **Gate MET (client):** list-builder client wired to `listV2` router — server is source of truth. `useListsV2.ts` hooks + imperative helpers, `migrateIndexedDbLists.ts` one-time IndexedDB→server migration, `sync.ts` deprecated. `ListBuilderScreen` / `MyListsScreen` / `UnitSelectionScreen` all use V2. 76 client tests + Playwright UI e2e. IndexedDB `lists`/`list_units` stores kept read-only for migration only. **can_lead content validation active** (1811 rows in prod from Wahapedia leader_attachments, enforced in `updateUnit`).

---

## Phase 3 — Versus · Game Tracker · Tournament

Each: spec → `schema.ts` → app. All consume `list_unit` + `content_entity`.

- **Versus** *(2026-05-26-versus-data-model-design)* — `simulation` / `simulation_weapon` / `simulation_modifier`; attacker/defender = `list_unit`. **Gate:** attack-count invariant (`total = models × weapons/model × A`) test-enforced.
- ✅ **Game Tracker** *(2026-05-26-game-tracker-data-design)* — `match_v2` / `match_player` / `battle_round` / `round_player` / `score_event` / `game_state_event` / `match_secondary_v2` / `unit_casualty` / `unit_state` / `stratagem_use`; `scoring_mission` + `mission_game_state` catalog tables (migration `0011`). `mission` + `matchV2` tRPC routers. Mission UI fully data-driven (`useMissionCatalog`): 5 ui_pattern scorer components (`count` / `checklist` / `tier` / `action` / `zoned_count`), dispatched by `MissionScorer` registry map. **Gate MET:** 70 server tests passing (3 pre-existing `startFromPairing` failures not caused by Phase 3), 178 client tests passing, tsc clean. All mission selectors removed of hardcoded arrays.
- **Tournament + BCP** *(2026-05-27-tournament-bcp-data-design)* — `scorecard` / `ranking_metric` / `tournament_*_metric` / `passthrough_event` / `bcp_registration`; `tournament_player` faction/detachment → `content_entity` FK (kills free strings). **Gate:** native → meta derive idempotent; standings computed from the metric stack; BCP list-drop both paths (server + agent) with explicit consent.

---

## Phase 4 — Admin rewire + drop the scatter  *(spec: 2026-05-28-admin-pipeline-observability)*

- Pipelines (content discovery/process, bcp-scrape, cube, brain build) open a `pipeline_run`, update `pipeline_item`s, close with a summary.
- Admin UI reads `pipeline_source` / `pipeline_item` / `pipeline_run` — Runs feed · Queue (to-be-parsed) · Sources.
- **Drop** `ingest_jobs` / `ingest_content` / `bcp_scrape_jobs` / `meta_cube_status`.
- **Gate:** admin shows real runs/queue/sources with human titles + dates + source; old tables gone.

---

## Working agreement

- One step at a time, top-down; don't start Phase N+1 until N's gate passes.
- Each schema change is **real in `schema.ts`** and visible in Drizzle Studio — not a markdown sketch.
- Ratings stay **derived from meta** (no standalone tables) — `2026-05-27-ratings-derived-from-meta`.
- "What's next?" = the next unchecked step here.
