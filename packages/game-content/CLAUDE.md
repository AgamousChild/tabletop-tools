# CLAUDE.md -- packages/game-content

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The data boundary package. Defines the `GameContentAdapter` interface and all implementations
for loading unit/weapon/faction data at runtime. Zero GW content is ever committed -- data comes
from BSData XML files loaded at startup, tournament CSV imports, or the NullAdapter (dev/test).

Also provides:
- **Tournament CSV parsers** — BCP, Tabletop Admiral, and generic CSV formats

This package is used by:
- **Server apps** (new-meta, tournament): tournament CSV import at server side
- **data-import client**: imports `parseBSDataXml` directly from the BSData parser (not via barrel export -- barrel pulls in Node APIs)

Note: versus and list-builder no longer use this package server-side — all game data comes from
client-side IndexedDB (via `@tabletop-tools/game-data-store`).

---

## File Structure

```
packages/game-content/
  src/
    types.ts                              <- GameContentAdapter, UnitProfile, WeaponProfile, WeaponAbility, TournamentRecord, etc.
    index.ts                              <- barrel export (DO NOT import in data-import client)
    adapters/
      null/
        index.ts                          <- NullAdapter (empty results, no deps)
      bsdata/
        index.ts                          <- BSDataAdapter (reads XML from disk)
        loader.ts                         <- file discovery + read
        loader.test.ts                    <- 14 tests
        parser.ts                         <- XML -> UnitProfile[] extraction (stack-based for nested entries)
        parser.test.ts                    <- 54 tests
      tournament-import/
        index.ts                          <- TournamentImportAdapter + parser re-exports
        bcp-csv/
          parser.ts                       <- 13 tests
          parser.test.ts
        tabletop-admiral-csv/
          parser.ts                       <- 12 tests
          parser.test.ts
        generic-csv/
          parser.ts                       <- 15 tests
          parser.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Exports

```typescript
// Types
export type { GameContentAdapter, UnitProfile, WeaponProfile, WeaponAbility }
export type { TournamentDataAdapter, TournamentImportFormat, TournamentRecord, TournamentPlayer, UnitResult }
export type { BSDataAdapterOptions, ParseResult }
export type { BcpCsvOptions, TabletopAdmiralCsvOptions }

// Adapters
export { NullAdapter } from './adapters/null'
export { BSDataAdapter, parseBSDataXml } from './adapters/bsdata'

// Tournament import
export { TournamentImportAdapter, parseBcpCsv, parseTabletopAdmiralCsv, parseGenericCsv }
  from './adapters/tournament-import'
```

### Import Paths

- **Server apps:** `import { BSDataAdapter, NullAdapter } from '@tabletop-tools/game-content'`
- **data-import client:** `import { parseBSDataXml } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'` (direct path -- barrel export pulls in Node APIs via BSDataAdapter)

---

## BSData Parser

The parser (`src/adapters/bsdata/parser.ts`) uses a **stack-based approach** for extracting
`<selectionEntry>` elements:

1. Collects all open (`<selectionEntry`) and close (`</selectionEntry>`) tag positions
2. Sorts tags by document order
3. Uses a stack to match pairs -- push on open, pop on close
4. Only emits entries opened at depth 0 (stack empty) -- nested models inside units are excluded
5. Strips nested `<selectionEntry>` XML from the body before returning, so `extractWeapons()`
   only finds the outer unit's own weapons (no duplicate weapons from sub-models)

Top-level `type="model"` entries (standalone characters) ARE kept. Only `type="model"` entries
nested within a `type="unit"` parent are excluded.

Profile and characteristic extraction uses regex (safe since these don't nest).

---

## Testing

**108 tests** across 5 test files:

| File | Tests | What it covers |
|---|---|---|
| `adapters/bsdata/parser.test.ts` | 54 | XML parsing: units, weapons, abilities, nested model exclusion, top-level models, edge cases |
| `adapters/bsdata/loader.test.ts` | 14 | File discovery, .cat/.gst loading, nested model filtering, error handling |
| `adapters/tournament-import/bcp-csv/parser.test.ts` | 13 | BCP CSV format parsing |
| `adapters/tournament-import/tabletop-admiral-csv/parser.test.ts` | 12 | Tabletop Admiral CSV format parsing |
| `adapters/tournament-import/generic-csv/parser.test.ts` | 15 | Generic CSV format parsing |

```bash
cd packages/game-content && pnpm test
```
