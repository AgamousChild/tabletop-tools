# CLAUDE.md -- packages/game-content

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The data boundary package. Defines the `GameContentAdapter` interface and all implementations
for loading unit/weapon/faction data at runtime. Zero GW content is ever committed -- data comes
from BSData XML files loaded at startup, tournament CSV imports, or the NullAdapter (dev/test).

Also provides:
- **`createUnitRouter()`** — shared tRPC router factory for unit listing/search/get (used by versus and list-builder)
- **Tournament CSV parsers** — BCP, Tabletop Admiral, and generic CSV formats

This package is used by:
- **Server apps** (versus, list-builder, new-meta, tournament): load game data via adapter at startup
- **data-import client**: imports `parseBSDataXml` directly from the BSData parser (not via barrel export -- barrel pulls in Node APIs)

---

## File Structure

```
packages/game-content/
  src/
    types.ts                              <- GameContentAdapter, UnitProfile, WeaponProfile, WeaponAbility, TournamentRecord, etc.
    index.ts                              <- barrel export (DO NOT import in data-import client)
    routers/
      unit.ts                             <- createUnitRouter() factory (10 tests)
      unit.test.ts
    adapters/
      null/
        index.ts                          <- NullAdapter (empty results, no deps)
      bsdata/
        index.ts                          <- BSDataAdapter (reads XML from disk)
        loader.ts                         <- file discovery + read
        loader.test.ts                    <- 13 tests
        parser.ts                         <- XML -> UnitProfile[] extraction (stack-based for nested entries)
        parser.test.ts                    <- 16 tests
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

// Unit router factory
export { createUnitRouter } from './routers/unit'
```

### Import Paths

- **Server apps:** `import { GameContentAdapter, BSDataAdapter, NullAdapter, createUnitRouter } from '@tabletop-tools/game-content'`
- **data-import client:** `import { parseBSDataXml } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'` (direct path -- barrel export pulls in Node APIs via BSDataAdapter)

---

## createUnitRouter Factory

The factory creates its own `initTRPC` instance with a minimal context type (`UnitRouterContext`)
and returns a complete router with `listFactions`, `search`, and `get` procedures. It takes
**no arguments** -- the internal tRPC instance preserves full type inference.

```typescript
// packages/game-content/src/routers/unit.ts
type UnitRouterContext = {
  user: { id: string; email: string; name: string } | null
  gameContent: GameContentAdapter
}

const t = initTRPC.context<UnitRouterContext>().create()

export function createUnitRouter() {
  return t.router({
    listFactions: protectedProcedure.query(({ ctx }) => ctx.gameContent.listFactions()),
    search: protectedProcedure
      .input(z.object({ faction: z.string().optional(), query: z.string().optional() }))
      .query(({ ctx, input }) => ctx.gameContent.searchUnits({ faction: input.faction, name: input.query })),
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ ctx, input }) => /* returns unit or throws NOT_FOUND */),
  })
}
```

Apps use it as:
```typescript
import { createUnitRouter } from '@tabletop-tools/game-content'
export const appRouter = router({
  unit: createUnitRouter(),
  // ... app-specific routers
})
```

The app's tRPC context must include `user` and `gameContent` fields. tRPC handles
cross-instance router composition at runtime.

---

## BSData Parser

The parser (`src/adapters/bsdata/parser.ts`) uses a **stack-based approach** for extracting
nested `<selectionEntry>` elements:

1. Collects all open (`<selectionEntry`) and close (`</selectionEntry>`) tag positions
2. Sorts tags by document order
3. Uses a stack to match pairs -- push on open, pop on close
4. Only emits top-level entries (depth 1), correctly handling arbitrary nesting

Profile and characteristic extraction uses regex (safe since these don't nest).

---

## Testing

**79 tests** across 6 test files:

| File | Tests | What it covers |
|---|---|---|
| `routers/unit.test.ts` | 10 | listFactions, search (by faction/query/both/neither), get (happy/NOT_FOUND/auth) |
| `adapters/bsdata/parser.test.ts` | 16 | XML parsing: units, weapons, abilities, factions, nested entries, edge cases |
| `adapters/bsdata/loader.test.ts` | 13 | File discovery, .cat/.gst loading, error handling |
| `adapters/tournament-import/bcp-csv/parser.test.ts` | 13 | BCP CSV format parsing |
| `adapters/tournament-import/tabletop-admiral-csv/parser.test.ts` | 12 | Tabletop Admiral CSV format parsing |
| `adapters/tournament-import/generic-csv/parser.test.ts` | 15 | Generic CSV format parsing |

```bash
cd packages/game-content && pnpm test
```
