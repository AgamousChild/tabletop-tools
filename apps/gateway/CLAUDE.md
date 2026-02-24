# CLAUDE.md — gateway

> Read the root CLAUDE.md for platform-wide conventions.
> Read docs/deployment.md for the full deployment guide.

---

## What gateway Is

The gateway is the unified Cloudflare Pages project that serves the entire platform from
a single origin: `tabletop-tools.net`. It is not an app — it is deployment infrastructure.

It builds all 7 client SPAs + the landing page into one `dist/` directory, deploys them as
a single Cloudflare Pages project, and uses Pages Functions to proxy tRPC requests to each
app's Worker via service bindings.

---

## Current State

| Layer | Status |
|---|---|
| Landing page | ✅ static HTML at landing/index.html — 7 app cards |
| Build script | ✅ build.sh — builds 7 client SPAs into dist/ |
| SPA redirects | ✅ _redirects — 7 rules (one per app) |
| Pages Functions (tRPC proxy) | ✅ 6 functions — one per server app |
| Service bindings (wrangler.toml) | ✅ 6 bindings to app Workers |
| Deployment | ✅ Deployed to tabletop-tools.net |

---

## Structure

```
apps/gateway/
  build.sh              ← builds all 7 client SPAs into dist/
  _redirects            ← Cloudflare Pages SPA fallback rules (7 entries)
  wrangler.toml         ← Pages project config + 6 service bindings
  landing/
    index.html          ← landing page with 7 app cards
  functions/
    no-cheat/trpc/[[path]].ts      ← proxy → tabletop-tools-no-cheat Worker
    versus/trpc/[[path]].ts        ← proxy → tabletop-tools-versus Worker
    list-builder/trpc/[[path]].ts  ← proxy → tabletop-tools-list-builder Worker
    game-tracker/trpc/[[path]].ts  ← proxy → tabletop-tools-game-tracker Worker
    tournament/trpc/[[path]].ts    ← proxy → tabletop-tools-tournament Worker
    new-meta/trpc/[[path]].ts      ← proxy → tabletop-tools-new-meta Worker
  dist/                 ← build output (not committed)
```

### How tRPC Proxying Works

Each Pages Function strips the app prefix from the URL path and forwards the request
to the bound Worker via `context.env.<BINDING>.fetch()`. Example for no-cheat:

```typescript
// functions/no-cheat/trpc/[[path]].ts
const url = new URL(context.request.url)
url.pathname = url.pathname.replace(/^\/no-cheat/, '')
return context.env.NO_CHEAT_API.fetch(new Request(url.toString(), context.request))
```

**data-import has no Pages Function** — it's client-only with no server Worker.

### Service Bindings (wrangler.toml)

| Binding | Worker |
|---|---|
| NO_CHEAT_API | tabletop-tools-no-cheat |
| VERSUS_API | tabletop-tools-versus |
| LIST_BUILDER_API | tabletop-tools-list-builder |
| GAME_TRACKER_API | tabletop-tools-game-tracker |
| TOURNAMENT_API | tabletop-tools-tournament |
| NEW_META_API | tabletop-tools-new-meta |

### _redirects

One rule per SPA app. Required for client-side routing (React Router, etc.) to work
on page refresh. Without these, deep links return 404.

### build.sh

Iterates over all 7 apps, runs `pnpm build` in each `client/` directory, copies the
output to `dist/<app>/`. Also copies landing page and _redirects.

---

## Deploying

```bash
# Full gateway redeploy (build + deploy)
bash scripts/deploy-gateway.sh

# Or manually:
cd apps/gateway && bash build.sh
wrangler pages deploy dist --project-name tabletop-tools
```

Custom domain `tabletop-tools.net` is configured in Cloudflare Pages dashboard.

---

## No Tests

The gateway has no unit tests. It is deployment infrastructure (static HTML, shell script,
Cloudflare Pages Functions). Correctness is verified by E2E browser tests and the
verification script:

```bash
bash scripts/verify-deployment.sh
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test
```
