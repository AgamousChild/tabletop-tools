# auth-server — W2 Phase C design verdict

> Grounded in `wargame/w2/apps/auth-server.md` (census, 2026-07-06),
> `wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md`,
> `D2-06-silent-failure-policy.md`, `D2-08-doc-drift-strategy.md`, and a
> direct re-read of `apps/auth-server/src/{worker,index}.ts`,
> `apps/auth-server/wrangler.toml`, `packages/auth/src/index.ts`, and
> `packages/auth/CLAUDE.md` the same day this verdict was written.

## 1. Verdict: **Keep**

This is the platform's healthiest small app by every signal the census
and this re-read turned up: zero CLAUDE.md drift, zero TODO/FIXME, no
Rule 6 violation, no Rule 3 violation (`validateSession` lives in exactly
one place and every app reuses it), Rule 9 risk is explicitly low (one
auth op per request, scrypt params already tuned to the CPU budget from a
real past incident), and the one shared-package doc it touches
(`packages/db/CLAUDE.md`) drifts through no fault of this app's own code.
Nothing here calls for a refactor of shape or a redesign of architecture —
the work below is five bounded decisions and a cleanup pass, not a
rewrite.

## 2. App-local decision points wargamed

### (a) CORS: fallback-to-first-origin vs omit-header/403

Verified at `worker.ts:41-45` (identical at `index.ts:36-37`):
`origin: (origin) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!`,
`credentials: true`. Any mismatched `Origin` still gets a `200` with
`Access-Control-Allow-Origin: <allowedOrigins[0]>` and
`-Allow-Credentials: true`. Browsers still enforce CORS client-side, so
this isn't an open credentialed-read hole — but reflecting a fixed origin
back to every caller rather than omitting the header reads as "falls back
to a safe default" when it's closer to "never says no."

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: keep fallback-to-first-origin | 4 | 2 | 5 | 5 | 4 | 2 | 3.4 |
| B: omit header on mismatch | 5 | 5 | 5 | 5 | 5 | 5 | **5.0** |

*(Quality/Risk weighted highest — live auth surface, not a batch job.)*

**Wargame:** A's only defense ("browsers already block it") is true but
relies on every caller being a CORS-honoring browser and every future
reader parsing that subtlety out of a one-line arrow function. B costs
nothing extra — Hono's `cors()` already omits the header when `origin()`
returns falsy, so the fix is `... : undefined`. No legitimate client
behavior changes.

**Recommendation:** **Primary: B** — return `undefined` for unmatched
origins in both `worker.ts:41-45` and `index.ts:36-37`. **Fallback:** if
a legitimate caller with no `Origin` header (server-to-server, health
check) breaks, special-case *absent* origin separately from *present-but-
untrusted* — the fix targets only the latter. **Flip trigger:** none
anticipated; ship as a one-line fix.

### (b) Stateless session verification vs per-request Turso round-trip

Verified: `validateSession()` (`packages/auth/src/index.ts:168-206`) does
an in-Worker HMAC verify, then a Turso `SELECT` joining
`authSessions`/`authUsers` with an expiry check (`:190-203`), on every
authenticated request from every app. Alternative: a short-lived signed
token app Workers verify via HMAC alone, no DB call.

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: keep Turso round-trip | 4 | 5 | 2 | 5 | 5 | 4 | 3.8 |
| B: short-lived signed token, no DB read | 4 | 3 | 5 | 2 | 3 | 2 | 3.2 |

*(Latency/Effort weighted highest — platform-wide pattern on every
request; Quality/Risk next since session validity correctness is the
whole point.)*

**Wargame:** A's cost is real but bounded — Turso over HTTP is a single
indexed lookup, not a scan, and the census found no measured latency
complaint anywhere. B's real cost is revocation: a self-verifying token
can't express "sign out everywhere" or "ban this session" without either
a DB-backed revocation list (reintroducing the round-trip for the case
that matters most) or accepting a window where a revoked session stays
valid until TTL — a security posture change, not a free win. This also
isn't auth-server's call alone: `server-core`
(`packages/server-core/src/server.ts:17-31`) calls `validateSession`
identically for all 7+ apps, so changing the contract changes it
everywhere at once.

