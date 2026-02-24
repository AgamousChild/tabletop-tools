# Deployment Guide — tabletop-tools.net

## Architecture

All 7 apps are served from a single origin: `tabletop-tools.net/<app>/`.

```
tabletop-tools.net/                → Landing page (hub)
tabletop-tools.net/no-cheat/      → no-cheat SPA
tabletop-tools.net/versus/        → versus SPA
tabletop-tools.net/list-builder/  → list-builder SPA
tabletop-tools.net/game-tracker/  → game-tracker SPA
tabletop-tools.net/tournament/    → tournament SPA
tabletop-tools.net/new-meta/      → new-meta SPA
tabletop-tools.net/data-import/   → data-import SPA (client-only, no server)
tabletop-tools.net/auth/*         → auth-server Worker (Workers Route)
```

**How it works:**
1. One unified Cloudflare Pages project (`tabletop-tools`) serves all static assets
2. Pages Functions proxy each app's `/trpc` calls to its Worker via service bindings
3. Auth-server Worker responds to `tabletop-tools.net/auth/*` via a Workers Route
4. All apps share one origin — enabling shared IndexedDB, localStorage, and auth cookies

---

## Prerequisites

- Cloudflare account with `tabletop-tools.net` added as a site
- Turso account at https://app.turso.tech/agamouschild
- Code pushed to `main` and building cleanly (`pnpm -r build`)

---

## Step 1: Install CLIs

```bash
npm install -g wrangler

# Turso CLI (Linux/macOS/WSL)
curl -sSfL https://get.tur.so/install.sh | bash
```

---

## Step 2: Authenticate

```bash
wrangler login      # opens browser → Cloudflare OAuth
turso auth login    # opens browser → Turso OAuth
```

---

## Step 3: Create Turso database

```bash
turso db create tabletop-tools --location lhr   # lhr = London; pick nearest region
turso db show tabletop-tools                     # note the LibSQL URL
turso db tokens create tabletop-tools            # create auth token — save this
```

The URL will look like: `libsql://tabletop-tools-agamouschild.turso.io`

---

## Step 4: Run the database migration

```bash
cd packages/db

# Create a local .env (not committed — used only for the migration run)
echo "TURSO_DB_URL=libsql://tabletop-tools-agamouschild.turso.io" > .env
echo "TURSO_AUTH_TOKEN=<your-token>" >> .env

pnpm exec drizzle-kit migrate
```

This applies both migration files:
- `0000_initial_auth.sql` — auth tables (users, sessions, accounts)
- `0001_great_leper_queen.sql` — all 16 app tables

---

## Step 5: Add tabletop-tools.net to Cloudflare

