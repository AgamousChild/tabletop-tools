# @tabletop-tools/game-content

## Legal Boundary

This package defines the architectural boundary between platform software and
third-party game content.

**The platform ships zero GW content.**

- `types.ts` — TypeScript interfaces only. No GW data.
- `adapters/null/` — A null adapter (returns empty results). Safe default.
- `adapters/bsdata/` — Parses BSData XML files the **operator** supplies.
  The operator clones BSData themselves; this package only provides the parser.
- `adapters/tournament-import/` — Parsers for common tournament result CSV formats.
  The operator exports/obtains the CSV; this package only parses it.

## Usage

```typescript
import { BSDataAdapter, NullAdapter } from '@tabletop-tools/game-content'

// With BSData (operator must provide BSDATA_DIR)
const gameContent = new BSDataAdapter({ dataDir: process.env['BSDATA_DIR'] ?? '' })
await gameContent.load()

// Without BSData (graceful degradation)
const gameContent = new NullAdapter()
```

## Environment Variable

```
BSDATA_DIR=/path/to/your/bsdata-clone/wh40k-10e
```

If not set (or set to an empty string), the server uses `NullAdapter` and unit searches
return empty arrays. The server starts normally — no crash on missing content.

## No GW Content in This Package

Tests use synthetic fixture data (e.g. "Iron Warriors" with made-up stats). No real
GW unit names, weapon profiles, or ability text appear in this codebase.