**Recommendation:** **Primary: keep A** — no measured latency problem
exists to justify trading a cheap DB read for an unproven revocation
story. **Fallback: a short (60–120s) signed-claim cache in front of the
DB check**, not a full DB-less token — collapses bursts to one DB hit per
window without B's full revocation-latency tradeoff. **Flip trigger:** a
real measured p95 number showing the round-trip as a meaningful fraction
of request latency (Rule 0 — not an estimate).

### (c) Separate auth DB vs shared platform DB

Verified: one Turso instance holds the 4 auth tables alongside ~45+ other
tables (`packages/db/src/schema.ts`). Root CLAUDE.md Rule 1 ("one
canonical entity registry... no app maintains its own lookup map") is the
platform's stated reason for this shape.

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: shared platform DB (status quo) | 5 | 4 | 4 | 5 | 5 | 3 | 4.3 |
| B: separate dedicated auth DB | 3 | 4 | 4 | 2 | 2 | 4 | 3.1 |

**Wargame:** B's concern (an unrelated app's bad migration or connection
issue taking down auth) is real but narrow — Turso/libSQL over HTTP
doesn't hold long-lived pool state the way Postgres would, softening the
"connection exhaustion" version of this risk. B also directly fights
Rule 1: a second database for one app reintroduces the infra-roster
duplication D2-02 spent a whole decision fixing for the gateway. The real
mitigation for B's concern is migration discipline (already centralized
in `packages/db/migrations/*.sql`), not a second database — splitting
doesn't stop a bad migration from being written, it just changes blast
radius.

**Recommendation:** **Primary: keep shared DB** — no evidence of an
actual incident justifying an override of Rule 1 for one app.
**Fallback:** if a real incident occurs, reach for connection/query
isolation *within* Turso (read replica/branch) before a fully separate DB
and duplicated secrets pipeline. **Flip trigger:** a measured incident,
not a hypothetical.

### (d) Rate limiting on sign-in/sign-up

**Verified:** `createAuth()` (`packages/auth/src/index.ts:111-142`) passes
no `rateLimit` option to `betterAuth()`. Better Auth `^1.4.0`
(`packages/auth/package.json`) ships a built-in limiter that defaults to
**in-memory storage** absent a `secondaryStorage`. In-memory state does
not survive across Cloudflare Worker isolates/cold starts, so even the
implicit default provides no real protection in this deploy model.
`wrangler.toml` has no rate-limit binding; a zone-level Cloudflare
dashboard rule, if any exists, is invisible from source — this verdict
does not assert one exists or doesn't (Rule 0), only that nothing in-repo
configures or documents one. **There is no verified, working rate limit
on sign-in/sign-up today** — a real gap on a public endpoint.

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: do nothing (unverified zone config) | 2 | 1 | 5 | 5 | 3 | 1 | 2.6 |
| B: Better Auth `rateLimit` + Cloudflare KV as `secondaryStorage` | 5 | 5 | 4 | 3 | 5 | 5 | **4.7** |
| C: Cloudflare Rate Limiting Rule at zone/route level | 4 | 4 | 5 | 4 | 3 | 4 | 4.0 |

*(Quality/Risk weighted highest — brute-force/credential-stuffing
exposure on a login endpoint.)*

**Wargame:** B and C are complementary, not exclusive — B is
account/IP-aware at the app layer; C stops abuse at the edge before the
Worker runs at all. C alone leaves no trace in-repo (indistinguishable
from "doesn't exist" without a live dashboard check); B alone is fully
version-controlled per Rule 4.

**Recommendation:** **Primary: B** — wire `rateLimit` in `createAuth()`
backed by a Cloudflare KV namespace, provisioned in
`apps/auth-server/wrangler.toml`. **Fallback: C** if KV cost/latency
proves a problem — add a Cloudflare Rate Limiting Rule on
`/auth/api/auth/sign-in*` and `/sign-up*`, and document its existence in
`apps/auth-server/CLAUDE.md` so it isn't invisible tribal knowledge.
Either way, **do not leave A as the final state**. **Flip trigger:** none
needed — ship regardless, this closes a known gap rather than optimizing
a working system.

### (e) 88 leftover test-auth-*.db files + committed dist/

