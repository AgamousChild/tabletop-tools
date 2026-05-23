# ETL — Scripts

> Local CLI scripts for data processing, export, and deployment.
> All scripts are run locally (not on Workers).
> Related schema docs: [schema-turso.md](schema-turso.md), [schema-indexeddb-game-data.md](schema-indexeddb-game-data.md), [schema-indexeddb-brain.md](schema-indexeddb-brain.md)

---

## Pipeline Overview

```
                              ┌─────────────────────┐
                              │  External Sources    │
                              │  Wahapedia SQLite    │
                              │  BSData SQLite       │
                              │  Chapter Approved MD │
                              │  Google Search       │
                              └──────┬──────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ create-master-db │    │ export-wahapedia │    │ scrape-brain-cache   │
│   (merge + xref) │    │  (SQLite → JSON) │    │ (Google → JSON cache)│
└────────┬─────────┘    └────────┬─────────┘    └──────────┬───────────┘
         ▼                       ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ scripts/.local/  │    │ apps/data-import/│    │ .local/brain-cache/  │
│   master.db      │    │ client/public/   │    │   {hash}.json        │
│                  │    │ wahapedia/*.json  │    │   _summary.json      │
└──────────────────┘    └──────────────────┘    └──────────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │ refresh-wahapedia│
                        │ (fetch CSVs →    │
                        │  same JSON dir)  │
                        └──────────────────┘
```

---

## `scripts/create-master-db.ts`

**Purpose:** Merge BSData and Wahapedia SQLite databases into a unified master.db with cross-reference tables.

**Usage:** `npx tsx scripts/create-master-db.ts [output-path]`

