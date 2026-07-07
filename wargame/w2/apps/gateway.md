# gateway — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Not an app but deployment infrastructure: a single Cloudflare Pages project
serving all client SPAs from one origin (`tabletop-tools.net`) and proxying
each app's tRPC/API calls to its Worker via service bindings
(`apps/gateway/CLAUDE.md:9-14`).

## Architecture

- No server or client of its own: (1) `build.sh` assembles other apps' client
  builds into `dist/`; (2) Pages Functions proxy-forward requests.
- `build.sh:14-21` loops over **11 apps** (`no-cheat versus list-builder
  game-tracker tournament new-meta data-import admin brain study physics`),
  builds each client, copies dist. Landing page version-templated
  (`build.sh:23-25`); build validates every `dist/<app>/index.html`
  (`build.sh:31-42`).
- SPA fallback: `_redirects:1-11` — 11 path-prefix rules rewriting to each
  app's `index.html` (200).
- API proxying: 9 Pages Functions `functions/<app>/{trpc|api}/[[path]].ts`.
  Each strips its prefix and forwards via a bound `Fetcher`; on thrown error
  all return an identical 503 JSON envelope — **the same ~12-line block
  duplicated verbatim across all 9 files**.
- `study`/`physics` are static SPAs (no server) — redirect rule only,
  correctly no proxy.
- **Two routing topologies coexist:** auth-server uses a direct zone route
  (`apps/auth-server/wrangler.toml:14-16`, `tabletop-tools.net/auth/*`),
  bypassing the gateway; everything else rides gateway service bindings.
  no-cheat's Worker has no `[[routes]]` — reachable only via the gateway.

## Data model

None — stateless proxy, zero DB/KV/D1/R2 bindings. No domain data in source.
**But the app roster is a de facto hardcoded lookup replicated in 4+ places**
(build.sh, _redirects, wrangler.toml bindings, verify-deployment.sh, landing
page, CLAUDE.md) — a config-duplication anti-pattern adjacent to Rules 3/6.

## API surface

Path-prefix → binding: `/no-cheat/trpc/*`→`NO_CHEAT_API`,
`/versus/trpc/*`→`VERSUS_API`, `/list-builder/trpc/*`→`LIST_BUILDER_API`,
`/game-tracker/trpc/*`→`GAME_TRACKER_API`, `/tournament/trpc/*`→`TOURNAMENT_API`,
`/new-meta/trpc/*`→`NEW_META_API`, `/admin/trpc/*`→`ADMIN_API`,
`/data-import/api/*`→`DATA_IMPORT_API`, `/brain/api/*`→`BRAIN_API`
(`wrangler.toml:36-38` — **undocumented in gateway CLAUDE.md**). Static
`/study/*`, `/physics/*`. No crons.

## Deploy

- CF Pages project `tabletop-tools` (`wrangler.toml:1-2`), 9 `[[services]]`
  bindings (`wrangler.toml:4-38`).
- `scripts/deploy-gateway.sh`: build → `wrangler pages deploy` → CDN purge
  via curl, **gated on `CF_ZONE_ID`/`CLOUDFLARE_API_TOKEN` being set** — if
  unset, purge silently degrades to a printed warning
  (`deploy-gateway.sh:20-30`). Root CLAUDE.md's "does this automatically"
  claim is only conditionally true — platform-level drift.
- **Rule 9: negligible** for the proxies themselves (I/O-bound relays); the
  real Rule 9 risk lives in the backend Workers.

## Shared-package usage

None — no package.json, no imports. **Rule 3 violation:** the 9 near-identical
proxy handlers (compare any two `[[path]].ts:5-18`) should be one
parameterized handler (~150 duplicated lines today).

## CLAUDE.md drift

1. `CLAUDE.md:12` says "all 8 client SPAs"; reality is 11 built, 9 proxied.
   `BRAIN_API` binding and `functions/brain/` absent from its docs.
2. `scripts/deploy-gateway.sh:5` comment says "all 7 client SPAs" — a third
   stale count.
3. `scripts/verify-deployment.sh:38-45` checks only the original 8 apps —
   brain/study/physics unverified post-deploy.
4. Landing page (`landing/index.html:118-149`) shows only 8 cards — brain,
   study, physics undiscoverable from the homepage despite being live.
5. Git history confirms recurring drift: each app addition (`26dafac` brain,
   `65ed776` study, `137646e` physics) updated build.sh/_redirects/
   wrangler.toml but never the docs, verify script, or landing page.

## Health signals

- No unit tests by documented design (`CLAUDE.md:77-85`) — but the claimed
  safety net (verify script) is stale, weakening it.
- No TODO/FIXME. Error handling collapses all failure modes into one
  undiagnostic 503 (no upstream status, no logging) — hard to tell which of 9
  backends failed. Backend HTTP error responses pass through untouched; only
  thrown exceptions are caught.

## Candidate design decision points

1. **Path-prefix vs subdomain-per-app routing** — subdomains kill the
   prefix-strip boilerplate at the cost of CORS/cookie complexity for the
   one-login goal.
2. **Two routing topologies** — should auth also route through the gateway,
   or is the split intentional (auth must work independent of Pages)?
3. **Proxy handler duplication** — one parameterized handler per Rule 3.
4. **Cache-purge reliability** — make purge fail the deploy instead of
   soft-warn, given the platform's stale-cache incident history.
5. **Single source of truth for the app roster** — a shared manifest
   (`{slug, hasBackend, bindingName}[]`) consumed by build.sh, _redirects
   generation, verify script, and landing page; kills the recurring drift
   class.
6. **Verification coverage gap** — extend verify-deployment.sh to brain,
   study, physics.
