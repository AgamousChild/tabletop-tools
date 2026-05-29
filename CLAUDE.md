# CLAUDE.md — Tabletop Tools Platform

> Read SOUL.md first. Every decision here flows from it.

---

## What This Platform Is

Tabletop Tools is a monorepo of tools for tabletop miniature wargamers. One login. Shared UI.
Each app deploys independently and does exactly one thing.

Each app has its own `CLAUDE.md` with architecture and implementation detail.

---

## Project Rules

### 1. One data source per entity
Don't build parallel implementations of the same data for different apps. If units exist in one
store, every app reads from that store. No copies, no sync, no "this app's version."

### 2. Shared UI components
Same card, same widget across all apps. If the brain app has a unit card, versus uses the same
component. Build once in `packages/ui`, import everywhere.

### 3. DRY across app boundaries
If two app servers have similar logic, extract it to a shared package. Similar functions in
different apps is a bug, not a pattern.

### 4. Everything is a callable function
No standalone scripts. Build as an importable module first, then wrap it for CLI, cron, or API.
Every data process, cleanup, and setup is a repeatable function callable from the server layer.

### 5. 11th edition is the target
New features, rules parsing, and game logic target 11th edition. 10th edition data stays for
historical meta analytics but is not the development target.

### 6. Data lives in datastores, not source code
No hardcoded lookup tables in `.ts` files. Faction maps, detachment lists, source registries —
all go in the database (or other datastore). Code reads from data, doesn't contain data.

### 7. No test data in production
No hardcoded test users, tokens, or secrets in source code. Test infrastructure uses isolated
environments only. E2E tests clean up after themselves. No test setup function can touch prod.

### 8. Skinnable UI
Separate data/logic from presentation. Components take props and render. Hooks and state
management handle what to show. Swapping the component layer gives you a new skin without
touching logic.

### 9. Tournament and meta analytics share one data model
A tournament you run and a tournament scraped from BCP are the same thing in the database.
One set of tables for events, players, pairings, results. No import/export pipeline between apps.

### 10. One canonical entity registry
Factions, subfactions, detachments — one set of tables, queried by everything. No app maintains
its own lookup map. If the registry needs a new entry, it goes in the database.

---

## Data Boundary

**No GW (Games Workshop) content is ever committed to this repository.**

Unit profiles, weapon stats, ability text, and faction data are loaded at runtime from community
sources (BSData, Wahapedia). Nothing from GW lands in committed source files or the DB schema.
The `GameContentDisclaimer` component surfaces the data source to users.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Front to back, no exceptions |
| API | tRPC + Zod | Type-safe end-to-end, no REST boilerplate |
| UI | React | Clean, uncluttered |
| Database | Turso (libSQL/SQLite) | Edge-compatible, lean |
| ORM | Drizzle | Lightweight, type-safe, SQLite-native |
| Auth | Better Auth | TypeScript-first, self-hosted |
| Deploy | Cloudflare Workers + Pages | Free tier, near-zero cost |

---

## Testing

**TDD for logic, algorithms, and routers.** Write the test first, confirm it fails, implement,
confirm it passes.

**Exception:** exploratory work (scrapers, pipelines, graph builders) — test after the shape
stabilizes, not before.

**Real dependencies in tests.** In-memory SQLite, real functions. Only mock external APIs and
system boundaries (network calls, subprocesses). A mock that passes while the real thing fails
is worse than no test.

---

## Code Quality

**Prettier** for formatting. **ESLint + oxlint** for code rules. **TypeScript strict** for
type safety. **Pre-commit hooks** run all three — code that doesn't pass doesn't land.

---

## Rules for Every Session

- Scope before you start — understand what you're touching and what depends on it.
- No features that aren't needed yet.
- Validate statistically before claiming anything.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.
- Never duplicate functions. If a utility exists, import it.
- Don't try to prove you're right. State your reasoning once, briefly; then defer or verify. Don't re-litigate, justify, or argue the point.
- If you need to verify something, write a test. Don't run throwaway/ad-hoc checks to make a point, and don't ask permission to test — just write the test.
- Follow the process all the way through. When you change data, rebuild the dependent indexes/derived artifacts in the same pass — never leave "data updated, indexes stale" or bad data comes through.