### Data Flow

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ Wahapedia SQLite (readonly)      │     │ BSData SQLite (readonly)         │
│ C:/R/sync-data/tools/            │     │ C:/R/sync-data/tools/            │
│   wahapedia-sync/.local/         │     │   bsdata-sync/.local/            │
│   wahapedia/data.db              │     │   bsdata/data.db                 │
│                                  │     │                                  │
│ Tables read:                     │     │ Tables read:                     │
│   factions, sources, datasheets, │     │   units, weapons,                │
│   datasheet_models,              │     │   weapon_abilities, abilities    │
│   datasheet_models_cost,         │     │                                  │
│   datasheet_wargear,             │     └──────────────┬───────────────────┘
│   datasheet_abilities,           │                    │
│   datasheet_keywords,            │                    │
│   datasheet_leaders,             │                    │
│   datasheet_options,             │                    │
│   datasheet_unit_composition,    │                    │
│   detachments,                   │                    │
│   detachment_abilities,          │                    │
│   enhancements, stratagems,      │                    │
│   abilities,                     │                    │
│   datasheet_stratagems,          │                    │
│   datasheet_enhancements,        │                    │
│   datasheet_detachment_abilities │                    │
└──────────────────┬───────────────┘                    │
                   │                                    │
                   ▼                                    ▼
            ┌──────────────────────────────────────────────┐
            │              TRANSFORM                       │
            │                                              │
            │  1. Copy Wahapedia tables as w_* tables      │
            │  2. Copy BSData tables as b_* tables         │
            │  3. Faction mapping: BSData → Wahapedia IDs  │
            │  4. Unit matching: name normalization +      │
            │     suffix-strip + variation matching        │
            │  5. Build xref_unit_mapping (waha ↔ bsdata)  │
            │  6. Extract game_rules from weapon abilities │
            │  7. Link unit_rules (unit ↔ rules)           │
            └──────────────────────┬───────────────────────┘
                                   ▼
            ┌──────────────────────────────────────────────┐
            │  scripts/.local/master.db                    │
            │                                              │
            │  Output tables:                              │
            │    w_factions, w_sources, w_datasheets, ...  │
            │    b_units, b_weapons, b_weapon_abilities,.. │
            │    xref_unit_mapping (wahaId ↔ bsdataId)     │
            │    game_rules (standardized rules)           │
            │    unit_rules (unit ↔ rule junction)         │
            └──────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` (top-level) | `scripts/create-master-db.ts` | 1 | Entry point — opens DBs, runs all steps |

### Sources

| Source | Path | Read |
|--------|------|------|
| Wahapedia DB | `C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db` | 19 tables (read-only) |
| BSData DB | `C:/R/sync-data/tools/bsdata-sync/.local/bsdata/data.db` | 4 tables (read-only) |

### Destinations

| Destination | Path | Write |
|-------------|------|-------|
| Master DB | `scripts/.local/master.db` (default) | w_*, b_*, xref_*, game_rules, unit_rules |

---

## `scripts/export-wahapedia.ts`

**Purpose:** Read Wahapedia SQLite and export JSON files for the data-import client app.

**Usage:** `npx tsx scripts/export-wahapedia.ts [path-to-wahapedia-db]`

### Data Flow

```
┌────────────────────────────────────┐   ┌─────────────────────────────────┐
│ Wahapedia SQLite                   │   │ Chapter Approved Markdown       │
│ C:/R/sync-data/tools/wahapedia-    │   │ C:/R/sync-data/.local/          │
│   sync/.local/wahapedia/data.db    │   │   chapter-approved/markdown/    │
│                                    │   │   primary-missions.md           │
│ All 19 game data tables            │   │   secondary-missions-*.md       │
│                                    │   │   twist-cards.md                │
└──────────────────┬─────────────────┘   │   challenger-cards.md           │
                   │                     │   deployment-zones.md           │
                   │                     └──────────────┬──────────────────┘
                   ▼                                    ▼
            ┌──────────────────────────────────────────────┐
            │              TRANSFORM                       │
            │                                              │
            │  1. SQL query each table                     │
            │  2. Rename columns: snake_case → camelCase   │
            │  3. HTML → Markdown (descriptions)           │
            │  4. Mark Legends units (isLegends flag)      │
            │  5. Extract missions from Chapter Approved   │
            │     markdown (regex parsing)                 │
            └──────────────────────┬───────────────────────┘
                                   ▼
            ┌──────────────────────────────────────────────┐
            │  apps/data-import/client/public/wahapedia/   │
            │                                              │
            │  Output files (19):                          │
            │    factions.json                             │
            │    detachments.json                          │
            │    detachment_abilities.json                 │
            │    stratagems.json                           │
            │    enhancements.json                         │
            │    leader_attachments.json                   │
            │    unit_compositions.json                    │
            │    unit_costs.json                           │
            │    wargear_options.json                      │
            │    unit_keywords.json                        │
            │    unit_abilities.json                       │
            │    abilities.json                            │
            │    datasheets.json                           │
            │    datasheet_wargear.json                    │
            │    datasheet_models.json                     │
            │    datasheet_stratagems.json                 │
            │    datasheet_enhancements.json               │
            │    datasheet_detachment_abilities.json        │
            │    missions.json                             │
            └──────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `query(sql)` | `scripts/export-wahapedia.ts` | 30 | Execute SQL against Wahapedia DB |
| `writeJson(filename, data)` | `scripts/export-wahapedia.ts` | 35 | Write JSON output file + log |
| `extractMissions()` | `scripts/export-wahapedia.ts` | 55 | Parse Chapter Approved markdown into mission objects |

### Sources

| Source | Path | Read |
|--------|------|------|
| Wahapedia DB | `C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db` | 19 tables |
| Chapter Approved | `C:/R/sync-data/.local/chapter-approved/markdown/` | 5 markdown files |

### Destinations

| Destination | Path | Write |
|-------------|------|-------|
| JSON files | `apps/data-import/client/public/wahapedia/*.json` | 19 JSON files (gitignored) |

---

## `scripts/scrape-brain-cache.ts`

**Purpose:** Scrape Google Search for 40K rules questions to pre-populate Brain answer cache.

