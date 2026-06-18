# ETL — Data Pipelines (Workers)

> Server-side Workers that ingest, transform, and store data.
> These run on Cloudflare Workers (cron or manual trigger).
> Related schema docs: [schema-turso.md](schema-turso.md), [schema-indexeddb-game-data.md](schema-indexeddb-game-data.md), [schema-indexeddb-brain.md](schema-indexeddb-brain.md)

---

## Pipeline Overview

```
                    ┌─────────── External Sources ───────────┐
                    │                                        │
                    │  wahapedia.ru        GitHub (BSData)   │
                    │  BCP API             YouTube / Web     │
                    │  GW PDFs (local)     Gladia API        │
                    │  Google Gemini       Anthropic Claude   │
                    └──────────┬─────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────────┐
        ▼                      ▼                          ▼
┌──────────────┐     ┌──────────────┐           ┌────────────────┐
│ data-import  │     │ bcp-scraper  │           │content-ingestor│
│   Worker     │     │   Worker     │           │   Worker       │
└──────┬───────┘     └──────┬───────┘           └───────┬────────┘
       │                    │                           │
       ▼                    ▼                           ▼
┌──────────────┐     ┌──────────────┐           ┌────────────────┐
│ R2: game-data│     │ Turso:       │           │ R2: brain      │
│   bucket     │     │  meta_events │           │ Vectorize      │
│   (JSON)     │     │  meta_event_ │           │ Turso:         │
│              │     │   players    │           │  ingest_jobs   │
│              │     │  meta_       │           │                │
│              │     │   pairings   │           │                │
└──────┬───────┘     │  bcp_scrape_ │           └───────┬────────┘
       │             │   jobs       │                   │
       ▼             └──────────────┘                   │
┌──────────────┐                                        ▼
│ Client SPA   │                              ┌────────────────┐
│ → IndexedDB  │                              │ brain Worker   │
│ (game-data-  │                              │ (runtime query │
│  store)      │                              │  + /ask RAG)   │
└──────────────┘                              └────────────────┘
                                                        │
                                  ┌─────────────────────┘
                                  ▼
                        ┌────────────────────┐
                        │ build-graph.ts     │
                        │ (local CLI)        │
                        │ Parse all sources  │
                        │ → .local/brain/    │
                        │                    │
                        │ upload-graph.ts    │
                        │ → R2 bucket        │
                        └────────────────────┘
```

---

## 1. data-import Worker

**App:** `apps/data-import/server/`
**Type:** Hono Worker (no tRPC, no auth)
**Trigger:** Cron (Monday 3am UTC) or `POST /sync`

