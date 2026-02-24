# CLAUDE.md — data-import

> Read SOUL.md first. Every decision here flows from it.
> Read the root CLAUDE.md for platform-wide conventions (stack, design system, TDD rules).

---

## What data-import Is

data-import is a client-only SPA that fetches BSData XML from GitHub, parses it in the
browser, and stores `UnitProfile[]` in IndexedDB. No server, no Worker, no auth required.

Other apps (versus, list-builder) read from the same IndexedDB store. This is the primary
way game data enters the platform without committing GW content to the repository.

---

## Current State

| Layer | Status |
|---|---|
| Client (React + Vite) | ✅ built + tested (17 tests) |
| IndexedDB store (game-data-store) | ✅ shared package |
| BSData parser (game-content) | ✅ shared package |
| Server | None — client-only SPA |
| Deployment | ✅ Deployed to tabletop-tools.net/data-import/ via gateway |

---

## Architecture

```
apps/data-import/
  client/
    src/
      App.tsx                  ← renders ImportScreen
      main.tsx                 ← Vite entry
      pages/
        ImportScreen.tsx       ← all UI: source config, catalog list, import, stored data
        ImportScreen.test.tsx
      lib/
        github.ts             ← listCatalogFiles() + fetchCatalogXml() — GitHub API
        github.test.ts
      test/
        setup.ts              ← fake-indexeddb/auto
```

**No server directory.** This app has no tRPC router, no Hono server, no Worker.

### Data Flow

1. User enters repo + branch (defaults: `BSData/wh40k-10e`, `main`)
2. `listCatalogFiles()` hits GitHub API → returns `.cat` file list with faction names + sizes
3. User selects factions, clicks Import
4. For each catalog: `fetchCatalogXml()` → `parseBSDataXml()` → `saveUnits()` to IndexedDB
5. `setImportMeta()` records timestamp, faction count, unit count
6. Consumer apps call `searchUnits()` / `listFactions()` from `@tabletop-tools/game-data-store`

### Key Dependencies

- `@tabletop-tools/game-content/src/adapters/bsdata/parser` — BSData XML parser
  (import from this path directly, NOT the barrel export — barrel pulls in BSDataAdapter
  which uses Node APIs and breaks the Vite browser build)
- `@tabletop-tools/game-data-store` — IndexedDB CRUD (saveUnits, searchUnits, listFactions, clearAll, etc.)

---

## Testing

```bash
cd apps/data-import/client && pnpm test
```

17 tests covering:
- GitHub API helpers (catalog listing, XML fetching)
- ImportScreen rendering and user interactions
- IndexedDB integration via fake-indexeddb

Test setup requires `fake-indexeddb/auto` in `src/test/setup.ts`.

### E2E Browser Tests

Playwright tests in `e2e/specs/data-import.spec.ts` (public project — no auth):
- App loads without auth gate
- Repo input defaults to `BSData/wh40k-10e`
- Branch input defaults to `main`
- Load Catalog List button present