**Usage:** `npx tsx scripts/scrape-brain-cache.ts [--output dir] [--batch N] [--day 0-6]`

### Data Flow

```
┌──────────────────────────────┐
│ Fixed question list          │
│ (hardcoded ~40 questions)    │
│                              │
│ + Faction-specific questions │
│ + Unit-specific questions    │
│   (rotated by day of week)  │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Google Search (Playwright)   │
│ Headless Chromium browser    │
│                              │
│ For each question:           │
│   1. Navigate to Google      │
│   2. Extract AI Overview     │
│   3. Extract featured snippet│
│   4. Extract result snippets │
│   5. Check for CAPTCHA       │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ .local/brain-cache/          │
│   {hash}.json (per question) │
│   _summary.json              │
│                              │
│ Per file:                    │
│   { answer, sources: [{     │
│       url, title }],         │
│     cachedAt }               │
└──────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` (top-level) | `scripts/scrape-brain-cache.ts` | — | Entry: launch browser, iterate questions, write results |

### Sources

| Source | Read |
|--------|------|
| Google Search | SERP HTML (AI Overview, featured snippets, result cards) |
| Hardcoded questions | `FIXED_QUESTIONS` array (line 19) |

### Destinations

| Destination | Path | Write |
|-------------|------|-------|
| Cache files | `.local/brain-cache/{hash}.json` | One JSON per question |
| Summary | `.local/brain-cache/_summary.json` | Run metadata |

---

## `scripts/migrate-training.mjs`

**Purpose:** One-time migration script to create `training_examples` and `training_frames` tables in production Turso.

**Usage:** `node scripts/migrate-training.mjs`

### Data Flow

```
┌──────────────────────┐        ┌──────────────────────┐
│ .env                 │───────→│ Turso (production)    │
│   TURSO_DB_URL       │        │                       │
│   TURSO_AUTH_TOKEN   │        │ Creates:              │
│                      │        │   training_examples   │
└──────────────────────┘        │   training_frames     │
                                │ + indexes             │
                                └──────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` (top-level) | `scripts/migrate-training.mjs` | 1 | Execute DDL statements against Turso |

---

## `apps/data-import/server/src/refresh-wahapedia.ts`

**Purpose:** Fetch latest Wahapedia CSVs directly from wahapedia.ru and save as JSON (alternative to export-wahapedia.ts which reads from local SQLite).

**Usage:** `cd apps/data-import/server && npx tsx src/refresh-wahapedia.ts`

### Data Flow

```
┌────────────────────────────┐
│ wahapedia.ru/wh40k10ed/    │
│   20 CSV endpoints         │
└──────────────┬─────────────┘
               ▼
┌────────────────────────────┐
│ fetchAndProcessWahapedia() │
│ Parse CSV, transform cols, │
│ HTML → markdown            │
└──────────────┬─────────────┘
               ▼
┌────────────────────────────┐
│ apps/data-import/client/   │
│ public/wahapedia/*.json    │
└────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` | `apps/data-import/server/src/refresh-wahapedia.ts` | 11 | Fetch and write all Wahapedia data |

---

## Deploy Scripts

| Script | Purpose | Reads | Writes To |
|--------|---------|-------|-----------|
| `scripts/deploy-all.sh` | Full build + migrate + deploy all | Built artifacts, `.env` | Cloudflare Workers + Pages + Turso |
| `scripts/deploy-auth.sh` | Auth Worker only | Built artifacts | Cloudflare Workers (`tabletop-tools-auth`) |
| `scripts/deploy-gateway.sh` | Gateway + all client SPAs | `dist/` directory | Cloudflare Pages |
| `scripts/deploy-workers.sh` | All 7 app Workers | Built artifacts | Cloudflare Workers (7 services) |
| `scripts/verify-deployment.sh` | Curl-based endpoint verification | Deployed endpoints | stdout (pass/fail) |
| `scripts/teardown-subdomains.sh` | Remove old subdomain DNS | Cloudflare API | Cloudflare DNS records |
