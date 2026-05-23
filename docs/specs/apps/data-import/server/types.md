# apps/data-import/server/src/types.ts

> Type definitions for the data-import Worker environment and manifest format.

## Prompt

Export two types:

`Env` interface — Cloudflare Worker bindings: `GAME_DATA_BUCKET: R2Bucket`, `SYNC_SECRET?: string`, `CORS_ORIGIN?: string`, `GITHUB_TOKEN?: string`.

`Manifest` interface — the manifest.json schema stored in R2:
- `version: number` — monotonically increasing, bumped on each sync
- `updatedAt: string` — ISO timestamp
- `wahapedia?: { lastUpdate: string, recordCounts: Record<string, number> }` — Wahapedia's own last_update value + per-file record counts
- `bsdata?: { commitSha: string, unitCount: number, factionCount: number }` — BSData git commit + counts
- `missions?: { count: number }` — mission count (stub for now)
- `files: string[]` — list of data filenames stored in R2 `data/` prefix
