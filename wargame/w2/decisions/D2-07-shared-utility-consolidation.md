# D2-07 — Shared-utility consolidation (Rule 3)

> **Decision.** Which duplicated logic gets extracted, to which existing
> package (or a new `packages/util`), and which two-line duplications are
> cheaper to leave alone with a pointer comment than to abstract.

## Forces

Root CLAUDE.md Rule 3: "If two app servers have similar logic, extract it to
a shared package. Similar functions in different apps is a bug, not a
pattern." Pulling the other way: the same CLAUDE.md's legacy rules — "keep
the stack shallow," "no features that aren't needed yet," "don't polish what
doesn't need polishing." A shared package is a feature: it needs a home,
a version, an import graph, and someone remembering it exists. Seven items
surfaced across the W2 census (`README.md:52`); they are not uniform — some
are byte-identical triplicates begging for one function, others are
two-line, independently-evolving heuristics that would cost more to
parameterize than to leave. This doc separates the two classes and assigns
the rest to a destination.

## Grounding (read 2026-07-06)

1. **slugify ×3 in data-import, genuinely different**: `sync.ts:52-59`
   (`contentEntitySlug` — strips curly/straight apostrophes via
   `[’ʼ'‘"”"]`, truncates to 60 chars), `content-producer.ts` (no local
   slug fn found — reuses `contentEntitySlug` per census; re-verified no
   second definition in that file), `sources/faction-pack.ts:86-92` (`slug`
   — different apostrophe class `['‘’′"'"]`, no truncation). Three
   call sites, two distinct bodies (truncation is the only proven
   divergence at time of read; the third invocation is confirmed a
   reuse, not a fork).
2. **content-ingestor's OWN slugify ×3, byte-identical**:
   `server/src/lib/nodes.ts:23-28`, `src/commit/commit.ts:27-32`,
   `src/commit-process-queue.ts:39-44` — all three are
   `title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')`,
   character-for-character identical. This is a different, easier case than
   data-import's: no divergent behavior to reconcile, just copy-paste.
3. **dice-notation average math ×2, genuinely different regex/features**:
   `apps/versus/server/src/lib/attackCount.ts:20,26-47`
   (`resolveAttacksExpected`, regex `^(\d+)?[Dd](\d+)(?:\+(\d+))?$`, no
   minus-modifier support, throws on unrecognized input) vs
   `apps/versus/client/src/lib/rules/pipeline.ts:9-17`
   (`resolveAttacks`, regex `^(\d*)D(\d+)([+-]\d+)?$`, supports `-` modifier,
   returns 0 silently on no match). Both apps live in the *same* app
   (versus client + versus server), not cross-app — this is an intra-app,
   cross-runtime split, and the client also has `resolveMin` (:23-30) with
   no server equivalent at all.
4. **generateId reimplemented per-router, worse than census stated**:
   server-core exports one real implementation,
   `packages/server-core/src/id.ts:1-5` (`nanoid()`, cryptographically
   fine). game-tracker hand-rolls `Date.now()+Math.random()` **four**
   times, not two: `match.ts:17-19` (`generateId`), `matchV2.ts:8-10`
   (same body, renamed `id`), `turn.ts:8` (`generateId`),
   `secondary.ts:8` (`generateId`) — verified by grep across
   `game-tracker/server/src/routers/`. None import `@tabletop-tools/
   server-core`'s `generateId`. The hand-rolled version is not
   collision-resistant at scale (timestamp + short random) where nanoid is;
   this is a correctness gap dressed as a style duplication.
5. **gateway's 9 copy-pasted proxy handlers, confirmed identical shape**:
   read `versus`, `game-tracker`, `admin`, `brain` — all four are the
   *exact* same 14-line body (URL rewrite, `Fetcher.fetch`, catch → identical
   503 JSON envelope); only the env-key name and the regex prefix differ
   (`brain/api/[[path]].ts:7` strips `/brain/api` instead of `/brain`, the
   one case with a non-uniform prefix). `apps/gateway/functions/*/{trpc,api}/
   [[path]].ts` × 9. Gateway has zero `package.json` and zero shared-package
   imports today (`w2/apps/gateway.md:64-68`) — starting from nothing.
