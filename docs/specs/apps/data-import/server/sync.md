# apps/data-import/server/src/lib/sync.ts

> Orchestrator for the full game data sync pipeline — Wahapedia + BSData + missions + ID mapping.

## Prompt

Export `runSync(bucket: R2Bucket, githubToken?: string, force?: boolean): Promise<SyncResult>`.

The sync pipeline runs 5 steps in sequence, accumulating errors and skipped sources:

**Step 1 — Wahapedia**: Call `fetchAndProcessWahapedia(previousLastUpdate?)`. Pass `undefined` for lastUpdate if `force` is true (to skip the "unchanged" check). If skipped, note it. If successful, hold the data in memory for ID mapping in step 3. Build `wahapediaMeta` with lastUpdate and per-file record counts.

**Step 2 — BSData**: Call `fetchAndProcessBSData(previousCommitSha?, undefined, undefined, githubToken)`. Pass `undefined` for commitSha if `force` is true. If not skipped, extract `{ id, name, faction }` from each unit for ID mapping. Write `bsdata-units.json` to R2. Track `bsdataMeta` with commitSha, unitCount, factionCount.

**Step 3 — ID mapping + Wahapedia write**: Only runs if Wahapedia data changed. If BSData units weren't fetched fresh, load the existing `bsdata-units.json` from R2. Extract factions and datasheets arrays from Wahapedia data. Call `buildIdMapping(datasheets, factions, bsdataUnits)` to get the Wahapedia→BSData ID map and faction code→name map. Call `rekeyAllWahapediaFiles(data, idMap, factionCodeToName)` to re-key all files. Write each re-keyed file to R2 as `data/{name}.json`.

**Step 4 — Missions**: Call `fetchAndProcessMissions(existing)`. Currently a stub that returns `skipped: true`.

**Step 5 — Write manifest**: Build a new `Manifest` with version incremented from existing, current timestamp, and all source metadata. Write to R2 as `manifest.json`.

Return `{ success: errors.length === 0, manifest, errors, skipped }`.

Helper functions (not exported): `readManifest(bucket)`, `writeManifest(bucket, manifest)`, `writeDataFile(bucket, filename, data)` — thin wrappers around R2 `get`/`put`.

## Dependencies

- `../types` — `Manifest`
- `./sources/wahapedia` — `fetchAndProcessWahapedia`
- `./sources/bsdata` — `fetchAndProcessBSData`
- `./sources/missions` — `fetchAndProcessMissions`
- `./id-mapping` — `buildIdMapping`, `rekeyAllWahapediaFiles`

## Contracts

- Each source is independently try/caught — one failure doesn't block others
- Manifest version is always incremented, even on partial failure
- Files accumulate in the manifest across syncs (Set-based)
- R2 keys: `manifest.json` at root, data files under `data/` prefix
