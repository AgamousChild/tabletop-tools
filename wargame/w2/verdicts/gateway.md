# gateway — W2 Phase C verdict

> Reads: [`00-methodology.md`](../../00-methodology.md),
> [census](../apps/gateway.md),
> [D2-02](../decisions/D2-02-deploy-topology-roster-manifest.md). Re-verified
> 2026-07-06: `build.sh:14,32` (11-app loop), `CLAUDE.md:12,22-24` (still
> says "8 client SPAs," no `brain` in binding table/function list — drift
> confirmed live, not stale from census date), `functions/versus/trpc/
> [[path]].ts:1-18` (18-line handler, same shape across all 9),
> `_redirects:1-11` (11 rules), `e2e/CLAUDE.md:24-34` (10 specs/36 tests,
> covers exactly the original 8 apps — no brain/study/physics spec exists).

## 1. Verdict

**Keep, with D2-02's refactor.** The architecture — one Pages project, one
`dist/`, service-binding proxies — is the right shape for a single-login,
shared-UI platform (root `CLAUDE.md` Rules 2/8); nothing here calls for a
redesign. The problem is entirely the maintenance model: one list of apps
retyped across 6+ files with a 3-for-3 historical miss rate keeping them in
sync. D2-02 already recommended and scored the fix (Option A: manifest +
shared proxy factory, weighted 4.5 vs 2.9 subdomains vs 3.2 patch-in-place).
This verdict doesn't re-litigate that scoring — see D2-02's Wargame and
Recommendation — it rolls the decision up to an app verdict and adds three
app-local points D2-02 didn't fully cover.

## 2. App-local decision points wargamed

### (a) Proxy error diagnostics — identical opaque 503

**Forces.** All 9 proxy handlers (verified `versus`; same shape holds for
`brain`, `data-import`, and the rest) catch only thrown exceptions and
return a fixed `{ error: { message: 'Service unavailable' } }`, 503 — no
upstream status, no binding name, no logging. A `VERSUS_API` throw and a
`BRAIN_API` throw are byte-for-byte indistinguishable, in the response and
in the (nonexistent) log. Diagnosing "which of 9 backends is down" today
means manually testing each path.

**Options:** keep opaque (zero cost, but every outage starts as a
guessing game across 9 Workers) vs. structured envelope + logging (`{
error: { message, binding, upstreamStatus? } }` + `console.error`,
visible via `wrangler pages deployment tail`).

**Recommendation:** fold into D2-02's proxy-factory step (Implementation
notes item 3) — the binding name is already a factory parameter, so
stamping it into the error body and a log line is a ~3-line addition, not
new plumbing. **Fallback:** if the factory stalls, add `console.error` with
the binding name to the 9 existing handlers as a standalone one-line-per-
file patch that doesn't need the factory first.

### (b) Landing-page discoverability — brain/study/physics unlisted

**Forces.** Landing page has exactly 8 `<a class="card">` entries; brain,
study, physics are live and completely absent from the homepage. Census
frames this as drift, but there's a real policy question underneath: is
"every built app gets a card" the right default, or should some apps
(internal tools, early dogfood) be deliberately unlisted?

**Options:** manifest-driven cards (render from the same `apps.json` that
drives build/verify — no app addition can silently skip the homepage
again) vs. curated subset, hand-maintained (some apps, e.g. `admin`, may
never want a public card regardless of manifest state).

