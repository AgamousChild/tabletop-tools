# apps/data-import/server/src/lib/sources/missions.ts

> Missions data source — currently a stub that returns skipped.

## Prompt

Stub module for missions data. Missions currently come through the Wahapedia data pipeline. This placeholder exists for future Chapter Approved PDF extraction.

Export `fetchAndProcessMissions(existing: Manifest | null): Promise<MissionsResult>`. Always returns `{ skipped: true, missions: [] }`.

`MissionsResult` interface: `{ skipped: boolean, missions: Array<{ id, name, type, description }> }`.

## Dependencies

- `../../types` — `Manifest`
