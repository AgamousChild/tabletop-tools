# auth-server — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Central authentication Cloudflare Worker for the whole platform. Wraps Better
Auth's HTTP handler in Hono and exposes email/password sign-up, sign-in,
sign-out, and session endpoints at `tabletop-tools.net/auth/*`; every other
app validates cookies against the same Turso DB instead of running its own
auth (`apps/auth-server/CLAUDE.md:9-16`).

## Architecture

- Server-only, no client code — a thin Hono wrapper (`CLAUDE.md:13,88`).
- Two entry points:
  - `src/index.ts:1-49` — Node dev server (`@hono/node-server`, port 3000),
    Better Auth at `basePath: /api/auth`, `.env` via `dotenv/config`.
  - `src/worker.ts:1-56` — CF Worker entry, `basePath: '/auth/api/auth'`
    because the Workers Route delivers requests already prefixed with `/auth`
    (`worker.ts:35,48-49`, `wrangler.toml:15-17`).
- Actual auth logic lives entirely in `packages/auth/src/index.ts`:
  - `createAuth()` — Better Auth instance, Drizzle SQLite adapter over
    `authUsers`/`authSessions`/`authAccounts`/`authVerifications`, custom
    scrypt hashing, `username` plugin (`packages/auth/src/index.ts:111-142`).
  - scrypt `N=16384, r=8, p=1, dkLen=64` explicitly tuned to Cloudflare's CPU
    budget (`packages/auth/src/index.ts:14-16`; commit `e99b9ec` fixed CPU
    timeouts this way).
  - `validateSession()` — cookie parse (`__Secure-` prefix vs plain), HMAC via
    Web Crypto, DB lookup with expiry check (`index.ts:168-206`); consumed by
    `packages/server-core/src/server.ts:1,25` for all other apps.
- Worker-scope caching: `cachedApp` module singleton per isolate
  (`worker.ts:15,18-19,51`).
- **CORS quirk:** on origin mismatch it silently falls back to
  `allowedOrigins[0]` instead of rejecting (`worker.ts:41-45`; same in dev at
  `index.ts:36-37`) — reflects a fixed default origin rather than blocking.

## Data model

- Owns no schema; reads 4 Better-Auth tables in the shared
  `packages/db/src/schema.ts:20-81`. Migrations centralized in
  `packages/db/migrations/*.sql`.
- No JSON-blob columns or hardcoded lookups in this app's source — no Rule 6
  violation here. (The wider shared schema has many JSON-text columns —
  `boxesJson`, `weaponConfig`, `pipValues` — owned by other apps' domains;
  censused there.)
- Local dev DB `apps/auth-server/dev.db` per `.env.example:1`.

## API surface

Not tRPC (confirmed: no `@trpc/*` in `package.json:11-23`). Plain Hono/Better
Auth HTTP:

- Dev: `GET/POST /api/auth/**` (Better Auth catch-all), `GET /health`.
- Worker: `GET /auth/health`, `GET/POST /auth/api/auth/**`.
- No crons, no queues.

## Deploy

- Worker `tabletop-tools-auth`, entry `src/worker.ts`,
  `compatibility_date 2024-09-23`, `nodejs_compat`, route
  `tabletop-tools.net/auth/*` (`wrangler.toml:1-17`).
- Secrets out-of-band: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`.
  Plain vars: `AUTH_BASE_URL`, `TRUSTED_ORIGINS`.
- **Rule 9 risk: low** — single auth op per request, no batch loops. The
  scrypt tuning is the app's already-paid CPU-budget lesson.

## Shared-package usage

- Imports exactly `@tabletop-tools/auth` and `@tabletop-tools/db`
  (`package.json:12-14`). `validateSession` exists in one place and is reused
  by `server-core` — the intended Rule 3 pattern, no violation. Zero business
  logic in the app beyond CORS + mounting.

## CLAUDE.md drift

- **None in this app** — structure, basePaths, port, deploy commands, and the
  "no unit tests" claim all match source.
- **Adjacent drift (shared package):** `packages/db/CLAUDE.md` claims "22
  tables" with an ownership map missing `contentEntity`, meta-analytics cube
  tables, and pipeline-observability tables; `packages/db/src/schema.ts`
  defines ~45+ tables (`schema.ts:1206-1433`, `1116-1198`, `797-1016`). Stale
  doc in a dependency — flagged for the shared-packages census.

## Health signals

- No tests in-app by design; `packages/auth/src/auth.test.ts` (17 tests) +
  `e2e/specs/auth.spec.ts` + `e2e/specs/cross-app-auth.spec.ts` cover it.
- No TODO/FIXME in `apps/auth-server/src` or `packages/auth/src`.
- **Test-artifact litter:** 88 leftover `test-auth-*.db` files at
  `packages/auth/` root (2026-06→07) — the suite creates real SQLite files it
  never cleans up; conflicts with Rule 7's cleanup requirement.
- Error handling: `verifySignature`/`validateSession` fail closed (`null`).
  Minor gap: no try/catch around `createClient`/`createAuth` cold-start
  construction (`worker.ts:18-51`) — transient Turso failure → unhandled
  throw instead of a structured response.
- Committed `dist/` build output alongside source (`dist/index.js`,
  `dist/worker.js`) — gitignore status unverified.

## Candidate design decision points

1. **CORS posture** — fail-open-with-default-origin vs omit-header/403 on
   untrusted `Origin` (`worker.ts:41-45`). Easy to misread as unrestricted.
2. **Stateless session verification** — every app Worker round-trips Turso
   per authenticated request via `validateSession()`; alternative is a
   short-lived signed token (JWT-style) app Workers verify without DB. Real
   latency/cost tradeoff platform-wide.
3. **Auth tables share the platform DB** — one Turso DB, one connection pool
   for auth + everything else; an unrelated app's migration/connection issue
   can, in principle, take down auth. Separate auth DB is the alternative.
4. **No visible rate limiting on sign-in/sign-up** (`worker.ts:49`) — confirm
   Better Auth/Cloudflare coverage for brute-force or add an explicit layer.
5. **Committed `dist/` artifacts** — gitignore build output or keep?
6. **scrypt params sized for "hobby platform"** (`packages/auth/CLAUDE.md:51-53`)
   — revisit trigger if threat model outgrows hobby scale.