6. **admin reimplements AppShell chrome**: `packages/ui/src/components/
   AppShell.tsx:1-45` takes exactly `{title, onSignOut, children}` and
   renders a fixed header (Home link + title + sign-out) with no slot for
   extra nav — confirmed by reading the full component: no `nav`/`tabs`/
   `extra` prop exists. `admin/client/src/App.tsx:64-111` (per census)
   reimplements equivalent header chrome inline because there's nowhere to
   hang its 10-page tab nav.
7. **bcp-scraper hand-rolls cachedApp bootstrap**: `packages/server-core/
   src/worker.ts:9-22` (`createWorkerHandler`) is a ~14-line factory: module-
   level `cachedApp` memo + `fetch` that builds once, reuses across isolate
   invocations. `apps/bcp-scraper/server/src/worker.ts:30-33,64-66` (per
   census) reimplements the same memo pattern by hand instead of importing
   it, despite already importing `server-core` for `generateId` elsewhere
   (`w2/apps/bcp-scraper.md:66-69`) — the dependency is already in
   `package.json`, just not used for this.
8. **Cross-boundary relative `AppRouter` type imports**: grepped
   `**/lib/trpc.ts` across all apps — **7 apps** do this, not "several":
   `tournament/client/src/lib/trpc.ts:5`, `admin/…trpc.ts:5`,
   `no-cheat/…trpc.ts:5`, `versus/…trpc.ts:5`, `game-tracker/…trpc.ts:5`,
   `new-meta/…trpc.ts:5`, `list-builder/…trpc.ts:6` — all
   `import type { AppRouter } from '../../../server/src/routers'` (or
   `/index.js`). This is type-only (erased at build, zero runtime cost) and
   every instance stays inside one app's own client/server boundary — no
   app imports another app's router type.

## Options (destination for extracted code)

**A. Extend an existing package** (`server-core`, `ui`, `db`) — no new
package, ships inside something every consumer of that logic already
imports.

**B. New `packages/util`** — a small, dependency-free grab-bag for
string/math helpers that don't belong in `server-core` (which is
Hono/tRPC/Worker-shaped) or `ui` (React-shaped) or `db` (schema-shaped).
Nothing today occupies this niche; would be created fresh.

**C. Leave in place with a cross-reference comment** — cheapest option,
correct for logic that is small, stable, and either genuinely divergent
(so a shared function would need parameters/branches that erase the
simplicity) or already going away (Rule 3 doesn't apply to code slated for
deletion).

## Scores

Weights for this decision: Effort and Risk matter most (this is refactor
cost, not a runtime capability choice); Fit-to-stack next; Latency is
irrelevant (no user-facing perf effect from any option).

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| A. Extend existing package | 4 | 4 | 5 | 4 | 5 | 4 | **4.3** |
| B. New `packages/util` | 3 | 4 | 5 | 2 | 3 | 3 | 3.0 |
| C. Leave + comment | 5 | 3 | 5 | 5 | 5 | 3 | 4.2 |

B loses on Effort/Stack: a new package means a `package.json`, a
`tsconfig.json`, an entry in every consumer's `package.json`, and a new
place for the next agent to forget to look. It only wins where neither A
nor C fits — see item 3 below, the one case this doc routes to it.

## Per-item verdict table

