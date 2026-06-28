# CLAUDE.md — Tabletop Tools Platform

> Read SOUL.md first. SOUL.md is the platform's "why" — vision, values, and the
> long-term shape of the thing. This file is the "how." Every decision here
> flows from SOUL.md.

---

## What This Platform Is

Tabletop Tools is a monorepo of tools for tabletop miniature wargamers. One login. Shared UI.
Each app deploys independently and does exactly one thing.

Each app has its own `CLAUDE.md` with architecture and implementation detail.

### Repo layout

- `apps/` — independently deployable apps (brain, versus, list-builder, tournament, study, physics, gateway).
- `packages/` — shared code (`ui`, `game-content`, `server-core`, `game-data-store`, etc.). Imported by apps.
- `scripts/` — one-off shell scripts for ingestion bridges and admin chores. Not load-bearing for the running system (see Rule 4).
- `docs/` — long-form plans, design notes, and references.

---

## Project Rules

### 1. One data source per entity
Don't build parallel implementations of the same data for different apps. If units exist in one
store, every app reads from that store. No copies, no sync, no "this app's version."

Concrete instances of this rule:

- **Tournaments and meta analytics share one data model.** A tournament you run and a tournament
  scraped from BCP are the same thing in the database. One set of tables for events, players,
  pairings, results. No import/export pipeline between apps.
- **One canonical entity registry.** Factions, subfactions, detachments — one set of tables,
  queried by everything. No app maintains its own lookup map. If the registry needs a new entry,
  it goes in the database.

### 2. Shared UI components
Same card, same widget across all apps. If the brain app has a unit card, versus uses the same
component. Build once in `packages/ui`, import everywhere.

### 3. DRY across app boundaries
If two app servers have similar logic, extract it to a shared package. Similar functions in
different apps is a bug, not a pattern.

### 4. Everything is a callable function
Build as an importable module first, then wrap it for CLI, cron, or API. Every data process,
cleanup, and setup is a repeatable function callable from the server layer. One-off shell
scripts in `scripts/` are allowed for ingestion bridges and admin chores, but anything the
running system depends on must be importable code.

### 5. 11th edition is the target edition
11th edition is the only edition under development. New features, parsers, rules logic, and
data sync target 11th edition exclusively. 10th edition content is preserved and tagged as
legacy in the brain but is not updated.

The full 10e→11e migration is in progress; see
`docs/superpowers/plans/2026-06-12-brain-11e-edition-migration.md` for current state. Until
that plan completes, parts of the brain still serve 10e by default — the rule is the direction,
not yet the runtime.

### 6. Data lives in datastores, not source code
No hardcoded lookup tables in `.ts` files. Faction maps, detachment lists, source registries —
all go in the database (or other datastore). Code reads from data, doesn't contain data.

### 7. No test data in production
No hardcoded test users, tokens, or secrets in source code. Test infrastructure uses isolated
environments only. E2E tests clean up after themselves. No test setup function can touch prod.

### 8. Skinnable UI
Separate data/logic from presentation. Components take props and render. Hooks and state
management handle what to show. Swapping the component layer gives you a new skin without
touching logic.

### 9. Worker invocations are bounded — chunk by design, not retrofit
Every Cloudflare Worker entry point lives under a fixed CPU budget (50 ms on Free, 30 s
default on Paid, 5 min absolute max via `[limits] cpu_ms`). HTTP handlers have a wall-clock
ceiling on top of that. Any pipeline that approaches the budget MUST be chunked at design
time — split into per-source / per-batch / per-resource endpoints that the caller
orchestrates and that each comfortably fit under ~10 s of CPU.

Do not write a long-running synchronous handler and discover the cap when it breaks in
prod. The data-import `/sync` failures (BSData parsing accumulating CPU across 30 catalogs
in one invocation, then hitting 1102) were a direct cost of skipping this rule. When a new
pipeline reaches more than a couple of upstream sources or operates on more than ~10 k
records of work, the first design question is "how does the caller orchestrate this in
chunks," not "how big can I make this handler."

### 10. Background agents work on isolated worktrees
Any subagent dispatched for non-trivial work — refactors, new apps, sweeps,
investigations longer than a few minutes — runs in its own git worktree via
the agent tool's `isolation: "worktree"` mode. Agents on the shared working
tree race each other: stashes get swapped, edits get clobbered, PRs land
half-merged. Today's session lost the `factionId`-normalize edits twice and
the BSData-repo edit once to exactly this. Use worktree isolation
whenever an agent will touch files for more than a quick read.

**First action on an isolated worktree:** every agent runs
`bash scripts/agent-worktree-init.sh` (or `pwsh scripts/agent-worktree-init.ps1`)
to print its `WORKTREE_ROOT` banner. The Edit/Write tools accept absolute
paths and write wherever told — agents that mentally default to
`C:\R\tabletop-tools\...` end up editing the main checkout even when their
git operations correctly target the worktree. Six of seven agents in the
2026-06-27 batch hit this and recovered via `git status`. Reading the script
output before any Edit makes the boundary explicit.

---

## Data Boundary

**No GW (Games Workshop) content is ever committed to this repository.**

Unit profiles, weapon stats, ability text, and faction data are loaded at runtime from community
sources (BSData, Wahapedia). Nothing from GW lands in committed source files or the DB schema.
The `GameContentDisclaimer` component surfaces the data source to users.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Front to back, no exceptions |
| API | tRPC + Zod | Type-safe end-to-end, no REST boilerplate |
| UI | React | Clean, uncluttered |
| Database | Turso (libSQL/SQLite) | Edge-compatible, lean |
| ORM | Drizzle | Lightweight, type-safe, SQLite-native |
| Auth | Better Auth | TypeScript-first, self-hosted |
| Deploy | Cloudflare Workers + Pages | Free tier, near-zero cost |
| Package manager | pnpm (workspaces) | Monorepo-native, fast installs |
| Build / bundler | Vite | Fast dev server, ESM-first |
| Test runner | Vitest | Vite-native, ESM-compatible, fast |