### Pipeline: `runSync()`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: fetchAndProcessWahapedia()                                    │
│  ─────────────────────────────────                                     │
│  Source: wahapedia.ru/wh40k10ed/*.csv (20 CSV files)                   │
│  Transform: parsePipeCsv() → column rename → htmlToMarkdown()          │
│  Delta check: skip if Last_update timestamp unchanged                  │
│                                                                        │
│  Step 2: fetchAndProcessBSData()                                       │
│  ────────────────────────────────                                       │
│  Source: GitHub API → BSData/wh40k-10e repo → .cat XML files           │
│  Transform: parseBSDataXml() → UnitProfile[] (id, name, faction, etc.) │
│  Delta check: skip if commit SHA unchanged                             │
│                                                                        │
│  Step 3: buildIdMapping()                                              │
│  ────────────────────────                                              │
│  Input: Wahapedia datasheets + factions, BSData units                   │
│  Transform: Normalize names → match by exact/fuzzy → build map         │
│  Output: Map<wahaId, bsdataId> + Map<factionCode, factionName>         │
│                                                                        │
│  Step 4: rekeyAllWahapediaFiles()                                      │
│  ────────────────────────────────                                       │
│  Input: Wahapedia JSON + ID mapping                                    │
│  Transform: Replace Wahapedia IDs with BSData IDs in all records       │
│  Also: Replace faction codes with full faction names                    │
│                                                                        │
│  Step 5: Write to R2                                                   │
│  ────────────────────                                                   │
│  Destination: GAME_DATA_BUCKET/data/*.json + manifest.json             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `runSync(bucket, githubToken, force)` | `apps/data-import/server/src/lib/sync.ts` | 28 | Orchestrates full sync pipeline |
| `readManifest(bucket)` | `apps/data-import/server/src/lib/sync.ts` | 14 | Read existing manifest from R2 |
| `writeManifest(bucket, manifest)` | `apps/data-import/server/src/lib/sync.ts` | 20 | Write manifest to R2 |
| `writeDataFile(bucket, filename, data)` | `apps/data-import/server/src/lib/sync.ts` | 24 | Write single data file to R2 |
| `fetchAndProcessWahapedia(previousLastUpdate?)` | `apps/data-import/server/src/lib/sources/wahapedia.ts` | — | Fetch 20 CSVs, parse, transform |
| `fetchCsv(name)` | `apps/data-import/server/src/lib/sources/wahapedia.ts` | 35 | Fetch single CSV from wahapedia.ru |
| `fetchAndProcessBSData(prevSha?, repo?, branch?, token?)` | `apps/data-import/server/src/lib/sources/bsdata.ts` | 25 | Fetch BSData XML from GitHub, parse |
| `normalizeFactionName(name)` | `apps/data-import/server/src/lib/sources/bsdata.ts` | 21 | Strip "Imperium - " / "Chaos - " prefixes |
| `buildIdMapping(datasheets, factions, bsdataUnits)` | `apps/data-import/server/src/lib/id-mapping.ts` | 32 | Build Wahapedia ↔ BSData ID map |
| `rekeyAllWahapediaFiles(data, mapping, factionMap)` | `apps/data-import/server/src/lib/id-mapping.ts` | — | Replace IDs in all Wahapedia JSON |
| `normalizeName(name)` | `apps/data-import/server/src/lib/id-mapping.ts` | 12 | Normalize unit name for fuzzy matching |
| `parsePipeCsv(text)` | `apps/data-import/server/src/lib/parsers/wahapedia-csv.ts` | — | Parse pipe-delimited CSV |
| `htmlToMarkdown(html)` | `apps/data-import/server/src/lib/parsers/wahapedia-csv.ts` | — | Convert Wahapedia HTML to markdown |
| `convertDescriptions(rows, fields)` | `apps/data-import/server/src/lib/parsers/wahapedia-csv.ts` | — | Batch convert description fields |

### Endpoints

| Method | Path | File | Line | Auth | Description |
|--------|------|------|------|------|-------------|
| GET | `/manifest.json` | `apps/data-import/server/src/worker.ts` | 15 | None | Return manifest from R2 |
| GET | `/data/:file` | `apps/data-import/server/src/worker.ts` | 24 | None | Return data JSON from R2 |
| POST | `/sync` | `apps/data-import/server/src/worker.ts` | 38 | Bearer SYNC_SECRET | Trigger full sync |
| — | `scheduled` | `apps/data-import/server/src/worker.ts` | 59 | Cron | Weekly auto-sync |

### Sources → Destinations

| Source | Destination | Transform |
|--------|-------------|-----------|
| wahapedia.ru (20 CSVs) | R2 `GAME_DATA_BUCKET/data/*.json` | CSV → JSON, HTML → markdown, column rename |
| GitHub BSData XML (.cat files) | R2 `GAME_DATA_BUCKET/data/bsdata-units.json` | XML → UnitProfile[] |
| Both sources | R2 `GAME_DATA_BUCKET/manifest.json` | Metadata aggregation |

### Client Sync (downstream)

```
R2 bucket
    → GET /data-import/api/manifest.json  (client checks version)
    → GET /data-import/api/data/:file     (client downloads each file)
    → game-data-store saveUnits/saveDetachments/etc.  (client → IndexedDB)
    → versus, list-builder apps read from IndexedDB via hooks
```

---

## 2. bcp-scraper Worker

**App:** `apps/bcp-scraper/server/`
**Type:** Hono Worker (no tRPC)
**Trigger:** Cron or `POST /scrape`

### Pipeline

```
┌───────────────────────────────────────────────────────────────────────┐
│  Step 1: runScrape()                                                 │
│  ───────────────────                                                 │
│  1a. authenticateBcp() — AWS Cognito login                           │
│  1b. BcpApiClient.getEvents() — fetch recent GT events               │
│  1c. BcpApiClient.getPairings() — fetch all pairings per event       │
│  1d. Normalize faction names → dim_faction IDs                       │
│  1e. Extract detachment from list text                               │
│  1f. Write: meta_events, meta_event_players, meta_pairings           │
│  1g. Write: bcp_scrape_jobs (tracking record)                        │
│                                                                      │
│  Step 2: runPipeline()                                               │
│  ─────────────────────                                                │
│  Incremental cube builder:                                           │
│  2a. Find events without fact_game_results                           │
│  2b. Generate time frames (day/month/quarter/year)                   │
│  2c. Build fact_game_results from meta_pairings                      │
│  2d. Aggregate into meta_top (win rates, placement stats)            │
│  2e. Update meta_cube_status                                         │
│                                                                      │
│  Step 3: parsePendingLists()                                         │
│  ────────────────────────────                                         │
│  3a. Find meta_event_players with list_text but no list_ttt          │
│  3b. parseList(text) — detect format + parse army list               │
│  3c. Update meta_event_players.list_ttt with parsed JSON             │
└───────────────────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `runScrape(config, triggeredBy)` | `apps/bcp-scraper/server/src/lib/scrape.ts` | 37 | Full scrape: auth → fetch events → write to Turso |
| `authenticateBcp(opts)` | `apps/bcp-scraper/server/src/lib/cognito.ts` | — | AWS Cognito login to BCP |
| `BcpApiClient` class | `apps/bcp-scraper/server/src/lib/bcp-api.ts` | — | HTTP client for BCP REST API |
| `normalizeFaction(raw)` | `apps/bcp-scraper/server/src/lib/faction-map.ts` | — | Map BCP faction string → dim_faction ID |
| `extractDetachment(listText)` | `apps/bcp-scraper/server/src/lib/detachment-map.ts` | — | Parse detachment from army list text |
| `runPipeline(db)` | `apps/bcp-scraper/server/src/lib/pipeline.ts` | — | Incremental cube rebuild |
| `generateFrames(events, dataslates, packs, editions)` | `apps/bcp-scraper/server/src/lib/pipeline.ts` | 34 | Generate time dimension frames |
| `parsePendingLists(db)` | `apps/bcp-scraper/server/src/lib/parse-lists.ts` | 5 | Parse unparsed army lists |
| `parseList(text)` | `apps/bcp-scraper/server/src/lib/list-parser.ts` | — | Detect format + parse army list |
| `detectFormat(text)` | `apps/bcp-scraper/server/src/lib/format-detector.ts` | — | Detect GW vs BattleScribe format |
| `parseGwList(text)` | `apps/bcp-scraper/server/src/lib/gw-parser.ts` | — | Parse GW-format army list |
| `parseBsList(text)` | `apps/bcp-scraper/server/src/lib/bs-parser.ts` | — | Parse BattleScribe-format army list |
| `buildLocation(event)` | `apps/bcp-scraper/server/src/lib/scrape.ts` | 18 | Build location string from event |
| `mapResult(p1Result, p2Result)` | `apps/bcp-scraper/server/src/lib/scrape.ts` | 23 | Map BCP result codes → p1/p2/draw |

### Endpoints

| Method | Path | File | Line | Auth | Description |
|--------|------|------|------|------|-------------|
| GET | `/health` | `apps/bcp-scraper/server/src/worker.ts` | 30 | None | Health check |
| POST | `/scrape` | `apps/bcp-scraper/server/src/worker.ts` | 32 | Bearer SYNC_SECRET | Trigger scrape + pipeline |
| — | `scheduled` | `apps/bcp-scraper/server/src/worker.ts` | 60 | Cron | Auto-scrape |

### Sources → Destinations

| Source | Destination | Turso Tables Written |
|--------|-------------|---------------------|
| BCP API (events, pairings, lists) | Turso | `meta_events`, `meta_event_players`, `meta_pairings`, `bcp_scrape_jobs` |
| Turso (meta_events, meta_pairings) | Turso | `meta_for`, `meta_top`, `fact_game_results`, `meta_cube_status` |
| Turso (meta_event_players.list_text) | Turso | `meta_event_players.list_ttt` (parsed JSON) |

---

## 3. content-ingestor Worker

**App:** `apps/content-ingestor/server/`
**Type:** Hono Worker (no tRPC)
**Trigger:** Manual `POST /ingest/youtube` or `POST /ingest/web`

### Pipeline: YouTube Ingestion

```
┌────────────────────────────────────────────────────────────────────────┐
│  Step 0: POST /ingest/youtube → startYoutubeIngest()                  │
│  ─────────────────────────────────────────────────────                 │
│  Input: YouTube URL                                                    │
│  1. Create ingest_jobs row (status: pending)                           │
│  2. Submit to Gladia API for transcription                             │
│  3. Update ingest_jobs (status: transcribing, gladiaJobId)             │
│                                                                        │
│  Step 1: POST /ingest/callback → saveTranscript()                     │
│  ────────────────────────────────────────────────                      │
│  Input: Gladia webhook callback with transcript                        │
│  1. Parse Gladia callback JSON                                         │
│  2. Update ingest_jobs (status: transcribed, transcript text)          │
│                                                                        │
│  Step 2: POST /ingest/process/:id → processJob()                      │
│  ─────────────────────────────────────────────────                     │
│  Input: Job ID                                                         │
│  1. Read transcript from ingest_jobs                                   │
│  2. extractNodes() — Claude API streaming → extract tactics/tips       │
│  3. writeNodesToBrain() — append nodes to R2 community.json            │
│  4. Embed + upsert to Vectorize                                        │
│  5. Update ingest_jobs (status: completed, nodesExtracted)             │
└────────────────────────────────────────────────────────────────────────┘
```

### Pipeline: Web Article Ingestion

```
┌────────────────────────────────────────────────────────────────────────┐
│  POST /ingest/web → ingestWebArticle()                                │
│  ──────────────────────────────────────                               │
│  Input: Article URL                                                    │
│  1. Create ingest_jobs row (status: pending, sourceType: web)          │
│  2. fetchArticleText() — fetch HTML, extract text content              │
│  3. extractNodes() — Claude API → extract key points                   │
│  4. writeNodesToBrain() — append to R2 community.json                  │
│  5. Embed + upsert to Vectorize                                        │
│  6. Update ingest_jobs (status: completed)                             │
└────────────────────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `startYoutubeIngest(opts)` | `apps/content-ingestor/server/src/lib/ingest.ts` | 10 | Submit YouTube URL to Gladia, create job |
| `saveTranscript(opts)` | `apps/content-ingestor/server/src/lib/ingest.ts` | 55 | Save Gladia callback transcript to DB |
| `processJob(opts)` | `apps/content-ingestor/server/src/lib/ingest.ts` | — | Extract nodes from transcript, write to R2 + Vectorize |
| `ingestWebArticle(opts)` | `apps/content-ingestor/server/src/lib/ingest.ts` | — | Full web article pipeline in one shot |
| `submitTranscription(opts)` | `apps/content-ingestor/server/src/lib/gladia.ts` | — | Call Gladia transcription API |
| `parseGladiaCallback(body)` | `apps/content-ingestor/server/src/lib/gladia.ts` | — | Parse Gladia webhook JSON |
| `extractNodes(transcript, anthropicKey)` | `apps/content-ingestor/server/src/lib/extract.ts` | — | Claude API → extract tactics/tips as nodes |
| `writeNodesToBrain(opts)` | `apps/content-ingestor/server/src/lib/nodes.ts` | — | Append nodes to R2 community.json + embed in Vectorize |
| `fetchArticleText(url)` | `apps/content-ingestor/server/src/lib/html.ts` | — | Fetch HTML, extract article text |
| `checkAuth(c)` | `apps/content-ingestor/server/src/worker.ts` | 26 | Verify Bearer SYNC_SECRET |

### Endpoints

| Method | Path | File | Line | Auth | Description |
|--------|------|------|------|------|-------------|
| GET | `/health` | `apps/content-ingestor/server/src/worker.ts` | 38 | None | Health check |
| GET | `/test-r2` | `apps/content-ingestor/server/src/worker.ts` | 40 | None | R2 connectivity test |
| POST | `/ingest/youtube` | `apps/content-ingestor/server/src/worker.ts` | 69 | Bearer | Submit YouTube URL |
| POST | `/ingest/web` | `apps/content-ingestor/server/src/worker.ts` | 87 | Bearer | Submit web article URL |
| POST | `/ingest/callback` | `apps/content-ingestor/server/src/worker.ts` | 104 | None (Gladia webhook) | Receive transcript |
| POST | `/ingest/process/:id` | `apps/content-ingestor/server/src/worker.ts` | 124 | Bearer | Extract + commit nodes |
| GET | `/jobs` | `apps/content-ingestor/server/src/worker.ts` | 144 | Bearer | List recent jobs |

### Sources → Destinations

| Source | Destination | What |
|--------|-------------|------|
| YouTube URL → Gladia API | Turso `ingest_jobs` | Job tracking (status, transcript) |
| Web article URL | Turso `ingest_jobs` | Job tracking |
| Claude API (extraction) | R2 `BRAIN_BUCKET/nodes/community.json` | Community nodes |
| Workers AI (embedding) | Vectorize `BRAIN_INDEX` | 768-dim embeddings |

---

## 4. Brain Build Pipeline (Local CLI)

**App:** `apps/brain/server/`
**Type:** Local CLI scripts (not Workers)
**Trigger:** Manual run before deploy

### Pipeline: `build-graph.ts`

```
┌────────────────────────────────────────────────────────────────────────┐
│  Step 1: Parse Core Rules                                             │
│  Source: C:/R/sync-data/tools/gw-sync/.local/gw/markdown/core-rules.md│
│  Transform: normalizeMarkdown() → parseCoreRules()                    │
│  Output: ~500 nodes + refs                                            │
│                                                                        │
│  Step 2: Parse Rules Commentary                                       │
│  Source: core-rules-updates-and-rules-commentary.md                    │
│  Transform: parseRulesCommentary() → FAQ/errata nodes                 │
│                                                                        │
│  Step 3: Parse Balance Dataslate                                      │
│  Source: balance-dataslate.md                                          │
│  Transform: parseBalanceDataslate() → balance change nodes            │
│                                                                        │
│  Step 4: Parse Faction Packs (per faction)                            │
│  Source: faction-pack-{faction}.md (multiple files)                    │
│  Transform: parseFactionPack() → faction-specific rules               │
│                                                                        │
│  Step 5: Convert Game Data (Wahapedia)                                │
│  Source: apps/data-import/client/public/wahapedia/*.json               │
│  Transform: convertGameData() → ~8000 unit/weapon/ability nodes       │
│                                                                        │
│  Step 6: Parse Chapter Approved                                       │
│  Source: C:/R/sync-data/.local/chapter-approved/markdown/              │
│  Transform: parsePrimaryMissions/parseSecondaryMissions/etc.           │
│                                                                        │
│  Step 7: Parse Tournament Companion                                   │
│  Source: *-tournament-companion.md                                     │
│  Transform: parseTournamentCompanion()                                 │
│                                                                        │
│  Step 8: Build Community Nodes                                        │
│  Source: apps/content-ingestor/.local/ingest/                          │
│  Transform: buildCommunityNodes() → ~500 community nodes              │
│                                                                        │
│  Step 9: Build 11th Edition Nodes                                     │
│  Source: hardcoded data in data/11th-edition-detachments.ts            │
│  Transform: build11thEditionNodes()                                   │
│                                                                        │
│  Step 10: Post-processing                                             │
│  a. mergeSources() — deduplicate across source parsers                │
│  b. massage() — clean phantom nodes, normalize keywords               │
│  c. extractStructuredFields() — parse CP costs, model restrictions    │
│  d. buildFactionNodes() — one summary node per faction                │
│  e. buildDetachmentNodes() — detachment summary with children         │
│  f. reclassifyArmyRules() — fix mis-categorized army rules            │
│  g. buildComboRefs() — stacks_with refs for synergistic abilities     │
│  h. buildEligibleForRefs() — eligible_for refs (unit → detachment)    │
│  i. mapNodesToPages() — map nodes to PDF page numbers                 │
│                                                                        │
│  Step 11: Partition & Write                                           │
│  a. partitionNodes() — split by layer/category → shards               │
│  b. partitionRefs() → forward-index.json, reverse-index.json          │
│  c. buildManifest() → manifest.json with hashes                       │
│  d. Write all to .local/brain/                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` | `apps/brain/server/src/build-graph.ts` | 57 | Entry point — orchestrates full build |
| `stampPublishedAt(nodes, date)` | `apps/brain/server/src/build-graph.ts` | 49 | Set publishedAt on all node sources |
| `loadJson(file)` | `apps/brain/server/src/build-graph.ts` | 44 | Load JSON from game data directory |
| `parseCoreRules(md, retrievedAt)` | `apps/brain/server/src/lib/parsers/core-rules.ts` | — | Parse core rules markdown → nodes |
| `parseRulesCommentary(md, retrievedAt)` | `apps/brain/server/src/lib/parsers/rules-commentary.ts` | — | Parse FAQ/commentary → nodes |
| `parseBalanceDataslate(md, retrievedAt)` | `apps/brain/server/src/lib/parsers/balance-dataslate.ts` | — | Parse balance changes → nodes |
| `parseFactionPack(md, faction, retrievedAt)` | `apps/brain/server/src/lib/parsers/faction-pack.ts` | — | Parse faction pack → nodes |
| `convertGameData(input)` | `apps/brain/server/src/lib/parsers/game-data.ts` | — | Convert Wahapedia JSON → nodes |
| `buildCommunityNodes(dir)` | `apps/brain/server/src/lib/combat-knowledge.ts` | — | Load community content → nodes |
| `build11thEditionNodes()` | `apps/brain/server/src/data/11th-edition-detachments.ts` | — | Hardcoded 11th Ed nodes |
| `mergeSources(nodes)` | `apps/brain/server/src/lib/merge-sources.ts` | — | Deduplicate nodes |
| `massage(nodes)` | `apps/brain/server/src/lib/massage.ts` | — | Clean + normalize nodes |
| `extractStructuredFields(nodes)` | `apps/brain/server/src/lib/extract-fields.ts` | — | Parse CP costs, restrictions |
| `buildFactionNodes(nodes)` | `apps/brain/server/src/lib/combo-detection.ts` | — | Create faction summary nodes |
| `buildDetachmentNodes(nodes)` | `apps/brain/server/src/lib/combo-detection.ts` | — | Create detachment summary nodes |
| `buildComboRefs(nodes)` | `apps/brain/server/src/lib/combo-detection.ts` | — | Detect synergistic combos |
| `buildEligibleForRefs(nodes)` | `apps/brain/server/src/lib/combo-detection.ts` | — | Unit → detachment eligibility |
| `reclassifyArmyRules(nodes)` | `apps/brain/server/src/lib/combo-detection.ts` | — | Fix category misassignments |
| `mapNodesToPages(nodes, mdDir)` | `apps/brain/server/src/lib/pdf-positions.ts` | — | Map nodes to PDF page numbers |
| `partitionNodes(nodes)` | `apps/brain/server/src/lib/sync.ts` | — | Split nodes into file shards |
| `partitionRefs(refs)` | `apps/brain/server/src/lib/sync.ts` | — | Split refs into forward/reverse files |
| `buildManifest(files)` | `apps/brain/server/src/lib/sync.ts` | — | Create manifest with file hashes |
| `normalizeMarkdown(raw)` | `apps/brain/server/src/lib/normalize/normalize.ts` | — | Normalize GW PDF markdown |

### Pipeline: `upload-graph.ts`

| Function | File | Line | Description |
|----------|------|------|-------------|
| `main()` | `apps/brain/server/src/upload-graph.ts` | 25 | Upload .local/brain/ to R2 via wrangler |

### Sources → Destinations

| Source | Destination | Transform |
|--------|-------------|-----------|
| GW markdown (core-rules, faction packs, etc.) | `.local/brain/nodes/*.json` | Parse → merge → massage → partition |
| Wahapedia JSON (18 files) | `.local/brain/nodes/units.json` + others | convertGameData() |
| Chapter Approved markdown | `.local/brain/nodes/*.json` | parsePrimaryMissions(), etc. |
| Community nodes (content-ingestor output) | `.local/brain/nodes/community.json` | buildCommunityNodes() |
| `.local/brain/` (all files) | R2 `tabletop-tools-brain/` | Direct copy via wrangler CLI |

---

## 5. Brain Worker (Runtime)

**App:** `apps/brain/server/`
**Type:** Hono Worker
**Data:** R2 + Vectorize (read), Vectorize (write on /index-vectors)

### Key Runtime Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `retrieve(query, filters, opts)` | `apps/brain/server/src/lib/retrieve.ts` | — | Unified retrieval: embed → Vectorize → R2 → enrich |
| `detectFactions(query)` | `apps/brain/server/src/lib/faction-detect.ts` | — | Parse faction names from query |
| `fetchAllNodes(bucket, manifest)` | `apps/brain/server/src/lib/fetch-nodes.ts` | — | Load all nodes from R2 (cached) |
| `buildRecords(nodes, refs)` | `apps/brain/server/src/lib/records.ts` | — | Aggregate nodes into parent+children records |
| `filterBrowseRecords(records, layer)` | `apps/brain/server/src/lib/browse.ts` | — | Filter for browse display |
| `buildCrossRefs(nodeId, refs, allNodes)` | `apps/brain/server/src/lib/cross-refs.ts` | — | Build cross-reference links |
| `linkErrata(nodeId, errataNodes)` | `apps/brain/server/src/lib/errata-linker.ts` | — | Find errata for a node |
| `linkEntities(content, entityIndex)` | `apps/brain/server/src/lib/entity-linker.ts` | — | Make entity names clickable |
| `formatContext(records)` | `apps/brain/server/src/lib/format.ts` | — | Format records as LLM context |
| `stripFlavor(content)` | `apps/brain/server/src/lib/strip-flavor.ts` | — | Remove flavor text from rules |
| `combatTier(stats)` | `apps/brain/server/src/lib/combat-tiers.ts` | — | Assign unit combat effectiveness tier |
