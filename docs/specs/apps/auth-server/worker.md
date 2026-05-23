# apps/auth-server/src/worker.ts

> Cloudflare Worker entry — production auth server with CORS lockdown and module-scope caching.

## Prompt

Cloudflare Worker module that serves Better Auth's HTTP handler via Hono. NOT a tRPC app. Uses module-scope caching (`let cachedApp: Hono | null = null`) to create the Turso client, Drizzle DB, and Hono app once per Worker isolate lifetime.

On first request, create the app:
1. Create Turso client with `createClient({ url, authToken })` from `@libsql/client/web`
2. Wrap with `createDbFromClient(client)` from packages/db
3. Parse `TRUSTED_ORIGINS` env var (comma-separated) into array, default to `['https://tabletop-tools.net']`
4. Create auth instance with `createAuth(db, AUTH_BASE_URL, allowedOrigins, AUTH_SECRET, '/auth/api/auth')` — note the explicit basePath for Workers Route
5. Create Hono app with CORS middleware (whitelist-only: origin must be in allowedOrigins, credentials enabled)
6. `GET /auth/health` → `{ status: 'ok' }`
7. `GET|POST /auth/api/auth/**` → `auth.handler(c.req.raw)` — pass the raw Request to Better Auth
8. Cache in `cachedApp`

Subsequent requests just call `cachedApp.fetch(request, env)`.

## Dependencies

- `@libsql/client/web` — `createClient`
- `@tabletop-tools/auth` — `createAuth`
- `@tabletop-tools/db` — `createDbFromClient`
- `hono`, `hono/cors`

## Contracts

- Env: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_BASE_URL`, `TRUSTED_ORIGINS`
- basePath `/auth/api/auth` matches Workers Route `tabletop-tools.net/auth/*`
- No URL rewriting — request passed to auth.handler untouched
- CORS is whitelist-only (not wildcard) with credentials
