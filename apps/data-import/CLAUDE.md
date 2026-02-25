# CLAUDE.md — data-import

> Read the root CLAUDE.md for platform-wide conventions.

---

## What data-import Is

data-import is a client-only SPA that fetches BSData XML from GitHub, parses it in the
browser, and stores `UnitProfile[]` in IndexedDB. No server, no Worker, no auth required.

Other apps (versus, list-builder) read from the same IndexedDB store.

---

## Architecture

```
apps/data-import/
  client/
    src/
      App.tsx                  <- renders ImportScreen
      main.tsx                 <- Vite entry (renderApp from packages/ui)
      pages/
        ImportScreen.tsx       <- all UI: source config, catalog list, import, stored data
        ImportScreen.test.tsx
      lib/
        github.ts             <- listCatalogFiles() + fetchCatalogXml() with rate limit handling
        github.test.ts
      test/
        setup.ts              <- fake-indexeddb/auto
```

**No server directory.** This app has no tRPC router, no Hono server, no Worker.

### Data Flow

1. User enters repo + branch (defaults: `BSData/wh40k-10e`, `main`)
2. `listCatalogFiles()` hits GitHub API -> returns `.cat` file list with rate limit info
3. User selects factions, clicks Import
4. For each catalog: `fetchCatalogXml()` -> `parseBSDataXml()` -> `saveUnits()` to IndexedDB
5. Per-faction status tracking (pending/importing/success/failed) with "Retry Failed" support
6. `setImportMeta()` records timestamp, faction count, unit count
7. Consumer apps call `searchUnits()` / `listFactions()` from `@tabletop-tools/game-data-store`

### Key Dependencies

- `@tabletop-tools/game-content/src/adapters/bsdata/parser` -- BSData XML parser
  (import from this path directly, NOT the barrel export)
- `@tabletop-tools/game-data-store` -- IndexedDB CRUD
- `@tabletop-tools/ui` -- renderApp, Tailwind preset

### Rate Limiting

GitHub's unauthenticated API limit is 60 req/hour. `listCatalogFiles()` parses
`X-RateLimit-Remaining` and `X-RateLimit-Reset` headers, returns `RateLimitInfo` alongside
catalog data, and throws `RateLimitError` on 403. UI shows warnings when approaching limit.

---

## Testing

**21 tests**, all passing.

```bash
cd apps/data-import/client && pnpm test
```

Covers: GitHub API helpers (rate limit parsing, catalog listing, XML fetching),
ImportScreen rendering and interactions, IndexedDB integration via fake-indexeddb.
