# apps/auth-server/src/index.ts

> Node.js dev server — local auth server on port 3000.

## Prompt

Local development version of the auth server. Loads env vars from `dotenv/config`. Creates Turso client with `TURSO_DB_URL` (default `file:./dev.db`) and optional `TURSO_AUTH_TOKEN`. Creates Drizzle DB, auth instance, and Hono app at module scope (no lazy caching needed for dev).

Trusted origins default to localhost ports 5173-5178 (one per app's Vite dev server). CORS middleware uses whitelist-only pattern (same as worker.ts).

Auth routes at `GET|POST /api/auth/**` (default basePath, no `/auth` prefix in dev). Health check at `GET /health`.

Serve with `@hono/node-server` on port 3000, hostname `0.0.0.0`.

## Dependencies

- `dotenv/config`
- `@hono/node-server` — `serve`
- `@tabletop-tools/auth` — `createAuth`
- `@tabletop-tools/db` — `createDb`
- `hono`, `hono/cors`

## Contracts

- Port 3000 (hardcoded)
- basePath difference: dev uses default `/api/auth`, prod uses `/auth/api/auth`
- `AUTH_BASE_URL` default: `http://localhost:3000`
- No module-scope caching needed (Node.js process is long-lived)