In the [Cloudflare dashboard](https://dash.cloudflare.com):
1. Add site → `tabletop-tools.net`
2. Follow the nameserver instructions at your domain registrar
3. Wait for DNS to propagate (usually minutes with Cloudflare)

---

## Step 6: Deploy the auth server Worker

```bash
cd apps/auth-server

# Generate a strong secret
openssl rand -hex 32   # copy this value

wrangler deploy

# Set secrets (never stored in wrangler.toml)
wrangler secret put AUTH_SECRET       # paste the openssl output
wrangler secret put TURSO_DB_URL      # libsql://tabletop-tools-agamouschild.turso.io
wrangler secret put TURSO_AUTH_TOKEN  # token from Step 3
```

The Workers Route `tabletop-tools.net/auth/*` is defined in `wrangler.toml` and deploys automatically.

**How auth routing works:** The auth Worker receives requests at `/auth/api/auth/**` via the Workers Route. Better Auth is configured with `basePath: '/auth/api/auth'` so it matches the incoming URL directly — no URL rewriting needed. The request is passed straight to `auth.handler(c.req.raw)`. The client's `VITE_AUTH_SERVER_URL=https://tabletop-tools.net/auth` causes the Better Auth client to send requests to `https://tabletop-tools.net/auth/api/auth/<route>`. In dev mode, the auth server runs at `localhost:3000` with the default basePath `/api/auth` — routes are at `/api/auth/**` directly.

---

## Step 7: Deploy each app server Worker

Repeat for each of the 6 app servers:

```bash
cd apps/<app>/server
wrangler deploy
wrangler secret put TURSO_DB_URL
wrangler secret put TURSO_AUTH_TOKEN
```

| App | Worker name |
|---|---|
| no-cheat | `tabletop-tools-no-cheat` |
| tournament | `tabletop-tools-tournament` |
| versus | `tabletop-tools-versus` |
| list-builder | `tabletop-tools-list-builder` |
| game-tracker | `tabletop-tools-game-tracker` |
| new-meta | `tabletop-tools-new-meta` |

No custom domains needed on the server Workers — the gateway Pages Functions reach them via service bindings.

---

## Step 8: Build and deploy the unified gateway

```bash
# Build all 7 app clients + landing page into apps/gateway/dist/
cd apps/gateway
bash build.sh

# Create the Pages project (first time only)
wrangler pages project create tabletop-tools --production-branch main

# Deploy
wrangler pages deploy dist --project-name tabletop-tools
```

After the first deploy, add the custom domain:

In Cloudflare dashboard → Pages → `tabletop-tools` → Custom domains → Add `tabletop-tools.net`

Cloudflare will create the necessary DNS records automatically (CNAME-flattened for the apex domain).

---

## Step 9: Verify

```bash
# Landing page
curl -sI "https://tabletop-tools.net/" | head -1

# Each app
for app in no-cheat versus list-builder game-tracker tournament new-meta data-import; do
  curl -sI "https://tabletop-tools.net/$app/" | head -1
done

# tRPC health (server apps only — data-import has no server)
for app in no-cheat versus list-builder game-tracker tournament new-meta; do
  curl -s "https://tabletop-tools.net/$app/trpc/health"
done

# Auth
curl -s "https://tabletop-tools.net/auth/health"
```

### E2E Browser Tests

The most thorough verification is the Playwright E2E suite:

```bash
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test
```

This runs 30+ browser tests across all apps — landing page, auth flows, cross-app
session sharing, and every app's main screen. If auth or any app is broken, these
tests surface it immediately.

**Known prerequisite:** Step 4 (database migration) must be completed before auth
tests will pass. Without the `user`, `session`, `account`, and `verification` tables
in Turso, signup/login returns 500.

---

## Redeployment

Repeatable scripts in `scripts/`:

```bash
# Full deployment (build + all workers + auth + gateway)
bash scripts/deploy-all.sh

# Just the gateway (client changes only)
bash scripts/deploy-gateway.sh

# Just the auth-server
bash scripts/deploy-auth.sh

# Just the app server Workers
bash scripts/deploy-workers.sh

# Verify everything is up
bash scripts/verify-deployment.sh

# Tear down old subdomains (after verifying new deployment works)
bash scripts/teardown-subdomains.sh
```

Or manually:

```bash
# Redeploy a server Worker
cd apps/<app>/server && wrangler deploy

# Redeploy the gateway (all clients)
cd apps/gateway && bash build.sh && wrangler pages deploy dist --project-name tabletop-tools
```

Secrets only need to be set once — they persist across deployments.

---

## BSData (data-import / versus / list-builder)

The **data-import** app is a client-only SPA that fetches BSData XML directly from GitHub,
parses it in the browser, and stores `UnitProfile[]` in IndexedDB. No server or Worker needed.
Consumer apps (versus, list-builder) check IndexedDB first — if units exist there, they use
them instead of the tRPC `unit.*` routes. This eliminates the need for server-side BSData loading.

The server-side apps still use `NullAdapter` in production until the operator provides BSData:

```bash
# Clone BSData locally
git clone https://github.com/BSData/wh40k-10e.git /path/to/bsdata

# Set the env var on the Worker
cd apps/versus/server
wrangler secret put BSDATA_DIR   # /path/to/bsdata — Workers can't read local FS
```

> **Note:** Cloudflare Workers cannot read from the local filesystem. For BSData in production, the operator must either bundle the data at build time or load it from R2/KV. This is a known open decision — the NullAdapter is the correct fallback until a proper BSData loading strategy is decided.

---

## Cloudflare R2 (game-tracker / no-cheat photo uploads)

Photo uploads require an R2 bucket:

```bash
# Create the bucket
wrangler r2 bucket create tabletop-tools-photos

# Add R2 binding to the relevant wrangler.toml files:
# [[r2_buckets]]
# binding = "PHOTOS"
# bucket_name = "tabletop-tools-photos"
```

This is not required for initial launch — no-cheat functions without photo storage (evidence photos are optional), and game-tracker turn photos are optional.
