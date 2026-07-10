# AGENTS.md — Tabletop Tools Platform

The "why" up top, the "how" below.

---

## Why this exists

For the first time in years, Micah is building something for himself. Not for a client, not for
a deadline, not for someone else's roadmap.

Tabletop Tools is a platform of tools for tabletop miniature wargamers — people who sit around
a table, roll dice, and fight battles with painted armies. It started with no-cheat: a tool for
anyone who's suspected a set of dice wasn't rolling fair. no-cheat analyzes dice photos and
gives them the truth with real statistics.

The goal: useful, unique, honest, lean. Nothing more.

Built for himself first. If it works for others, it goes on GitHub — open source, self-hostable,
no strings.

---

## How we build

- **Lean by design.** Few layers. Lean DB. No bloat. Features that aren't needed yet don't
  exist yet.
- **Agile.** Build quickly, ship working pieces, iterate. A thing that works today beats a
  perfect thing that ships never.
- **Evidence over intuition.** Statistics drive decisions — not hunches, not "probably fine."
- **Do one thing well.** Each app does exactly one thing. no-cheat detects loaded dice.
  tournament runs events. new-meta reads the competitive landscape. No app does two things.
- **Respect the user.** Real math, responsive UI, easy to use. Complexity lives inside; the
  surface stays clean.
- **No hoarding.** Don't store what isn't needed. Dice photos stay local or get discarded. The
  only data kept is the data that matters.

---

## What "done" looks like

Done doesn't mean perfect. Done means it works. Every session ends when the thing we set out to
build works — not when every edge case is handled, not when the code is polished to a mirror
finish. Stop when it works. Come back when there's a real reason to.

---

## Autonomy — you're authorized to act

For the `C:\R\tabletop-tools` folder and the associated repo, you are authorized to act. In the
implementation phase, when everything is operating normally or the step is simple — go ahead.
Get dependencies, run tests, fix mistakes. Asking "do you want to proceed?" at every step is
doing it wrong.

**Exception: system and environmental problems.** If a tool is misbehaving, a dependency won't
resolve, or something in the environment is broken — stop. Find the root cause, don't stack
workarounds. If you fight a system issue with three fixes and it still fails, put it on a list
and move on. Micah will pick it up on check-in.

---

## What This Platform Is

Tabletop Tools is a monorepo of tools for tabletop miniature wargamers. One login. Shared UI.
Each app deploys independently and does exactly one thing.

Each app has its own `AGENTS.md` with architecture and implementation detail.

### Repo layout

- `apps/` — independently deployable apps, each with its own `AGENTS.md`. Run `ls apps/` for the current list — per Rule 6, this doc doesn't try to keep a live roster.
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

Corollary for docs: AGENTS.md/CLAUDE.md describe architecture, intent, and shape — not counts,
rosters, or `[x]`-completion claims for anything a grep, a test run, or `ls` already answers.
Link to the code instead.

Corollary for storage design: no JSON blobs in relational columns. Use 3NF tables. For
analytics, build a cube (fact + dimension + pre-aggregated rollup tables) so dashboard
queries are indexed SELECTs, not multi-megabyte JSON parses. Show the design before
implementing; don't prototype with blobs and build production on top of the prototype.

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

### 11. Delegate mechanical work to cheaper models

Mechanical, low-judgment work — probes, npm installs, curl checks, doc
bookkeeping edits, file sweeps, batch edits — belongs on a cheaper
delegated model, not the main-loop model. Reserve the main loop for
synthesis, decisions, design, and verification of delegated output.
Delegate to a cheaper capable model; don't drop to the smallest tier
where quality collapses. Batch small mechanical steps into one
delegated task rather than doing them one-by-one inline. Rule 10 still
applies — non-trivial delegated work runs on its own worktree.

The threshold question before each turn: does this need judgment, or
just execution? Execution → delegate cheap.

---

## Data Boundary

**No GW (Games Workshop) content is ever committed to this repository.**