**Recommendation:** manifest-driven, but extend D2-02's schema from `{
slug, hasBackend, bindingName }` to add `showOnLanding: boolean`. This
resolves the false dichotomy — the policy call ("should `admin` have a
public card?") is made once per app, explicitly, not by omission. Today's
answer for the 3 missing apps is "no, this was an oversight" (D2-02
already prescribes hand-adding their cards now, independent of the
manifest lift). **Fallback:** if landing-page templating resists the
manifest (D2-02's own 1-day-timebox flip trigger), hand-maintain the list
but make "new app → landing card" a mandatory line in whatever checklist
replaces the manifest for this piece.

### (c) E2E coverage for SPA fallback routes

**Forces.** `e2e/CLAUDE.md:24-34` lists 10 specs/36 tests covering exactly
the original 8 apps (`landing.spec.ts` asserts "8 app cards link
correctly"; one spec per proxied app). No spec for `brain`, `study`, or
`physics` exists — the same 3 apps missing from `verify-deployment.sh`
(D2-02) and the landing page (point b) are also missing from E2E. A third
independent instance of the same drift class.

**Options:** extend E2E now, ad hoc (`brain.spec.ts`, `study.spec.ts`,
`physics.spec.ts`, following the existing `new-meta`/`data-import`
no-auth-gate pattern for the two static apps) vs. defer until the manifest
exists and generate spec stubs from it (loop the manifest, assert each
`/<slug>/` returns 200) to avoid hand-writing a 4th copy of the roster.

**Recommendation:** ad hoc, now — the gap is live in production today and
D2-02's manifest isn't built yet; don't block a real coverage hole on an
unshipped refactor. **Fallback/long-term:** once the manifest lands,
migrate to a manifest-driven spec loop (add this as an explicit line item
in D2-02's rollout — it isn't currently one of its 10 steps).

## 3. Cross-cutting obligations

- **D2-02, wholesale.** Not restated here — see that doc for the full
  option analysis, scoring, and 10-step implementation plan. Every item in
  §4 below touching the manifest, proxy factory, verify script, or landing
  page is D2-02's work, referenced not repeated.
- **D2-08 (three stale counts).** Independently re-confirmed live in code
  this session: `CLAUDE.md` says "8 client SPAs," `deploy-gateway.sh:5`
  (per census) says "7 client SPAs," `verify-deployment.sh` checks 8.
  D2-08's stale-count-hygiene fix applies directly — gateway is its
  concrete instance.

## 4. Ordered work plan

1. Hand-add brain/study/physics cards to `landing/index.html` now (D2-02
   step 7) — live discoverability bug, cheapest high-impact fix, not
   blocked on anything below.
2. Write `apps/gateway/apps.json` manifest (D2-02 step 1), extended with
   `showOnLanding: boolean` (point b).
3. Build `makeProxyHandler(bindingName, prefix)` in
   `functions/_lib/proxy.ts` (D2-02 step 3) with structured error envelope
   + `console.error` logging built in from the start (point a).
4. Point `build.sh` (D2-02 step 2) and `verify-deployment.sh` (D2-02 step
   4) at the manifest.
5. Write `brain.spec.ts`, `study.spec.ts`, `physics.spec.ts` in
   `e2e/specs/` now (point c) — don't wait on the manifest-driven fallback.
6. Template the landing page from the manifest if the lift is small per
   D2-02's timebox; otherwise fall back to the hand-maintained list from
   step 1 and track templating as deferred, not dropped.
7. Add the CI drift-check diffing `wrangler.toml` `[[services]]` count
   against manifest `hasBackend` count (D2-02 step 5).
8. Hard-fail `deploy-gateway.sh` on missing `CF_ZONE_ID`/
   `CLOUDFLARE_API_TOKEN` (D2-02 step 6); fix the stale "7 client SPAs"
   comment in the same edit.
9. Update `apps/gateway/CLAUDE.md`: replace the "8 client SPAs" claim and
   binding table with a pointer to `apps.json`; add the auth-server
   topology note (D2-02 step 8); document `BRAIN_API` regardless of
   manifest timing — undocumented today, independent doc bug.
10. Replace the 5 phantom per-app-Pages-deploy checkboxes across
    game-tracker/versus/new-meta/no-cheat/list-builder `PLAN.md`s (D2-02
    step 9).
11. Re-run `verify-deployment.sh` against production, manually load the
    landing page and one previously-undiscoverable app route in a browser,
    and run the extended E2E suite against
    `BASE_URL=https://tabletop-tools.net` (D2-02 step 10 + point c) —
    script exit 0 is not "verified live" (root `CLAUDE.md` Rule 0).
