# Database & Data Model Overview

> All schema and data models across the Tabletop Tools platform.

---

## Databases

| Database | Engine | Location | Tables/Stores | Source File | Doc |
|----------|--------|----------|---------------|-------------|-----|
| **Turso** | SQLite (libSQL) via Drizzle ORM | Server-side (Cloudflare Workers → Turso HTTP) | 49 tables | `packages/db/src/schema.ts` | [schema-turso.md](schema-turso.md) |
| **Game Data Store** | IndexedDB (browser) | Client-side | 22 stores | `packages/game-data-store/src/store.ts` | [schema-indexeddb-game-data.md](schema-indexeddb-game-data.md) |
| **Brain Knowledge Graph** | IndexedDB (browser) + R2 + Vectorize | Client cache + edge storage | 3 stores (client), R2 files + vector index (server) | `apps/brain/client/src/lib/store.ts`, `apps/brain/server/src/lib/model.ts` | [schema-indexeddb-brain.md](schema-indexeddb-brain.md) |

---

## Turso — Domain Breakdown (49 tables)

| Domain | Tables | Key Entity |
|--------|--------|------------|
| Auth (Better Auth) | 4 | `user` — central identity, all other tables FK to this |
| NoCheat (dice detection) | 5 | `dice_sets` → `sessions` → `rolls`, `training_examples`, `training_frames` |
| Versus (combat sim) | 1 | `simulations` — cached matchup results |
| List Builder | 3 | `lists` → `list_units`, `unit_ratings` |
| Game Tracker | 4 | `matches` → `turns` → `stratagem_log`, `match_secondaries` |
| Tournament | 6 | `tournaments` → `rounds` → `pairings`, `tournament_players`, `tournament_cards`, `tournament_awards` |
| ELO Ratings | 2 | `player_elo`, `elo_history` |
| Glicko-2 Ratings | 2 | `player_glicko`, `glicko_history` |
| Imported Results | 1 | `imported_tournament_results` |
| Meta Dimensions | 9 | `dim_faction`, `dim_subfaction`, `dim_detachment`, `dim_for_type`, `dim_granularity`, `dim_dataslate`, `dim_tournament_pack`, `dim_edition`, `dim_region` |
| Meta 3NF Sources | 5 | `meta_events` → `meta_event_players` → `meta_pairings`, `meta_event_win_distribution`, `meta_event_placements` |
| Meta Cube | 3 | `meta_for`, `meta_top`, `fact_game_results`, `meta_cube_status` |
| Admin | 1 | `user_bans` |
| BCP Scraper | 1 | `bcp_scrape_jobs` |
| Content Ingestor | 1 | `ingest_jobs` |

---

## Game Data Store — Domain Breakdown (22 stores)

| Domain | Stores | Source |
|--------|--------|--------|
| BSData units (legacy) | 2 | `units`, `meta` |
| Army lists (local) | 2 | `lists`, `list_units` |
| Game rules | 11 | `detachments`, `detachment_abilities`, `stratagems`, `enhancements`, `leader_attachments`, `unit_compositions`, `unit_costs`, `wargear_options`, `unit_keywords`, `unit_abilities`, `missions` |
| Wahapedia datasheets | 3 | `datasheets`, `datasheet_wargear`, `datasheet_models` |
| Global + junctions | 4 | `abilities`, `datasheet_stratagems`, `datasheet_enhancements`, `datasheet_detachment_abilities` |

---

## Brain — Storage Layers

| Layer | Technology | Content | Count |
|-------|-----------|---------|-------|
| Canonical store | R2 bucket (`tabletop-tools-brain`) | Node + ref JSON files, manifest | ~25,000 nodes |
| Search index | Vectorize (bge-base-en-v1.5, 768-dim) | Semantic embeddings | ~25,000 vectors |
| Client cache | IndexedDB (`tabletop-tools-brain`) | Cached nodes, refs, sync meta | 3 stores |

---

## Cross-Database Relationships

```
Turso (server)                    Game Data Store (client)              Brain (client + R2)
┌──────────────┐                  ┌─────────────────┐                  ┌──────────────┐
│ user         │                  │ units           │                  │ nodes        │
│ lists        │←─ sync ─────────→│ lists           │                  │ refs         │
│ list_units   │←─ sync ─────────→│ list_units      │                  │ meta         │
│ simulations  │──content_id────→ │ datasheets      │←─faction_id────→ │ (factionId)  │
│ matches      │                  │ datasheet_wargear│                  │ (datasheetId)│
│ meta_events  │                  │ datasheet_models │                  └──────────────┘
│ dim_faction  │                  │ stratagems      │
│ ...          │                  │ enhancements    │
└──────────────┘                  │ ...             │
                                  └─────────────────┘
```

**Key cross-references (not enforced FKs):**
- `simulations.attacker_content_id` / `defender_content_id` → game-data-store `units` or `datasheets` by ID
- `list_units.unit_content_id` → game-data-store `units` or `datasheets` by ID
- `matches.list_id` → `lists.id` (same Turso DB, soft reference)
- `tournament_players.list_id` → `lists.id` (same Turso DB, soft reference)
- Game data store and Brain both use Wahapedia faction IDs (e.g., `"SM"`, `"AE"`)
- Brain `datasheetId` fields reference the same Wahapedia datasheet IDs stored in game-data-store

**Data flows:**
1. Wahapedia + BSData → data-import Worker → R2 → data-import client → game-data-store IndexedDB
2. GW PDFs + Wahapedia + community content → build-graph.ts → R2 → Brain Worker → Vectorize + client IndexedDB
3. BCP scraper → Turso (meta_events, meta_event_players, meta_pairings) → cube rebuild → meta_top
4. User actions in apps → Turso (matches, lists, tournaments, simulations)

---

## ETL Documentation

| Doc | Covers |
|-----|--------|
| [etl-scripts.md](etl-scripts.md) | Local CLI scripts: create-master-db, export-wahapedia, scrape-brain-cache, deploy scripts |
| [etl-data-pipelines.md](etl-data-pipelines.md) | Data pipeline Workers: data-import, bcp-scraper, content-ingestor, brain build/upload |
| [etl-app-workers.md](etl-app-workers.md) | App Workers: auth, admin, no-cheat, versus, list-builder, game-tracker, tournament, new-meta, gateway |