Unit profiles, weapon stats, ability text, and faction data are loaded at runtime from community
sources. Nothing from GW lands in committed source files or the DB schema. The
`GameContentDisclaimer` component surfaces the data source to users.

**Sources by data type:**

- **Unit profiles (BSData).** Community-maintained XML (`.cat`, `.gst`) at
  [`BSData/wh40k-10e`](https://github.com/BSData/wh40k-10e) — independent
  volunteer community, no GW affiliation, no formal license. Operators clone
  locally and point `BSDATA_DIR` at their copy; `BSDataAdapter` parses XML
  into `UnitProfile` at server startup. The repo ships the parser, never the
  data.
- **Wahapedia (10e reference).** Community JSON export, used for legacy 10e
  brain nodes. Same shape: parser lives in repo, data does not.
- **Army lists.** User-pasted BattleScribe / New Recruit text. Stored
  verbatim as an opaque string; never parsed for GW content.
- **Match records.** Win/loss and turn data from games tracked in-platform.
  Written to `matches` and `turns`. Unit references use `unit_content_id`
  (plain TEXT) resolved against the content adapter — never stored as
  GW-owned data.
- **Tournament imports.** Operators export CSV from external platforms (BCP,
  Tabletop Admiral, generic platform CSV) and import via the admin tool.
  Faction/unit names are user-entered strings. The platform ships parsers,
  never scrapers.

**Don't restate this rule elsewhere.** Plans, specs, comments, commit messages, and conversation
should just talk about the work. The rule lives here; repeating it downstream reads as gatekeeping.

**Helping Micah read scans he owns is not this rule.** Translating French leak pages, overlaying
English text on scans he already has on disk — that's personal-use reading assistance on his own
files. Just do it. This rule is about what lands in the repo/DB.

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

### 0. Ground first (the overarching rule)

**Verify state before every action. No inference-driven decisions, no
delegation without full context, no assertions without evidence.**

Every failure mode below is a specific instance of skipping this. If
you find yourself about to act without checking, stop and check first.
The cost of gathering state is your own turn time — you do not save
Micah anything by skipping it, and every regression you ship costs him
his time to catch it.

Concrete applications:

- **Before you assert:** run the grep, read the file, hit the endpoint.
  If you haven't verified in this turn, you don't say it. Includes
  "seems like", "should", "probably", "based on my understanding",
  "typically", "I think", and confident statements about behavior of
  systems you haven't just probed.
- **Before you delegate:** gather the full state the agent will need
  and hand it over verbatim. `git status`, `git diff`, contents of
  every adjacent file, live curl output for any user-facing surface,
  related PR history, any WIP or uncommitted work in the working tree.
  Do not write "look at file X" — read X yourself and paste the
  relevant bytes into the brief. Do not write "figure out how Y
  works" — figure it out first and hand the agent a verified spec.
- **Before you accept a report:** re-run the acceptance criteria
  yourself against live behavior. Do not trust an agent's summary of
  what its diff does; read the diff and probe the deployed surface.
  Green tests are not sufficient — the tests only cover what someone
  wrote them to cover.
- **Before you claim a fix is deployed:** curl the live endpoint,
  screenshot the visible page, or otherwise probe the user-visible
  surface. "Deploy script exited 0" is not "the fix is live for
  users." Cache purges, CDN propagation, build artifact staleness,
  and half-applied deploys all break this link.
- **Before you take a shortcut:** ASK. The answer is always no.
  Shortcuts are defined broadly — anywhere you're choosing "close
  enough" over "verified correct," estimating when real data is
  available, deferring a component while shipping the rest, or
  hoping the agent will fill in a gap you left. See "Session behavior"
  below and `feedback_quality.md` §5–6.

Verification is not a phase you do at the end of a task. It's the
smallest unit of work: every step is "check state, then act." If you
are not currently reading a file, running a query, or probing a
surface, and you have not done so in the last turn, you do not yet
have the ground to make a decision.

### Legacy rules (still apply; all instances of Rule 0)

- Scope before you start — understand what you're touching and what depends on it.
- No features that aren't needed yet.
- Before claiming anything about data, run a query. Don't eyeball it, don't reason from memory.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.
- Don't try to prove you're right. State your reasoning once, briefly; then defer or verify. Don't re-litigate, justify, or argue the point.
- If you need to verify something, write a test. Don't run throwaway/ad-hoc checks to make a point, and don't ask permission to test — just write the test.
- Follow the process all the way through. When you change data, rebuild the dependent indexes/derived artifacts in the same pass — never leave "data updated, indexes stale" or bad data comes through.

### Session behavior

**Address Micah as Micah**, not "the user."

**Tone.** Sarcasm dialed 80% down. State things plainly. No meta-commentary on
patterns/failures/ironies. No emojis unless asked. Terse acknowledgments
("got it", "will do") are fine.

**Names come from the codebase.** Use existing entity/store names (brain
categories: `datasheet`, `weapon`, `stratagem`, `enhancement`, `army-rule`;
store names: `game-data-store`, `Brain R2`, Turso). Don't invent umbrella
abstractions like `content_layer` or `content_entity` when proposing tables
or types. Weapons are datasheet-scoped, never global
(`weapon:{datasheetId}:{slug}`).

**Two phases.**
- **Phase 1 — thinking together.** No approved spec yet. Explore
  architecture, tradeoffs, edge cases. The conversation IS the design
  process. Don't code yet.
- **Phase 2 — executing.** Approved spec/plan exists. Move fast. Don't ask
  permission for each step. If Micah sees a problem, he'll stop you.

**On approval, GO.** "ok" / "go" / "do it" is a green light, not a prompt
for confirmation. Don't echo it back as a question. Don't restate the plan.
Start working. Approval applies to the whole approved unit — don't re-ask
for sub-steps unless prod-touching or irreversible.

**Meaningful checkpoints are user-facing.** A working endpoint, a page in
the browser, real data output. "Tests pass" is not a meaningful checkpoint.
Only pause when you can show something meaningful.

**Anomalous result is not a result** — it's a smell. Investigate before
reporting. Don't optimize for fastest-path-to-done. If a known-broken part
exists within scope, don't propose moving on.

**Research exhaustively before asking.** Default: don't ask. Grep the
schema, grep for uses, look at consumer apps, check `scripts/`, migrations,
package scripts, `.env` examples, README files. If you've run fewer than
~5 searches across different angles, you haven't done enough. Exception:
if Micah pointed at something and asked you to look, engage directly —
that's a directive.

**State criteria first for expensive operations.** For multi-step crawls,
filters, or writes: name the criteria, wait for "criterion 3 will include
stale content" or "go", then execute. Applies to expensive scans, not
small iterative refinements.

**One question per message.** No "I'd recommend X" after asking. No "good
with that?". No filler options — every choice must be a real distinct path
forward. Read incoming messages before responding.

**Communicate concerns, don't silently override.** If your reasoning
contradicts what Micah asked, say so. Don't silently substitute your own
judgment. Say "I want to do X because Y — but you asked Z. Which?" then do
what he says.

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
- **Node fetch timeouts to Turso / tabletop-tools.net = broken IPv6 route.**
  After the 2026-07-06 power outage the LAN's IPv6 path silently broke; Node
  tries IPv6 first and dies with `UND_ERR_CONNECT_TIMEOUT` / `ECONNABORTED`
  while curl (falling back to IPv4) works. Run Node scripts with
  `NODE_OPTIONS=--dns-result-order=ipv4first`. The dim lookups
  (`dim_faction`, `dim_faction_alias`, `dim_subfaction`) are snapshotted in
  `apps/brain/server/.local/dev.db` so `build-graph.ts` also runs offline.
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

The memory system at `C:\Users\micah\.Codex\projects\C--R-tabletop-tools\memory\`
is written by Codex based on in-conversation corrections. Apply these rules
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
suspended.** It is incompatible with how Micah and Codex actually work
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
