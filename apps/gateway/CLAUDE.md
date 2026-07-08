# CLAUDE.md — gateway

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The gateway is the unified Cloudflare Pages project that serves the entire platform from
a single origin: `tabletop-tools.net`. It is not an app -- it is deployment infrastructure.

Builds every client SPA + the landing page into one `dist/` directory, deploys them as
a single Cloudflare Pages project, and uses Pages Functions to proxy API requests to each
app's Worker via service bindings.

## The App Roster Lives in apps.json

**`apps/gateway/apps.json` is the single source of truth for which apps exist,
which have backend Workers, and what appears on the landing page.** Do not
restate the roster (or counts derived from it) here, in scripts, or in other
docs — that pattern drifted three times before the manifest existed (see
`wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md`).

Per manifest entry:

- `slug` — URL prefix and `apps/<slug>/client` directory name.
- `hasBackend` — whether a server Worker exists (drives a `[[services]]`
  binding, a proxy function, and inclusion in `scripts/deploy-workers.sh`).
- `envKey` / `stripPrefix` — parameters for the proxy handler (see below).
- `apiSegment` — set to `"api"` for non-tRPC (Hono/REST) backends like brain
  and data-import; absent means the standard `/trpc` convention.
- `showOnLanding`, `title`, `description` — landing-page card content,
  rendered at build time by `render-landing.mjs`.

Consumers: `build.sh` (build + validation loops, wrangler.toml drift check),
`render-landing.mjs` (landing cards), `scripts/verify-deployment.sh`,
`scripts/deploy-workers.sh`, `e2e/specs/landing.spec.ts`.

**Adding an app** means: one entry in `apps.json`, one `_redirects` line, and —
if it has a backend — one `[[services]]` binding in `wrangler.toml` plus one
proxy function (see below). `wrangler.toml` cannot be generated (Wrangler has
no include mechanism); `build.sh` fails if its binding count disagrees with
the manifest.

## Structure

```
apps/gateway/
  apps.json             <- THE app roster manifest (see above)
  build.sh              <- builds every client SPA into dist/ (set -e, validates outputs)
  render-landing.mjs    <- renders landing/index.html cards + version from apps.json
  _redirects            <- Cloudflare Pages SPA fallback rules (one per app)
  wrangler.toml         <- Pages project config + service bindings (hand-maintained,
                           drift-checked against apps.json by build.sh)
  landing/
    index.html          <- landing page template (<!--CARDS--> filled at build time)
  functions/
    _lib/proxy.ts       <- createProxyHandler({envKey, stripPrefix}) factory
    <app>/trpc/[[path]].ts   <- 3-line proxy per tRPC app
    <app>/api/[[path]].ts    <- 3-line proxy per REST app (brain, data-import)
  dist/                 <- build output (not committed)
```

### How API Proxying Works

Every proxy function is a thin call to `createProxyHandler` in
`functions/_lib/proxy.ts`: it strips the app's URL prefix and forwards to the
Worker bound at `envKey`. On a thrown fetch error it returns a 503 JSON
envelope `{ error: { message: 'Service unavailable', binding } }` and logs the
binding name via `console.error` (visible in `wrangler pages deployment tail`),
so a down backend is identifiable from the response and the log.

Service bindings live in `wrangler.toml`; each binds `<ENV_KEY>` to the
`tabletop-tools-<slug>` Worker for every `hasBackend: true` app in `apps.json`.

### auth-server Is the One Intentional Exception

`apps/auth-server` does NOT route through the gateway: it binds a direct zone
route (`tabletop-tools.net/auth/*` — see `apps/auth-server/wrangler.toml`) so
that login keeps working even when the Pages project/gateway is down. Every
other backend Worker is reachable only through the gateway's service bindings.
This is a deliberate topology decision (D2-02), not drift — do not "fix" it by
folding auth into the gateway.

---

## Deploying

```bash
# Full gateway redeploy (build + deploy + mandatory CDN cache purge)
bash scripts/deploy-gateway.sh

# Or manually:
cd apps/gateway && bash build.sh
wrangler pages deploy dist --project-name tabletop-tools
```

`deploy-gateway.sh` refuses to run without `CF_ZONE_ID` and
`CLOUDFLARE_API_TOKEN` — a deploy without a cache purge serves stale bundles
(documented incident class; see root CLAUDE.md "Environment + Operational
Gotchas").

Backend Workers deploy separately: `bash scripts/deploy-workers.sh` (loops the
manifest's `hasBackend` apps).

---

## No Unit Tests

The gateway has no unit tests. Correctness is verified by E2E browser tests and the
verification script:

```bash
bash scripts/verify-deployment.sh
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test
```
