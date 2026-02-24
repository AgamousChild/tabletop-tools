# CLAUDE.md — gateway

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The gateway is the unified Cloudflare Pages project that serves the entire platform from
a single origin: `tabletop-tools.net`. It is not an app -- it is deployment infrastructure.

Builds all 8 client SPAs + the landing page into one `dist/` directory, deploys them as
a single Cloudflare Pages project, and uses Pages Functions to proxy tRPC requests to each
app's Worker via service bindings.

---

## Structure

```
apps/gateway/
  build.sh              <- builds all 8 client SPAs into dist/ (set -e, validates outputs)
  _redirects            <- Cloudflare Pages SPA fallback rules (8 entries)
  wrangler.toml         <- Pages project config + 7 service bindings
  landing/
    index.html          <- landing page with 8 app cards
  functions/
    no-cheat/trpc/[[path]].ts      <- proxy -> tabletop-tools-no-cheat Worker
    versus/trpc/[[path]].ts        <- proxy -> tabletop-tools-versus Worker
    list-builder/trpc/[[path]].ts  <- proxy -> tabletop-tools-list-builder Worker
    game-tracker/trpc/[[path]].ts  <- proxy -> tabletop-tools-game-tracker Worker
    tournament/trpc/[[path]].ts    <- proxy -> tabletop-tools-tournament Worker
    new-meta/trpc/[[path]].ts      <- proxy -> tabletop-tools-new-meta Worker
    admin/trpc/[[path]].ts         <- proxy -> tabletop-tools-admin Worker
  dist/                 <- build output (not committed)
```

### How tRPC Proxying Works

Each Pages Function strips the app prefix from the URL path and forwards to the bound Worker.
Error handling returns structured JSON on Worker failure (503 with `{ error: { message } }`).

**data-import has no Pages Function** -- it's client-only with no server Worker.

### Service Bindings (wrangler.toml)

| Binding | Worker |
|---|---|
| NO_CHEAT_API | tabletop-tools-no-cheat |
| VERSUS_API | tabletop-tools-versus |
| LIST_BUILDER_API | tabletop-tools-list-builder |
| GAME_TRACKER_API | tabletop-tools-game-tracker |
| TOURNAMENT_API | tabletop-tools-tournament |
| NEW_META_API | tabletop-tools-new-meta |
| ADMIN_API | tabletop-tools-admin |

### build.sh

Exits on first failure (`set -e`), validates all `dist/<app>/index.html` outputs exist before
deployment proceeds.

---

## Deploying

```bash
# Full gateway redeploy (build + deploy)
bash scripts/deploy-gateway.sh

# Or manually:
cd apps/gateway && bash build.sh
wrangler pages deploy dist --project-name tabletop-tools
```

---

## No Unit Tests

The gateway has no unit tests. Correctness is verified by E2E browser tests and the
verification script:

```bash
bash scripts/verify-deployment.sh
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test
```
