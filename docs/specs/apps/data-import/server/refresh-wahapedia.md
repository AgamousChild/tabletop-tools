# apps/data-import/server/src/refresh-wahapedia.ts

> CLI script to fetch latest Wahapedia CSVs and save as local JSON files.

## Prompt

Node.js CLI script (run with `npx tsx`). Calls `fetchAndProcessWahapedia()` with no previousLastUpdate (force fetch), writes each data file as JSON to `../client/public/wahapedia/`. Creates the output directory if it doesn't exist. Logs file counts and sizes. This is a development tool for populating the client's static Wahapedia data during local development.

## Dependencies

- `fs` (writeFileSync, mkdirSync, existsSync), `path` (join)
- `./lib/sources/wahapedia` — `fetchAndProcessWahapedia`

## Contracts

- Output directory: `../client/public/wahapedia` (relative to script location)
- Each file written as `{name}.json` with `JSON.stringify(rows)` (no pretty-printing)
- No R2, no ID mapping — raw Wahapedia data only (ID mapping happens server-side in the Worker sync pipeline)