| # | Item | Verdict | Destination |
|---|---|---|---|
| 1 | data-import slugify ×3 (genuinely differ) | **Extract now** | `server-core` (new `slug.ts` export), parameterize truncation length + apostrophe-strip as options; call sites pass their existing values so behavior is unchanged |
| 2 | content-ingestor slugify ×3 (byte-identical) | **Extract now** | `server-core` (same `slug.ts` — content-ingestor already imports `server-core` for `generateId`, so zero new dependency) |
| 3 | dice-notation average math ×2 (versus client vs server, differ) | **Extract now, new package** | `packages/util` (`dice-notation.ts`) — the one case that needs B: this logic is neither Worker/Hono-shaped (`server-core`) nor React-shaped (`ui`), and both the versus client and versus server need to import the *same* runtime code, which today they structurally cannot (client bundle vs Worker bundle) without a shared package. Reconcile the two regexes into one (support both `+` and `-` modifiers, matching the client's superset) and add `resolveMin`/`resolveMax` alongside it — the client already has `resolveMin` with no server counterpart, and any future dice-average consumer (e.g., list-builder point costing) hits the same fork if this isn't centralized now. |
| 4 | generateId reimplemented ×4 in game-tracker | **Extract now (delete, don't parameterize)** | Already exists: `server-core`'s `generateId()` (`id.ts`). Delete all four local `function generateId()`/`function id()` bodies in `match.ts`, `matchV2.ts`, `turn.ts`, `secondary.ts`; import from `@tabletop-tools/server-core`. This is not a design decision, it's a correctness fix wearing a Rule-3 costume — the hand-rolled ID is weaker (timestamp+short-random) than nanoid and the fix is a one-line import swap ×4. |
| 5 | gateway's 9 proxy handlers | **Extract now** | New file inside `apps/gateway` itself (not a shared package — this logic has exactly one consumer, the gateway's own Pages Functions runtime, which doesn't import `packages/*` today per the census). Write one `createProxyHandler({ envKey, stripPrefix })` in `apps/gateway/functions/_lib/proxy.ts`; each `[[path]].ts` becomes a 3-line call. This also gives D2-02 (app-roster manifest) a natural hook: the manifest entry can carry `envKey`/`stripPrefix` and generate these calls, but that's D2-02's job — this item only needs the handler factory to exist. |
| 6 | admin reimplements AppShell chrome | **Extend `ui`** | Add an optional `nav?: ReactNode` (or `extra?: ReactNode`) slot to `AppShell` rendered between the title and sign-out button; admin's 10-page tab strip becomes a passed-in slot instead of a fork. Low-risk, additive prop — no existing `AppShell` consumer needs to change. |
| 7 | bcp-scraper hand-rolled `cachedApp` | **Extract now (delete, don't parameterize)** | Already exists: `server-core`'s `createWorkerHandler` (`worker.ts:9-22`). bcp-scraper already depends on `server-core` (imports `generateId` from it per the census) — this is an unused-import-away fix, not new plumbing. |
| 8 | Cross-boundary relative `AppRouter` type imports (7 apps) | **Leave with comment** | No package. This is `import type` only — erased at compile time, zero runtime duplication, and it is the standard tRPC monorepo idiom (every tRPC starter ships exactly this pattern: client imports the server's router *type* via a relative path within the same app). A shared-types package would add an indirection layer to solve a problem that doesn't exist (no drift risk: TypeScript itself fails the build if client and server routers diverge, since it's the same type, not a copy). Correct move is one sentence in each `trpc.ts`: `// cross-boundary type import is the accepted tRPC monorepo pattern — see D2-07 item 8`. |

## Wargame: where the "extract everything" instinct breaks

Item 8 is the one place a literal reading of Rule 3 says "duplicated across
apps → extract" and gets it wrong. The pattern is duplicated in the sense
that the same line of code appears in 7 files — but it isn't duplicated
*logic*, it's a type import, and the "different apps" framing in the
original inventory is misleading: no app imports *another app's* router
type, each imports only its own. Extracting this into a shared
`@tabletop-tools/api-types` package would require every app to publish its
router type from a package boundary, which is real infrastructure (build
order, circular-import risk between the type package and the server that
defines the type) purchased to solve zero observed bugs. This is exactly
the over-abstraction the root rule ("keep the stack shallow") warns against
— flagged and left, per Option C.

Item 3 (dice math) is the mirror case: it looks like a two-line
duplication (leave-with-comment territory) until you read both
implementations and see they've already diverged in supported syntax
(`-` modifier) and error behavior (throw vs silent 0). Two-line functions
that have already forked are the leading indicator for the failure this
whole decision doc exists to prevent — the census's own list-builder note
(D2-04) shows a battle-size table forking ×3 from an original single
source. Catch it now, while reconciling the two versions is a small diff,
not later.

## Recommendation

**Primary:** Execute items 1, 2, 4, 5, 7 as extract-now against existing
packages (`server-core` gets `slug.ts`; `ui`'s `AppShell` gets a nav slot;
gateway gets a local proxy-factory). Create `packages/util` for item 3 only
— the dice-notation module — since it's the sole case where neither
`server-core` nor `ui` nor `db` is the right shape and two live call sites
in different runtimes need the same function. Leave item 8 in place with a
one-line comment in each of the 7 `trpc.ts` files pointing at this doc.

**Fallback:** If `packages/util` turns out to attract more than the dice
module within a quarter (i.e., another orphaned string/math helper shows
up needing a home), that's the trigger to keep it and treat it as the
platform's general-purpose utility package going forward. If it never
gains a second export, that's fine too — a one-export package is not
wasted effort, it's the correct size for the problem it solves.

## Flip triggers

- **Item 3 flips from `packages/util` to `server-core`** if list-builder or
  any other app later needs point-cost dice-averaging server-side in a way
  that couples it tightly to server-core's Hono/tRPC context — unlikely
  given today's evidence (pure math, no framework dependency) but would
  mean two homes for one function, which should collapse back to one.
- **Item 8 flips from "leave" to "extract"** only if a real cross-app type
  dependency appears (an app needing *another* app's router type, not its
  own) — that has not happened and nothing in the census suggests it's
  coming.
- **Item 5 flips from "gateway-local" to "shared package"** if a second
  Pages-Functions-style proxy consumer appears outside gateway; today
  gateway is the only Pages Functions surface in the repo (per its own
  census, zero package imports), so a shared package would have exactly
  one consumer — not yet justified.

## Implementation notes (ordered)

1. **generateId (item 4)** — pure deletion + import swap, zero behavior
   risk beyond ID format change (nanoid vs timestamp string; both are
   opaque strings, no consumer parses the format). Do first: smallest diff,
   removes a live correctness gap.
2. **createWorkerHandler (item 7)** — same shape: bcp-scraper's
   `worker.ts:30-33,64-66` replaced by importing `createWorkerHandler` from
   `server-core`, already a listed dependency. Do second, same reasoning.
3. **Gateway proxy factory (item 5)** — add `apps/gateway/functions/_lib/
   proxy.ts` exporting `createProxyHandler({ envKey, stripPrefix })`;
   rewrite all 9 `[[path]].ts` files to `export const onRequest =
   createProxyHandler({ envKey: 'VERSUS_API', stripPrefix: '/versus' })`
   (brain's differs only in `stripPrefix: '/brain/api'`). No `package.json`
   needed — it's a same-app relative import.
4. **AppShell nav slot (item 6)** — add optional prop to `AppShell.tsx`,
   update its test (`AppShell.test.tsx`) for the new-prop-present and
   new-prop-absent cases, then migrate admin's `App.tsx:64-111` to consume
   it. Do after 1-3 since it touches a shared, widely-imported component —
   land the low-risk backend items first.
5. **server-core slug.ts (items 1, 2)** — write one function covering
   content-ingestor's 3 identical bodies as the default case, with
   options for data-import's apostrophe-class and truncation differences;
   migrate content-ingestor's 3 call sites first (behavior-neutral, they're
   identical today), then data-import's 3 (verify truncation/apostrophe
   options reproduce existing output via a snapshot test before deleting
   the originals — this is the one migration with a real regression risk,
   since the three data-import bodies are confirmed to differ).
6. **packages/util + dice-notation.ts (item 3)** — new package, single
   export module. Reconcile server's `resolveAttacksExpected` (no `-`
   support) and client's `resolveAttacks`/`resolveMin` into one API;
   write the union-behavior test first (TDD per root CLAUDE.md Testing
   section) covering every case both original functions handled, confirm
   it fails against neither original alone, then implement and cut over
   both `attackCount.ts` and `pipeline.ts` to import from `packages/util`.
   Do last — it's the only genuinely new package and the only migration
   touching a hot path (versus's Monte Carlo engine).
7. **Item 8 comment-only** — add the one-line pointer to each of the 7
   `trpc.ts` files in the same pass as a cleanup commit; no functional
   change, bundle with whichever of 1-6 lands last to avoid a
   comment-only PR.