---

## Testing

**TDD for logic, algorithms, and routers.** Write the test first, confirm it fails, implement,
confirm it passes.

**Exception:** exploratory work (scrapers, pipelines, graph builders) — test after the shape
stabilizes, not before.

**Real dependencies in tests.** In-memory SQLite, real functions. Only mock external APIs and
system boundaries (network calls, subprocesses). A mock that passes while the real thing fails
is worse than no test.

---

## Code Quality

**Prettier** for formatting. **ESLint + oxlint** for code rules. **TypeScript strict** for
type safety. **Pre-commit hooks** run all three — code that doesn't pass doesn't land.

When a hook fails, fix the underlying issue. Never `git commit --no-verify` to bypass it.
The hook is there because someone got burned by skipping the check; you don't get to opt out.

---

## Rules for Every Session

- Scope before you start — understand what you're touching and what depends on it.
- No features that aren't needed yet.
- Before claiming anything about data, run a query. Don't eyeball it, don't reason from memory.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.
- Don't try to prove you're right. State your reasoning once, briefly; then defer or verify. Don't re-litigate, justify, or argue the point.
- If you need to verify something, write a test. Don't run throwaway/ad-hoc checks to make a point, and don't ask permission to test — just write the test.
- Follow the process all the way through. When you change data, rebuild the dependent indexes/derived artifacts in the same pass — never leave "data updated, indexes stale" or bad data comes through.

---

## Environment + Operational Gotchas

These are caltrops people have stepped on. Always honor them.

- **`wrangler r2 object put` defaults to LOCAL.** Always pass `--remote` for
  production R2. Otherwise the upload silently lands in the local emulator
  and "everything looks fine" until you check prod.
- **Wrangler env var override.** Prefix wrangler commands with empty
  `CF_API_TOKEN=` + `CLOUDFLARE_API_TOKEN=$CF_FULL_API_TOKEN` to override
  deprecated env vars, OR ensure the new `CLOUDFLARE_API_TOKEN` is set in
  the calling environment.
- **Purge CDN cache after every deploy.** `deploy-gateway.sh` does this
  automatically using `CLOUDFLARE_API_TOKEN`. After any brain data upload
  + Worker deploy, also purge cache. When Micah says something is broken
  on the live site, check the cache first.
- **Clear cache before verifying anything.** `wrangler r2 object get`,
  Cloudflare CDN, browser cache — all can return stale data. Before
  concluding something didn't work, clear the cache.
- **Don't chain `cd path && command` in bash.** Compound commands with
  `cd` trigger a manual approval prompt. Use absolute paths in tool args
  (Read/Edit/Write already take absolute paths). For pnpm, use
  `pnpm -F <package>` or `pnpm --dir <path>` from the repo root.
- **Playwright MCP browser is sandboxed.** No access to Micah's Chrome
  passwords, cookies, or sessions. For pages that need auth, use
  `launchPersistentContext` with a local cookie directory rather than
  the MCP browser.

---

## Memory Hygiene

The memory system at `C:\Users\micah\.claude\projects\C--R-tabletop-tools\memory\`
is written by Claude based on in-conversation corrections. Apply these rules
when deciding whether to save.

1. **Search before writing.** Before creating a new feedback file, grep
   existing `feedback_*.md` for similar themes. If one covers it, update
   that file. Don't create duplicates.

2. **Don't save single-incident lessons.** Save only when the correction
   is a STANDING pattern Micah will give repeatedly. One-off clarifications
   are conversational, not durable.

3. **Index is one line per pointer.** `MEMORY.md` is an index, not a
   memory. Never put multi-line detail in `MEMORY.md`. Detail goes in
   topic files, linked by name.

4. **Stale state goes in git, not memory.** File counts, test counts,
   deployment state, phase status — derivable from code. Don't save
   these as memories; they go stale within days.

5. **Domain bugs live as code comments.** If a bug is worth remembering,
   put a comment at the affected file:line. Don't carve the rule into
   memory where it rots when the code changes.

6. **Consolidate before adding when MEMORY.md hits its limit.** If
   `MEMORY.md` exceeds 150 lines, consolidate existing entries before
   adding new ones. Don't just trim — merge.

7. **Approval applies to the whole approved unit.** Don't re-ask for
   sub-steps inside a plan Micah already approved unless the step is
   prod-touching or irreversible.

---

## Skills — project override

The `superpowers:using-superpowers` SessionStart skill says: "If you think
there is even a 1% chance a skill might apply to what you are doing, you
ABSOLUTELY MUST invoke the skill." **For this project, that rule is
suspended.** It is incompatible with how Micah and Claude actually work
together: interactive iteration, conversational planning, fast SCAD tweaks,
quick refactors, ad-hoc code edits.

Replace it with this rule:

> Invoke a skill ONLY when (a) the user explicitly types `/<skill-name>`,
> or (b) the task genuinely matches the skill's stated purpose AND the
> overhead of following its checklist is justified by the task's scope.
> Routine code edits, conversational design discussion, single-file
> tweaks, and quick research lookups do NOT trigger skill invocation.

When unsure, prefer NOT invoking. If the skill would have helped, it's
fine — the cost of skipping is small. The cost of invoking on every turn
is real (overhead, friction, conversational drag).

Explicit user invocation (`/skill-name`) always wins. Always follow what
the user explicitly asks for over any default behaviour from this rule.
