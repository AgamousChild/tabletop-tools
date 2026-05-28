# Content / Silo Bridge — Design Spec

> Status: **Decisions locked.** This is the unified-data-source design — the seam every app redesign hangs off. (one `content_entity` registry · reuse brain node/record granularity · `content_node_link` crosswalk)
> Grounded in the real stores: `packages/game-data-store/src/store.ts`, `apps/data-import/server/src/lib/id-mapping.ts`, `apps/brain/server/src/lib/model.ts`, and `dim_*` in `packages/db/src/schema.ts`.

---

## 0. The silo today (verified, not assumed)

The same game content is produced **twice, by two pipelines, into two stores with different shapes**:

| | store | shape | keyed by | built by |
|---|---|---|---|---|
| **Browser** | `game-data-store` (IndexedDB) | **normalized tables** — datasheets, datasheet_wargear (weapons), datasheet_models, abilities, detachments, stratagems, enhancements, unit_costs, wargear_options, junctions | **BSData ids** | `data-import` (Wahapedia CSV + BSData XML → JSON → R2 → IndexedDB) |
| **Brain** | R2 `BRAIN_BUCKET` | **~25k `Node` docs** (one schema: category `datasheet`/`weapon`/…, `stats`, `weaponStats`, `refs[]`, `sources[]`, `factionId`/`datasheetId`) | brain node ids + `datasheetId` fields | `brain/build-graph` (Wahapedia JSON + GW markdown + community) |
| **Relational** | Turso | user data only; content referenced as **opaque strings** (`attacker_content_id`, `unit_content_id`) — no FK | — | the apps |

Two things already point the right way:
- **`id-mapping.ts` already makes BSData the canonical datasheet id** — it maps Wahapedia → BSData by normalized name and re-keys *every* content file (datasheets, wargear, costs, abilities, leader_attachments, …) to BSData ids, plus faction codes → full names.
- **`dim_faction` / `dim_subfaction` / `dim_detachment`** is a real canonical registry — but only meta uses it.

**The problem:** no single canonical content store, no guaranteed shared key across all four surfaces, and two pipelines that can drift. That's the silo.

---

## 1. The bridge — one canonical content id

Every content entity gets **one stable id, used in all four places** (R2 doc key, relational FK, browser store key, brain `datasheetId`/etc.). Build on the scheme that already exists:

| entity | canonical id | status |
|---|---|---|
| datasheet (unit) | BSData unit id (hex GUID) | ✅ already canonical (id-mapping) |
| weapon | `weapon:{datasheetId}:{slug}` | ✅ already the scheme (datasheet-scoped) |
| faction / subfaction / detachment | the `dim_*` ids | ✅ exists — adopt platform-wide (not just meta) |
| ability / stratagem / enhancement / mission | their stable source ids, re-keyed like datasheets | extend id-mapping to cover them |

One id space. No app ever invents its own content id again (kills the `*_content_id` opaque strings).

---

## 2. Canonical store = R2 content documents

**R2 is the source of truth for content**, as per-entity addressable JSON documents keyed by canonical id (`content/datasheet/{id}.json`, `content/weapon/{id}.json`, …). This is also the **public-presentation surface** (each entity is addressable/renderable on its own). The browser store and the brain nodes are both *derived from* these documents.

Why R2 and not relational: content is read-mostly, document-shaped, edge-served, and already lives in R2 for the brain. Relational is for **user data + references**, not for holding GW-derived content (and the Data Boundary keeps GW content out of committed source/schema anyway — these docs load at runtime).

---

## 3. The four surfaces, one key

- **R2 (canonical):** the content documents (§2). Source of truth + public surface.
- **Relational (Turso):** user data + a **thin content index** — one row per content entity (`id`, `type`, `name`, `faction_id`, key refs) so app tables get a **real FK target** and content is queryable/joinable. Not the full content — just the index/registry. Extends the `dim_*` idea to all content types. (See §5.)
- **Browser (`game-data-store`):** a **projection** of the canonical content, downloaded on import — what it already is, just sourced from the one canonical pipeline instead of its own.
- **Brain (R2 nodes):** the knowledge layer (rules, refs, community, errata) **referencing the same canonical ids** (`Node.datasheetId` = the canonical datasheet id), so a brain card and an app's unit are the same entity.

The canonical id is the join across all four.

---

## 4. One pipeline (collapse the two ETLs)

Today `data-import` and `brain/build-graph` independently turn sources into content. Merge the **content-production** step: one ETL maps Wahapedia + BSData → canonical content docs (R2) + the relational content index, keyed by canonical ids. Then:
- `game-data-store` import pulls the canonical docs (projection).
- `brain/build-graph` consumes the canonical content docs for its content nodes and only *adds* the knowledge layer (rules/refs/community) on top — it stops re-deriving datasheets/weapons with its own ids.

