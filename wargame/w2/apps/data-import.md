# data-import — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Fetches 40k game data from external sources (Wahapedia CSV, BSData XML, MFM
YAML, GW faction-pack markdown), normalizes to canonical ids, publishes JSON
to R2; client SPA pulls that JSON into browser IndexedDB for versus /
list-builder.

## Architecture

- **Server Worker is now a read-only R2 proxy only**: `GET /manifest.json`
  (`worker.ts:29`), `GET /data/:file` (:38). No /sync, no POST, no cron —
  docstring says so explicitly (`worker.ts:1-14`).
- **Sync pipeline runs as a Node CLI in GitHub Actions**, not the Worker:
  `sync-cli.ts:22` → `runSync()` (`lib/sync.ts:177-777`, 6 stages:
  Wahapedia → BSData → id-mapping/rekey/content-producers → MFM →
  faction-pack → Missions stub → manifest), buffers R2 writes to
  `.local/data-import-output/` for CI upload.
- Sources: `wahapedia.ts` (**still 10th-ed URL** `wahapedia.ru/wh40k10ed`,
  :6), `bsdata.ts` (11e repo), `mfm.ts` (11e MFM), `faction-pack.ts`,
  `missions.ts` (stub, always skipped).
- Client: single `ImportScreen.tsx` (Sync / Stored Data tabs);
  `client/src/lib/sync.ts:65,162` drive manifest check + per-file IndexedDB
  writes via `STORE_MAP`.

## Data model

- Owns no relational schema; writes into `content_entity`/`content_can_lead`
  (`packages/db/src/schema.ts:1206,1362`) — Rule 1 compliant (canonical
  registry).
- R2: `content/{type}.json`, `data/{filename}.json`, `manifest.json`.
- **Rule 6 tension — hardcoded alias/lookup tables in source**, acknowledged
  inline as "presentation-only ID mapping": `CATALOG_FACTION_ALIASES`
  (`sync.ts:83-99`), `MFM_FACTION_SLUGS` (29 entries, :789-820) +
  `SM_CHAPTERS_WITHOUT_MFM` + `BSDATA_TO_MFM_NAME_ALIASES`,
  `SM_CHAPTER_TO_SUBFACTION` (`bsdata.ts:48-60`),
  `factionSlugToBsdataName` (`faction-pack.ts:98-129`) — same underlying
  fact in 3+ hand-maintained variants.
- **Silent client data loss:** `STORE_MAP` (`client/sync.ts:87-160`) has no
  entries for `bsdata-subfactions.json`, `mfm-unit-costing.json`,
  `mfm-detachments.json`, `faction-pack-*.json` — `syncAllData` filters to
  known keys (:167), silently dropping those files.

## API surface

2 GET endpoints, CORS-restricted. No cron in wrangler — scheduling moved to
GH Actions (`.github/workflows/sync-data.yml`, Mon 03:00 UTC). A second
in-app workflow `server/.github/workflows/update-data.yml` describes an
**abandoned pipeline** (SQLite export to a separate data repo; referenced
script doesn't exist) — dead CI artifact.

## Deploy

- Worker `tabletop-tools-data-import` + R2 binding; no cpu_ms needed
  anymore.
- **Rule 9 history verified in git:** raise CPU cap to 5min (`a3630e4`) →
  chunking flags (`c19d8b3`/`c09378c`) → **move sync to GH Actions**
  (`312ed99`) → retire Worker /sync + cron + SYNC_SECRET (`ab0799b`).
  Chunking today = moved off the edge entirely; `sources` filter and
  `skipProducers` remain as unused artifacts (`sync-cli.ts:57-62` passes no
  options).
- Sync job: 30-min timeout, then per-file `wrangler r2 object put --remote`.

## Shared-package usage

`db` (contentEntity), `game-content` (**deep-path imports into
`/src/adapters/...` rather than the public entry** — packaging smell),
`game-data-store` + `ui` (client).

**Rule 3 violation:** slug/canonicalization reimplemented near-identically
3× — `sync.ts:52-59`, `content-producer.ts:137-143`,
`faction-pack.ts:86-92` (only truncation differs).

## CLAUDE.md drift

CLAUDE.md last touched 2026-03-05; 20+ commits since, including the Worker
retirement:
1. Claims `POST /sync` + SYNC_SECRET + weekly cron on the Worker — all
   retired (`ab0799b`); worker has exactly 2 GET routes.
2. MFM source/stage/outputs entirely undocumented.
3. faction-pack source entirely undocumented.
4. `content_entity` producer chain (most of runSync's body) undocumented.
5. Test counts stale: claims 56 server + 22 client; actual 68 + 60.

## Health signals

- Tests thorough (68 server + 60 client). No TODO/FIXME.
- Good per-stage try/catch isolation with `errors[]` (e.g. `sync.ts:225-227`
  … :734-736).
- Acknowledged data gap: `content_can_support` always 0 rows
  ("DATA GAP 2026-06-01", `sync.ts:547-551`).
- **Wahapedia still 10e** despite Rule 5 (11e-exclusive sync) — live
  edition inconsistency inside one pipeline, reads as oversight not
  decision.
- Dead CI workflow (`update-data.yml`); `dist/` artifacts sitting in tree
  (gitignore status unverified).

## Candidate design decision points

1. **Chunk-by-source CI matrix vs monolithic 30-min job** — failure
   isolation + partial re-runs vs simplicity (CPU no longer the constraint).
2. **Consolidate the duplicated slug/alias tables** into one shared module
   (Rule 3) before they drift (one gets a new SM chapter, others don't).
3. **Fix or shrink the client `STORE_MAP` gap** — flow MFM/faction-pack
   files to IndexedDB, or remove them from the manifest's implied-syncable
   list.
4. **Delete or reconcile `update-data.yml`.**
5. **Wahapedia 10e→11e** — wait, replace, or document as a tracked Rule 5
   exception.
6. **content-producer batch performance** — `DB_BATCH_SIZE=100` sequential
   upserts for ~17K entities; parallelize batches under FK-order
   constraints?
