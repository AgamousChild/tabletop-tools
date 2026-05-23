# apps/bcp-scraper/server/src/lib/list-parser.ts

> Entry point for army list parsing — format detection and dispatch.

## Prompt

Export `parseList(text: string): TTTPackage`. Detect the list format using `detectFormat()`, then dispatch to the appropriate parser:

- `'gw-app'` → `parseGwApp(text)`
- `'battlescribe'` → `parseBattleScribe(text)`
- `'html'` or `'unknown'` → return a failed TTTPackage with appropriate error message

Failed packages include: version=1, parsedWith identifying the detected format, parseStatus='failed', empty meta/list, rawSource in exports.

## Dependencies

- `./format-detector` — `detectFormat`
- `./gw-parser` — `parseGwApp`
- `./bs-parser` — `parseBattleScribe`
- `./ttt-types` — `TTTPackage`