Two pipelines → one content pipeline + a brain knowledge layer. (This is the `pipeline_run`/`pipeline_source` model from the admin spec, now spanning content too.)

---

## 5. Relational content index (the executable piece)

The part that becomes real schema — the FK target app tables reference:

```
content_entity            -- thin canonical index (NOT the full content; that's in R2)
  id PK                   -- canonical content id
  type                    -- 'datasheet' | 'weapon' | 'faction' | 'subfaction' | 'detachment' | 'ability' | 'stratagem' | 'enhancement' | 'mission'
  name                    -- human-readable
  faction_id FK?          -> content_entity (a faction is itself a content_entity)
  parent_id FK?           -> content_entity (weapon → datasheet; detachment → faction)
  dataslate_id FK?        -- which dataslate this version is under (for cost/version context)
  r2_key                  -- where the full document lives (content/{type}/{id}.json)
  updated_at
```
- App tables (`list_unit.datasheet_id`, `simulation.*_unit_id` via list_unit, `tournament_player.faction_id`, `game_state`, etc.) FK into `content_entity` — real integrity, real joins, instead of opaque strings.
- `dim_faction/subfaction/detachment` fold into `content_entity` (type='faction'/…); meta reads it as a projection (§8.1).

### 5.1 Brain crosswalk — `content_node_link` (NOT a re-key)

Brain keeps every node id as-is — mutating them in place would break refs (`sourceId`/`targetId`), the Vectorize index (keyed on node id), the cross-ref indexes, and the manifest. A thin, additive crosswalk bridges to the canonical id instead:

```
content_node_link
  brain_node_id PK         -- the brain Node id, UNCHANGED (graph integrity preserved)
  canonical_id FK -> content_entity
  match_method             -- 'datasheet_id' | 'name_faction' | 'manual'
  confidence               -- low-confidence rows flagged for review
```
- Covers brain's **content** nodes only (datasheet / weapon / ability / stratagem / …); rules / community / errata nodes have no canonical entity and get no link.
- **Built by matching** (the proven `id-mapping` / BCP-backfill approach): prefer the node's existing `datasheetId`/`factionId`, else normalized name + faction; validate the match rate; park unmatched for review.
- **Resolve at read time:** an app holds a `canonical_id` → `content_node_link` → the brain node → fetch (and the reverse).
- **Idempotent + reversible:** re-run on each brain build; drop the table and nothing is lost. **Zero blast radius on the graph.**

---

## 6. How the app redesigns plug in

Every deferred "content reference" in the locked specs resolves to **a FK into `content_entity`** (or a documented R2 ref where only the document is needed):
- **Versus / List**: `datasheet` / `weapon` / `ranged_profile` / `melee_profile` → the full profiles live in the R2 doc; `list_unit.datasheet_id` + loadout `weapon_id` FK into `content_entity`.
- **Game Tracker / Tournament**: `faction_id` / `detachment_id` / `primary_objective` (mission) → `content_entity`.
- This is what was deferred as "the content model" in all four specs — now defined.

---

## 7. Build order

1. **Canonical id scheme** — extend `id-mapping` to cover ability/stratagem/enhancement/mission (datasheet/weapon/faction already done). Document it.
2. **`content_entity` index** — add to `schema.ts` (real, like the pipeline tables), populated by the unified pipeline.
3. **Unify the content ETL** — one pipeline → R2 canonical docs + `content_entity`; build the `content_node_link` crosswalk (§5.1); `game-data-store` and `brain/build-graph` consume it.
4. **Repoint apps** — app redesign tables FK `content_entity` instead of opaque strings; *then* apply the app redesigns (Versus/List/Game-Tracker/Tournament) on top of a real content seam.

---

## 8. Decisions (resolved)

1. **One registry — `content_entity`.** Faction/subfaction/detachment fold in (type='faction'/…); `dim_*` becomes a projection meta reads. *Why:* the content pipeline already lists every faction/detachment, so a pipeline-fed `content_entity` updates automatically on each import — whereas `dim_*` today is a **hand-run seed script with hardcoded faction/dataslate maps in `.ts`** (a rule #6 violation) sitting *separately* from the `game-data-store` the apps use. One registry = one update path, no drift between meta and apps, satisfies rule #6.
2. **R2 granularity — already set; reuse brain's.** Brain R2 already stores per-entity `Node` docs aggregated into "records" (parent + children) at read time. The canonical content docs adopt that exact pattern — no new granularity invented.
3. **Brain — crosswalk, NOT re-key.** Brain node ids never change (re-keying would break refs / Vectorize keys / cross-ref indexes / manifest). The additive `content_node_link` table (§5.1) bridges canonical id ↔ brain node id, built by matching, idempotent and reversible.
