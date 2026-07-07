# D2-02 — Deploy topology & app-roster manifest

> **Decision.** How the gateway's app roster, proxy handlers, and deploy
> verification stay in sync as apps are added — and whether the routing
> topology itself (path-prefix vs subdomain, auth's separate zone route)
> should change.
>
> **Status:** ⏳ recommended, not yet implemented.

## The decision, restated in one paragraph

The gateway (`apps/gateway/`) is a single Cloudflare Pages project that
builds every client SPA into one `dist/` and proxies API calls to each
app's Worker via service bindings (`apps/gateway/CLAUDE.md:9-14`). The
roster of apps is not read from one place — it is retyped independently in
at least seven files (the 2026-07-07 hardening pass added
`scripts/deploy-workers.sh:14`, whose `APPS` list is a 7-app subset missing
data-import/brain/study/physics — its own distinct wrong roster), and it
has already drifted three times as apps were
added. Separately, five other apps' docs claim a per-app Cloudflare Pages
deploy (their own `wrangler.toml` + `functions/trpc/[[path]].ts`) that was
retired in favor of the gateway but never cleaned out of their `PLAN.md`s.
This decision picks the mechanism that stops the roster from drifting
again and disposes of the phantom per-app deploy story.

## Forces

- **Six-plus independent copies of the same list**, verified today:
  - `apps/gateway/build.sh:14` — loop over 11 apps.
  - `apps/gateway/CLAUDE.md:12,18,22-24` — says "8 client SPAs," "8 service
    bindings," lists only 8 proxy functions (no `brain`).
  - `scripts/deploy-gateway.sh:4` — comment says "all 7 client SPAs."
  - `scripts/verify-deployment.sh:44,50` — iterates 8 apps for SPA and
    tRPC-health checks (no `brain`, `study`, `physics`).
  - `apps/gateway/landing/index.html:118-149` — exactly 8 `<a class="card">`
    entries (no Brain, Study, Physics cards).
  - `apps/gateway/wrangler.toml:4-38` — 9 `[[services]]` bindings (matches
    build.sh minus `study`/`physics`, which are static and correctly have no
    binding).
  - Git history (per census) confirms the drift is not hypothetical: each
    app addition (brain, study, physics) touched build.sh/_redirects/
    wrangler.toml but not the docs, verify script, or landing page.
- **Proxy duplication is real and measured.** Read
  `apps/gateway/functions/versus/trpc/[[path]].ts`,
  `.../brain/api/[[path]].ts`, `.../data-import/api/[[path]].ts` side by
  side: 18 lines each, identical except the `Env` interface's binding name
  and the prefix regex (`/^\/versus/` vs `/^\/brain\/api/` vs
  `/^\/data-import\/api/`). Nine files, same shape, no shared function
  (Rule 3).
- **Cache-purge silently degrades.** `scripts/deploy-gateway.sh:28-37` only
  purges CDN cache `if [ -n "$CF_ZONE_ID" ] && [ -n "$CLOUDFLARE_API_TOKEN" ]`
  — otherwise it prints a warning and exits 0. Root `CLAUDE.md:236-239`
  states purge happens "automatically" as settled fact; the code makes that
  conditional on env state the script never verifies before declaring
  success. This is the same class of failure root `CLAUDE.md:240-242`
  already calls out as a recurring incident ("clear cache before verifying
  anything").
- **Two routing topologies coexist today**, not one:
  `apps/auth-server/wrangler.toml:15-17` binds a direct zone route
  (`tabletop-tools.net/auth/*`) that bypasses Pages/gateway entirely, while
  every other backend rides a `[[services]]` binding through a Pages
  Function. `no-cheat`'s Worker (per census) has no `[[routes]]` of its
  own — it is reachable *only* through the gateway, which makes auth's
  independence a deliberate exception, not an oversight, but it is
  undocumented as a decision anywhere.
- **Phantom per-app Pages deploys.** Six apps' planning docs check off a
  client-side Cloudflare Pages deploy that does not exist on disk
  (*count corrected 5→6, 2026-07-07 hardening pass*):
  - `apps/game-tracker/PLAN.md:78` — `[x]` claims
    `client/wrangler.toml` + `client/functions/trpc/[[path]].ts`.
  - `versus`, `new-meta`, `no-cheat`, `list-builder` PLAN.md/CLAUDE.md make
    the equivalent claim per their W2 censuses (versus PLAN.md:63,
    new-meta PLAN.md:61, no-cheat PLAN.md:138, list-builder PLAN.md:79).
  - `apps/tournament/PLAN.md:76` — the identical `[x]` line, missed by the
    census and caught in the 2026-07-07 second pass; neither file exists in
    `apps/tournament/client/` either.
  - None of these files exist; the actual mechanism is the gateway's single
    Pages project + the 9 `functions/<app>/...` proxies. The per-app Pages
    story is a retired architecture nobody deleted from the docs.
- **Verify script has no teeth on the roster it does check**, and zero
  coverage on brain/study/physics — a broken deploy to any of those three
  ships silently.

## Options

### Option A — single roster manifest + one parameterized proxy handler

A single data file (JSON or TS) listing every app:
`{ slug: string; hasBackend: boolean; bindingName?: string }[]`. Consumed
by:
- `build.sh` (loop over manifest instead of a hardcoded bash list),
- `_redirects` generation (a small script emits the file from the
  manifest — Cloudflare doesn't read `_redirects` dynamically, so this
  becomes a generate-then-commit or generate-at-build step),
- `verify-deployment.sh` (loop over manifest entries with `hasBackend`),
- the landing page (render cards from the manifest — requires the landing
  page to stop being static HTML, or a small build-time templating pass),
- `wrangler.toml` service bindings (Wrangler config can't `include` another
  file today, so this one stays hand-maintained, but a `postinstall`/CI
  check can diff it against the manifest and fail if they disagree).

Pages Functions route by literal path segments, not manifest-driven
dynamic ones, so the 9 proxy handlers don't collapse to *one* routed
function — the realistic version is a shared handler factory
(`makeProxyHandler(bindingName, prefix)`) imported by 9 thin one-line
files. Still kills ~150 duplicated lines down to ~9×3.

**How it plays out:** touches 5 files (manifest + 4 consumers) plus 9 tiny
proxy files. Wrangler binding config stays manual (Cloudflare can't
`include` another file into `wrangler.toml`), but gets a CI drift-detector.
This directly fixes the "3 doc-drift incidents" pattern: one file to
update per new app (manifest) instead of 6.

**Score**

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: manifest + shared proxy factory | 5 | 5 | 5 | 3 | 5 | 4 | **4.5** |

*(Weights: this is a deploy-infra decision, not a live-latency one — Fit,
Stack, and Risk carry the most weight; Latency is scored high because the
change is latency-neutral, not because latency matters much here.)*

### Option B — subdomain-per-app routing

Route `versus.tabletop-tools.net`, `brain.tabletop-tools.net`, etc.,
instead of `tabletop-tools.net/versus/*`. Kills prefix-stripping
entirely — each Worker can bind its own route/subdomain directly (like
auth-server already does), and the "9 near-identical proxy handlers"
problem disappears because there's no proxy: DNS + Worker routes replace
Pages Functions.

**How it plays out here:** this is the auth-server pattern generalized to
every app. It removes Option A's proxy-duplication problem at the root
instead of centralizing it, but reopens problems the gateway solves for
free today:
- **One-login cost.** Cross-subdomain cookies need `Domain=.tabletop-
  tools.net` + `SameSite=None; Secure`, and every Worker needs CORS for
  every other subdomain that calls it (list-builder → brain, admin → every
  app). Today this is zero-cost — one origin. Subdomains trade N Worker
  custom-domain bindings + N DNS records — the *same* manifest problem this
  decision exists to kill, just moved into Cloudflare config.
- **Landing/nav breaks.** The landing page's relative links
  (`href="/no-cheat/"`) and cross-app nav become cross-origin navigations —
  harder to keep the unified shell (Rule 2/8: shared UI, one login) feeling
  like one product.
- Static apps (`study`, `physics`) would need their own subdomains too,
  losing today's "just another `_redirects` line" simplicity.

**Score**

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| B: subdomain-per-app | 3 | 4 | 4 | 2 | 2 | 3 | **2.9** |

Fit/Latency score reasonably (it works, and DNS-level routing isn't
slower), but Stack and Risk score low: it fights the one-login goal
(Rule 2/8) that the platform is explicitly built around, and trades a
docs-drift problem for a DNS/CORS-config drift problem of the same shape.

### Option C — minimal patch-in-place

Fix the stale numbers where they are: bump `CLAUDE.md`'s "8" to "11,"
extend `verify-deployment.sh`'s loop to include brain/study/physics, add
3 landing-page cards, fix the `deploy-gateway.sh` comment. Leave the
9 hand-copied proxy files and the 6-way duplication as-is.

**How it plays out:** cheapest possible fix and *not nothing* — it closes
today's immediate gap (brain/study/physics unverified and undiscoverable).
But it doesn't change the failure mode: the next app added repeats the
same six-edit checklist, already missed 3/3 times per git history. Valid
**stopgap**, not a fix for roster drift as a class; does nothing for the
9-file proxy duplication (Rule 3) or the cache-purge soft-fail.

**Score**

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| C: patch in place | 3 | 2 | 5 | 5 | 4 | 2 | **3.2** |

Effort wins big (cheapest), but Quality and Risk are low — it treats the
symptom (today's stale count) not the cause (no single source of truth),
so the same drift recurs on the next app add.

## Wargame — where each option breaks

- **A breaks** only if Cloudflare lets Wrangler bindings/`_redirects` be
  generated purely at deploy time with zero manual step — then the
  "wrangler.toml stays hand-maintained" caveat disappears and A gets
  strictly better. Until then, A's residual risk is that one manual file
  (bindings) drifting from the manifest, mitigated by a CI check, not
  eliminated.
- **B breaks** immediately on the one-login goal: the platform's identity
  is one login, shared UI, apps that feel like one product (Rule 2/8).
  Subdomains are the architecture of a portfolio of separate products —
  a stack/values mismatch, not just engineering cost. It would only win if
  apps needed independent custom domains for external branding (they
  don't — personal-project deploy, not multi-tenant SaaS).
- **C breaks** on the next app addition, provably: 3 for 3 historical
  misses on this exact checklist. Choosing C is choosing to keep paying the
  cost this decision exists to stop paying.

## Recommendation

**Primary: Option A — single roster manifest consumed by build/verify/
landing, plus a shared proxy-handler factory for the 9 Pages Functions.**
Bundled with A:
- **Make cache-purge a hard failure**, not a warning: when `CF_ZONE_ID` /
  `CLOUDFLARE_API_TOKEN` are unset, `scripts/deploy-gateway.sh:28-37`
  should exit non-zero, not print a warning and return success. Given the
  platform's own documented stale-cache incident history (root
  `CLAUDE.md:236-242`), a deploy that silently skips cache invalidation
  should not report as clean.
- **Delete the phantom per-app Pages claims** from the 6 affected files
  (game-tracker/versus/new-meta/no-cheat/list-builder/tournament PLAN.md)
  and replace
  with a one-line pointer to `apps/gateway/CLAUDE.md`. Same root cause as
  the roster drift — no single source of truth for "how does this app
  actually deploy" — so it rides along with A rather than as a separate
  initiative.
- **Keep auth-server's separate zone route.** Not an oversight to fold
  in: auth must survive a Pages/gateway outage, and no-cheat's Worker
  already depends on gateway-only reachability being the exception-free
  norm for backend Workers — which makes auth's independence the one
  intentional exception. Write that one sentence into gateway's CLAUDE.md
  so a future census stops re-flagging it as drift.

**Fallback: Option C, scoped to just the verify-script + landing-page +
doc-count gaps**, if A's manifest-driven landing page needs more plumbing
than expected (e.g. the static-HTML-plus-`sed` version injection resists
templating without a larger `build.sh` rebuild). Fallback still includes
the hard-fail cache-purge change and the 6-file phantom-deploy cleanup —
cheap and independent of which option wins.

## Flip triggers

- **Flip from A to B** only if the platform's product shape changes to
  something where per-app custom domains/branding are wanted (e.g., an app
  spun out as an independently-branded product) — a business decision, not
  a technical one, and out of scope for this doc.
- **Flip from A to C-only** if the manifest-driven landing page requires
  more than a small templating pass (i.e., if it turns out to need a
  client framework build step the static landing page doesn't have today).
  Re-evaluate after a 1-day timebox on the landing-page piece specifically;
  the build.sh/verify-script/proxy-factory pieces are lower-risk and should
  ship regardless.
- **Re-open the auth-server topology question** if the gateway's Pages
  project achieves high enough uptime/monitoring that "auth must survive a
  Pages outage" stops being a real differentiator — unlikely soon, not a
  near-term trigger.

## Implementation notes (ordered)

1. Write `apps/gateway/apps.json` (or `.ts`): `{ slug, hasBackend,
   bindingName }[]`, 11 entries, `hasBackend: false` for `study`/`physics`,
   `bindingName` matching existing `wrangler.toml` names (`NO_CHEAT_API`,
   `VERSUS_API`, etc.).
2. Update `apps/gateway/build.sh:14,32` (build loop + validation loop) to
   read the manifest instead of the hardcoded `for app in ...` list.
3. Write `makeProxyHandler(bindingName, prefix)` in a shared
   `apps/gateway/functions/_lib/proxy.ts`; reduce each of the 9
   `functions/<app>/{trpc|api}/[[path]].ts` to a 3-line import + call.
4. Update `scripts/verify-deployment.sh:44,50` to loop over the manifest's
   `hasBackend` apps (adds brain/study/physics; study/physics get the
   static-page check only, no tRPC health check).
5. Add a CI/pre-deploy check diffing `wrangler.toml`'s `[[services]]`
   count against the manifest's `hasBackend: true` count — fails the build
   on mismatch, the guard for the one piece that can't be generated.
6. Change `scripts/deploy-gateway.sh:28-37` to `exit 1` when
   `CF_ZONE_ID`/`CLOUDFLARE_API_TOKEN` are unset; fix the stale "7 client
   SPAs" comment at line 4.
7. Hand-add the 3 missing landing-page cards now (brain/study/physics are
   undiscoverable today — a live bug independent of A/C), then template
   from the manifest if the build-time lift is small.
8. Update `apps/gateway/CLAUDE.md`: replace the hardcoded "8 client SPAs"
   /binding table with a pointer to `apps.json`, and add the one-sentence
   auth-server topology note.
9. Replace the phantom per-app Pages checkboxes in `game-tracker/PLAN.md:78`,
   `versus/PLAN.md:63`, `new-meta/PLAN.md:61`, `no-cheat/PLAN.md:138`,
   `list-builder/PLAN.md:79`, and `tournament/PLAN.md:76` (6th instance,
   added by the 2026-07-07 hardening pass) with a pointer to gateway's
   CLAUDE.md.
10. Re-run `scripts/verify-deployment.sh` against production and manually
    check the landing page in a browser — script exit 0 is not "verified
    live" (root CLAUDE.md Rule 0).