**Verified in this worktree** (`C:/R/wargame-docs`, branch
`docs/wargame`): `packages/auth/` has **zero** `test-auth-*.db` files
today, and neither `apps/auth-server/dist/` nor `packages/auth/dist/`
exists or is git-tracked. `.gitignore` already covers `dist`, `*.db`,
`*.db-shm`, `*.db-wal`. This worktree does not reproduce the census
finding — consistent with the census running against the main
`tabletop-tools` checkout's untracked (gitignored) local litter, not
committed pollution in this docs worktree. **This verdict does not claim
the 88 files still exist in the main checkout** — that needs a direct
check there, not an inference from this worktree's absence of them.

The actionable finding regardless of current count: the test suite
creating on-disk SQLite files under `packages/auth/` (per the census,
`auth.test.ts`/`test-helpers.ts`) has no teardown step — that's the Rule
7 violation worth fixing, not the snapshot count.

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A: manual periodic cleanup | 3 | 2 | 5 | 5 | 3 | 2 | 3.2 |
| B: fix test teardown (`:memory:` or `afterAll` unlink) | 5 | 5 | 5 | 4 | 5 | 5 | **4.9** |

**Recommendation:** **Primary: B** — switch the test harness's libSQL
client to `:memory:` if viable, else add `afterAll`/`afterEach` cleanup
that unlinks the file. **Fallback:** if file-backed is unavoidable, add a
pre-commit/CI check that fails on unstaged `test-auth-*.db` files so
litter surfaces immediately instead of accumulating to 88+. **On
committed `dist/`:** not reproduced here and already gitignored — treat
as resolved unless a `git ls-files` check in the main checkout shows
otherwise.

## 3. Cross-cutting obligations

- **D2-02 (deploy topology).** D2-02 keeps auth-server's direct zone
  route (`tabletop-tools.net/auth/*`, `wrangler.toml:15-17`) as the
  platform's one intentional exception to the gateway's service-binding
  pattern, so auth survives a Pages/gateway outage. D2-02's step 8 puts
  the explanatory sentence in `apps/gateway/CLAUDE.md`; the mirror is
  missing here. **Action:** add one sentence to
  `apps/auth-server/CLAUDE.md` explaining *why* this app binds its own
  zone route instead of routing through the gateway, pointing to
  `apps/gateway/CLAUDE.md` and D2-02. Doc-only — the topology question is
  already settled.
- **D2-08 (doc drift) — packages/db adjacency.** The census's
  `packages/db/CLAUDE.md` "22 tables" vs ~45+ actual finding is one of at
  least 4 independent app censuses that rediscovered the same wrong
  number. Auth-server's own CLAUDE.md is clean and needs no edit for
  this — the fix belongs to `packages/db/CLAUDE.md` per D2-08's
  immediate-sweep item #1. No action lands in this app's file beyond
  confirming it isn't part of the drift.

## 4. Ordered work plan

1. **CORS fix (2a).** `worker.ts:41-45` + `index.ts:36-37` return
   `undefined` for unmatched origins. Smallest, safest, ship first.
2. **Rate limiting (2d).** Wire `rateLimit` in `createAuth()`
   (`packages/auth/src/index.ts:118-141`) backed by Cloudflare KV;
   provision the namespace in `apps/auth-server/wrangler.toml`. Highest-
   severity verified gap — a public sign-in/sign-up endpoint with no
   working protection today.
3. **Test-artifact hygiene (2e).** Fix teardown in
   `packages/auth/src/auth.test.ts`/`test-helpers.ts`; verify by running
   the suite twice with no new `test-auth-*.db` files left behind.
   Separately, in the **main `tabletop-tools` checkout** (not this
   worktree), run `git ls-files apps/auth-server packages/auth | grep
   dist` to confirm the committed-`dist/` finding is or isn't live there.
4. **D2-02 doc note (3).** Add the zone-route rationale sentence to
   `apps/auth-server/CLAUDE.md`.
5. **Session latency measurement (2b).** Add timing/logging around one
   representative app's `validateSession` Turso call to get a real p95
   number before deciding whether the short-TTL cache fallback is
   warranted. Otherwise close as "kept, no action."
6. **Separate-DB question (2c) — no action.** Confirmed keep-shared;
   revisit only on a real measured incident.
