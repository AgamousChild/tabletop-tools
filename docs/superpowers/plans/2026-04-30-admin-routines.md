# Admin Routines / Pipeline Job Control (#35)

## Goal

Micah can trigger data pipeline jobs (scraper, import, cube rebuild, brain rebuild) from a UI or command without manually running scripts.

## Options

### Option A: Claude Code routines via /schedule

Set up named routines:
- `rebuild-cube` — runs seed-dimensions + import-3nf + build-cube
- `rebuild-brain` — runs commit + stamp-dates + build-graph + upload-graph
- `scrape-new-events` — runs scan-all-events + scrape-pairings + scrape-lists
- `full-pipeline` — all of the above in sequence

Trigger via Claude Code CLI or remotely.

**Status:** RemoteTrigger API schema is undocumented. /schedule CLI may work.

### Option B: npm scripts + pm2

Add npm scripts to content-ingestor package.json:
```json
{
  "scripts": {
    "pipeline:seed": "tsx src/meta/seed-dimensions.ts",
    "pipeline:import": "tsx src/meta/import-3nf.ts",
    "pipeline:cube": "tsx src/meta/build-cube.ts",
    "pipeline:brain": "tsx src/meta/rebuild-brain.ts",
    "pipeline:full": "npm run pipeline:seed && npm run pipeline:import && npm run pipeline:cube"
  }
}
```

All pipeline scripts use `&&` chaining for fail-fast — a failed step stops the pipeline.

Run via `pnpm --filter content-ingestor pipeline:full`.

**Pros:** Works now, no API issues
**Cons:** Must be at terminal, no remote trigger

### Option C: Local HTTP server

Tiny Express server on localhost:9999 with endpoints:
- POST /run/rebuild-cube
- POST /run/rebuild-brain
- POST /run/scrape-events

Admin UI calls localhost:9999 when on the local network.

**Pros:** UI-triggered, runs locally
**Cons:** Only works from local network, security considerations

Note: the YouTube channel daemon (task #48) effectively requires Option C (local HTTP server) — revisit when implementing #48, as the daemon infrastructure can be shared.

### Recommendation

Start with Option B (npm scripts) — works immediately. Add Option A (routines) when the Claude Code routine API stabilizes. Option C is overkill for one user (unless needed for #48).

## Logging

Each pipeline run logs to `.local/pipeline-log.json` with: timestamp, script name, exit status, row/event counts. Format: append-only JSON array.

## Estimated effort

Option B: 30 min (add scripts to package.json)
Option A: 1 hour (when API works)
Option C: 2 hours

## Needs

- Micah to try `/schedule` in Claude Code CLI to see if it works for his setup
