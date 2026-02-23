# Deployment Guide — tabletop-tools.net

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

Then in Cloudflare dashboard → Workers & Pages → `tabletop-tools-auth` → Settings → Triggers:
- Add custom domain: `auth.tabletop-tools.net`

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

No custom domains needed on the server Workers — the client Pages Functions reach them via service bindings.

---

## Step 8: Deploy each client to Cloudflare Pages

```bash
cd apps/<app>/client
pnpm build                  # builds with .env.production baked in
wrangler pages deploy dist  # first run creates the Pages project
```

After the first deploy of each app, go to Cloudflare dashboard → Pages project → Custom domains and add:

| App | Custom domain |
|---|---|
| no-cheat | `no-cheat.tabletop-tools.net` |
| tournament | `tournament.tabletop-tools.net` |
| versus | `versus.tabletop-tools.net` |
| list-builder | `list-builder.tabletop-tools.net` |
| game-tracker | `game-tracker.tabletop-tools.net` |
| new-meta | `new-meta.tabletop-tools.net` |

Cloudflare Pages handles SSL certificates automatically for each subdomain.

---

## Step 9: Service bindings

The service bindings in each `client/wrangler.toml` activate automatically once both the Worker and the Pages project exist in the same Cloudflare account. No additional configuration needed.

Each client's `functions/trpc/[[path]].ts` proxies `/trpc/*` requests to the corresponding Worker via the `API` binding.

---

## Redeployment

After code changes:

```bash
# Redeploy a server Worker
cd apps/<app>/server && wrangler deploy

# Redeploy a client Pages project
cd apps/<app>/client && pnpm build && wrangler pages deploy dist
```

Secrets only need to be set once — they persist across deployments.

---

## BSData (versus / list-builder)

These two apps use `NullAdapter` in production until the operator provides BSData:

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
