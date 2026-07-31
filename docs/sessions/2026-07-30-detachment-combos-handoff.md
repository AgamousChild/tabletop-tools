# Handoff — 11e multi-detachment combos

Branch: `feat/11e-detachment-combos`, **not pushed, no PR yet**.
Main requires PRs — an active `Protect-requirePR` ruleset with no bypass actors,
so direct pushes to `main` are rejected. Use `gh pr create` + `gh pr merge --squash`.

## Commits on this branch

| commit | what |
|---|---|
| `88411b7` | `fix(meta)`: add `source_list_id` to inline `meta_event_players` schemas (merged to main as PR #152) |
| — | `feat(meta)`: model 11e multi-detachment armies as combos (migration 0015, schema.ts, dim sync, backfill module) |
| — | `refactor(test)`: derive test schemas from the migrations, not by hand (−458/+61) |
| — | `feat(meta)`: enumerate legal 11e detachment combos + keyset cursor |
| — | `feat(bcp)`: parser emits detachment array + Detachment Points |
| `614c0ee` | `feat(meta)`: resolve multi-detachment armies against the registry |
| `ce50bff` | `feat(meta)`: carry the detachment combo into the cube fact grain (migration 0016) |
| `56054ef` | `feat(ops-mcp)`: expose dim sync + combo enumeration in the BCP pipeline |
| `33131bd` | `fix(meta)`: key fact_game_results to its pairing, and batch the meta writes (migration 0017) |

Already on `main` from earlier in the session: `a0cee41` (listId capture +
`/v1/armylists` endpoint fix), `23660f4` (parse CLI wrapper), `864a222`
(multi-line BattleScribe + preamble-tolerant detection), `9fe3660` (weekly
scrape workflow), `7dfa982` (oxlint fix, PR #151), PR #152.

## Test counts as of this handoff

`packages/db` 116 · `packages/server-core` 118 · `apps/tournament/server` 107 ·
`apps/bcp-scraper/server` 96 · `apps/new-meta/server` 49 ·
`apps/content-ingestor` 275. oxlint clean, `drizzle-kit check` clean.

server-core 91 → 118; bcp-scraper 99 → 96 because `splitDetachmentNames` and its
3 tests moved to server-core, which owns the registry that decides whether a
split is right. Run each package with its OWN vitest config (`pnpm -F <pkg>
test`) — a root `vitest run --dir packages` reports 125 phantom failures in
`packages/ui` purely from the missing jsdom environment.

Compare test COUNTS after any change, not just green: a Vitest file that fails to
PARSE is reported as fewer tests passing with **no failure**. That happened once
during this session (73 vs 80) and was only caught by comparing.

## Known pre-existing issues, not introduced here

- `apps/bcp-scraper/server/src/lib/pipeline.test.ts` has 2 `tsc` errors
  (`Object is of type 'unknown'`, currently lines 191 and 238). Present before
  this session; CI's build step passes regardless. Left alone deliberately.
- `parse-lists.ts` writes `list_ttt` as a JSON blob in a relational column,
  which the root CLAUDE.md rule 6 corollary rules out. Pre-existing design.
- `meta_cube_status` was left `status: 'running'` with `last_completed_at`
  ~2026-07-14 by an earlier `runPipeline` that never finished.

## Why this work exists

11e armies take MULTIPLE detachments under a Detachment Points budget. Measured
on the Jun–Jul 2026 scrape: **3,978 of 6,246 lists (64%) carry a "Detachment
Points" marker**. The old model stored one detachment per player, so the majority
of scraped armies were represented as something they are not.

Symptom that exposed it: the single-detachment backfill resolved only **1,271 of
~4,900** parsed lists, because combined strings like
`ironstorm-spearhead-and-the-living-miracle` cannot match one dim row.

## 11e rules (from the brain's Army Construction node)

- Each detachment costs **1–3 DP**.
- Budget: **Incursion (1,000 pts) = 2 DP**, **Strike Force (2,000 pts) = 3 DP**.
- Legal Strike Force builds: one 3pt · one 2pt + one 1pt · three 1pt.

## Done — already applied to prod Turso

**Migration `0015_detachment_combos.sql`** (applied, 12 statements):
- `dim_detachment.dp` (nullable — 10e rows have no 11e cost, distinct from 0)
- `dim_detachment_combo` — id is `{faction}:{slug}+{slug}` with member slugs
  **sorted**, so writing order can't yield two ids for one army.
  `is_legal` = 1 enumerated from DP rules, 0 = observed but not legal.
- `dim_detachment_combo_member` — combo → detachment bridge
- `meta_event_player_detachment` — player → detachments, with `position` and
  `detachment_points` (denormalised on purpose: records cost at time played)
- `combo_id` on `meta_event_players` and `fact_game_results`

**Fact grain is deliberately unchanged**: one row per player per game, combo as an
attribute. Fanning out per detachment would count a two-detachment army as two
games and corrupt every win rate.

**dim sync** (`scripts/sync-detachment-dims.ts`, applied): `dim_detachment`
253 → **324 rows, 266 with dp**. Added the 71 detachments the brain had and the
dim lacked (`steel-hammer`, `armoured-speartip`, `headhunter-task-force`,
`the-living-miracle`, `legacy-of-grace` …). 58 dim-only rows keep `dp = NULL`
(10e-era). 0 blocked.

Brain dp source: `apps/brain/server/.local/brain/cube/fact_node.jsonl`, nodes with
`category:"detachment"`, `edition:"11th"`, `"dp":N`; id `11e:det:{faction}:{slug}`.

**Combo enumeration** (`scripts/enumerate-detachment-combos.ts`, applied):
**863 combos** across 27 factions — 266 singles, 561 pairs, 36 triples — and
1,496 membership rows. Verified 0 over budget, 0 orphan members.

**Keyset cursor**: `backfillDetachmentsFromLists` takes `afterId`, returns
`lastId`, orders by id. Unresolvable rows keep `detachment_id` NULL, so the old
bare `LIMIT` re-read the same chunk (17 passes, `scanned=8500`, ~1,271 real
updates). CLI stops on an empty pass, not `updated === 0`.

**Test schema helper** (`packages/db/src/test-schema.ts`): `applyTestSchema()`
applies the committed migrations to in-memory SQLite; `seedReferenceDims()` seeds
`dim_for_type` 1–8 and `dim_granularity` 1–3 (**names are capitalised —
`Event`/`Weekend`/`DataSlate`/`TournamentPack`, `Faction`/`SubFaction`/
`Detachment`, verified against prod; new-meta resolves them BY NAME**) plus the
`unknown` faction. Replaced 8 hand-rolled DDL blocks, −458/+61 lines. Import as
`@tabletop-tools/db/src/test-schema` (matches `@tabletop-tools/auth/src/test-helpers`).

Do NOT try to codegen DDL from `schema.ts`: drizzle-kit 0.30.6's `api` throws
`Dynamic require of "fs" is not supported` under Vitest, tsx AND node, and its
CJS build isn't reachable via the exports map. Three attempts, abandoned.

## Remaining steps, in dependency order

### 1. Parser emits a detachment ARRAY — DONE

`ttt-types.ts` list gained `detachments?: Array<{id, name}>` and
`detachmentPoints?: number`. `detachmentId`/`detachmentName` now hold the
primary (first written) detachment for back-compat.

`gw-parser.ts` strips `(N Detachment Points)` into `detachmentPoints`, then
splits the remainder via exported `splitDetachmentNames()` (on ` and ` or `,`).
`bs-parser.ts` emits a one-element array plus DP so both parsers return one
shape. gw-parser tests: 20 → 28.

Measured which parser needed it: of 600 DP-marked lists, **598 are GW-app family
and 418 of those join with " and "**; BattleScribe family had 2 samples and 0
conjunctions. Multi-detachment is a GW-app-format phenomenon.

**THE TRAP, and why splitting is best-effort only:** real detachment names
contain "and" — `Penitents and Pilgrims` is ONE detachment
(`adepta-sororitas:penitents-and-pilgrims`). The parser has no registry, so it
cannot distinguish that from a two-detachment army and will report
`['Penitents', 'Pilgrims']`. There is a test asserting exactly this to document
the limitation. **Step 2 MUST try the full `detachmentName` string against
dim_detachment BEFORE falling back to the split parts.** Otherwise every
`X and Y`-named detachment silently becomes two bogus detachments.

Also note `slugifyDetachment` keeps apostrophes while dim slugs convert
punctuation to `-`; `compactKey` in `meta-detachment-backfill.ts` already
normalises both sides — reuse it, don't rewrite it.

### 2. Backfill writes the bridge + combo_id — DONE

Applied to prod. **10,056 of 10,178 parsed rows resolved** (98.8%), 12,599 bridge
rows, **2,479 two-detachment and 32 three-detachment armies**, 11 combos recorded
illegal, 178 unresolved, 72 declared-DP mismatches. All integrity checks zero
(no orphan detachments/combos, positions contiguous from 1, bridge count matches
`member_count`, every combo row has a primary).

Three things the plan below did not anticipate, all found by measuring prod:

1. **No stored blob has the `detachments` array or `detachmentPoints` field.**
   Every row predates the step-1 parser, so the array path is dead until
   `parse-lists` is re-run. Extraction reads both shapes.
2. **`detachmentName` is frequently the whole rest of the list body** — 2,109 of
   6,000 sampled carry newlines, 1,163 a `Force Dispositions` line whose mission
   picks ("Take and Hold", "Purge the Foe, Reconnaissance") contain their own
   "and"s and commas. The declaration is ONE line; the DP marker terminates it.
   Only 46 of 400 sampled blobs carry `list.factionId`, so the faction header to
   skip comes from the player row, and some blobs glue the chapter straight on
   ("Space WolvesSaga of the Great Wolf", 69 rows).
3. **Marine chapters are `dim_subfaction` children of `space-marines`**, where
   the shared detachments live (46 rows vs 3 for dark-angels). Resolution AND
   enumeration inherit the parent pool. Without it every chapter army resolved
   to nothing, and once resolved was recorded as an illegal build.

**The trap is worse than "Penitents and Pilgrims".** That case is a
one-detachment army whose name contains "and". The harder case is a TWO
-detachment army where one member's name contains "and":
`Legends of Saga and Song and Saga of the Beastslayer` (60 rows). No split
handles it — a flat split silently wrote one wrong detachment. Resolution is now
registry-driven in three steps: whole string exact → cover the string with known
names (fewest segments) → split parts. Exact-only in step 1 matters, because the
prefix fallback would match "Cursed Legion" in "Cursed Legion and Skyshroud
Spearhead" and drop the second detachment.

Measured effect of each fix, same dry run: unresolved **1,500 → 307 → 181**;
combos recorded illegal **11 → 389 → 32**; DP mismatches **153 → 79**.

Re-run enumeration after any `dim_detachment` change: **863 → 3,490 combos** once
subfactions inherit the parent pool.

### 2b. Remaining unresolved (178 rows, 160 distinct)

Long-tail detachments genuinely absent from `dim_detachment` — "Equatorial
Hordes", "Vengeful Hosts", "Cavalcade of Chaos", "Grizzled Company" — plus rows
whose `detachmentName` is raw list junk. The fix is `sync-detachment-dims.ts`
once the brain has them, not more parser work.

The work unit is now a missing `combo_id`, NOT a missing `detachment_id` — the
earlier pass had already set `detachment_id` on ~6,000 rows, and those are
exactly the rows that still needed a combo. Keying on `detachment_id IS NULL`
would have skipped every one of them.

### 3. Ingest writes them on the way in — DELIBERATELY NOT DONE

`MetaIngestPlayer.detachmentId` already exists and **no caller sets it**. Neither
`upsertMetaEvent` caller can: BCP (`apps/bcp-scraper/server/src/lib/scrape.ts`)
only has faction and pairing data at event-ingest time, and the list text it
would need arrives in a LATER pass (`bcp_scrape_lists` → `bcp_parse_lists`).
Tournament (`apps/tournament/server/src/routers/tournament.ts:436`) passes
`listText` and no detachment.

So this step is not merely unnecessary, it is impossible for BCP: the detachments
cannot be known when the event is written. The backfill is already part of the
pipeline and is where the knowledge exists. Adding a detachment array to the
ingest input would be a second dead parameter.

Revisit only if a source appears that supplies resolved detachment ids at ingest.

### 4. Cube carries combo_id — DONE

Migration 0016 adds `opponent_combo_id` + a `(combo_id, opponent_combo_id)`
index, so combo-vs-combo is an indexed SELECT. Without it the detachment SET
would have been the only dimension with no "versus" mirror. `buildCubeForEvents`
writes both perspectives; **50,673 of 66,695 fact rows now carry a combo** (the
rest are events whose lists were never parsed).

Fact grain is unchanged — one row per player per game.

### 5. MCP tools — DONE

`bcp_sync_detachment_dims` and `bcp_enumerate_combos` added; `bcpPipelineFull`
goes 4 steps → 6, with both inserted between parse and backfill. Order matters:
the backfill records a combo illegal only when enumeration has NOT produced it,
so running it against a stale dim marks legal builds illegal.

## The cube was silently double-counting games — fixed

The 155-event rebuild left **23,995 duplicate rows** (90,690 rows for 66,695
games). Nothing failed; every affected game was counted twice in every win rate.
Found only by checking the grain after the rebuild.

`fact_game_results` had no key of its own. Idempotency rested on
`buildCubeForEvents` issuing DELETE-by-event and the INSERTs as SEPARATE,
non-transactional statements — so anything re-applying a request duplicated
rows. The damage matched: rounds 1–2 of an event correct, a contiguous tail of
its pairings inserted twice.

Both guards are now in place:
- delete + all inserts for an event go in ONE `db.batch` (a transaction), so a
  retry re-runs the delete too and cannot stack
- migration 0017 adds `pairing_id` + `UNIQUE (pairing_id, player_id)`

**The key is the pairing, not `(event, player, round)`** — 27 players
legitimately have two pairings in one round against different opponents, so the
obvious natural key would reject real data. `pairing_id` is NULL for pre-0017
rows; they gain protection when their event is next rebuilt.

Duplicates were verified identical on every measure before removal. Win rates
moved materially afterwards: `orks:green-tide+taktikal-brigade` 216 → 165 games.

**Check `COUNT(*)` vs `COUNT(DISTINCT event_id, player_id, round, opponent_id)`
after any cube rebuild.** That one query is what caught this.

## Write batching — the round-trip cost is real

One round trip per statement put the 10,056-row backfill on course for **5+
hours** (measured: 216 players in ~7 minutes). Writes are now collected and
flushed in bounded batches, in the backfill, the cube and `upsertMetaEvent`.

When testing this, count round trips at the **libSQL client**, not at drizzle:
a batched `db.run()` is a lazy statement builder, so counting drizzle calls
measures nothing (it reported 54 either way until the instrument was fixed).

## Parse state (for context on what's parseable)

Of 12,669 rows with `list_text` after 2026-01-01: **10,178 ok, 50 partial, 2,441
failed**. Remaining failures, sampled at 600:
- ~48% BattleScribe header wrapping a GW-app body, fully flattened (no newlines),
  units as `Commander Shadowsun (100 pts)` with no `Nx` prefix that bs-parser
  requires. `parseGwApp` fallback measured only 1.3% — it anchors on a
  `Name (N points)` header these lack, and their section header is `CHARACTER`
  singular vs `ROLE_HEADERS`' `CHARACTERS`.
- ~47% homebrew free-form, no consistent grammar. Not worth parser work.
- 23,533 rows with `list_text` are unparsed because `parsePendingLists` has a
  hardcoded `2026-01-01` event-date floor.

## Operational gotchas

- Always `NODE_OPTIONS=--dns-result-order=ipv4first` for Node → Turso.
- Run CLIs as `npx --prefix apps/bcp-scraper/server tsx <path>`; the repo-root
  `scripts/` dir can't resolve workspace packages.
- `scripts/apply-migration.ts <name>` applies a migration idempotently
  (`--dry-run` supported). Replaces the per-migration one-offs.
- Turso drops connections intermittently (`SQLITE_IOERR ... diverged from S3`,
  `tcp_refused`, `UND_ERR_SOCKET`). Two events failed mid-refresh this way; both
  survived with pre-refresh rows. Retry is usually enough.
- `upsertMetaEvent` is delete-then-reinsert keyed on `(source, sourceId)`. It
  used to do a round trip per player and per pairing — the ~4-hour 129-event
  refresh — and is now batched; see "The 4-hour refresh" above.
- A Vitest file that fails to PARSE is reported as fewer tests passing, with no
  failure. Compare test COUNTS, not just green.

## Useful commands

```bash
set -a && . .env && set +a
export NODE_OPTIONS=--dns-result-order=ipv4first
P="npx --prefix apps/bcp-scraper/server tsx apps/bcp-scraper/server/scripts"

$P/sync-detachment-dims.ts --dry-run
$P/enumerate-detachment-combos.ts --dry-run
$P/backfill-detachments.ts --dry-run
$P/parse-lists.ts [--retry-failed]
npx tsx scripts/apply-migration.ts 0017_fact_pairing_key --dry-run
```

## The 4-hour refresh — fixed

`upsertMetaEvent` cost three round trips per player and one per pairing:
`resolveFaction()` ran 1–2 SELECTs each, every player and pairing was its own
INSERT, and Glicko added an UPDATE plus a history INSERT each. **Measured: 257
round trips for a 40-player event.**

`createFactionResolver()` preloads the lookup once (same precedence as
`resolveFaction`, so they cannot disagree) and the writes go in bounded batches.
**Same event: 41 round trips**, and what remains is per-FRAME cube rollup work,
not roster work. A 4× roster now stays within 10 requests of a small one.

## The unresolved 178 rows are NOT a missing-code problem — verified

The brain has **exactly 266 detachment nodes with dp, matching dim_detachment's
266**, so the dim is fully in sync and `sync-detachment-dims` has nothing to add.
Checked directly against `fact_node.jsonl`: "Equatorial Hordes", "Vengeful
Hosts", "Cavalcade of Chaos", "Grizzled Company", "Shadow Legion", "Flyblown
Host", "Creations of Bile", "Mercenary Oathband", "Vanguard Onslaught" are all
absent from the brain entirely. They need upstream CONTENT, not parser or dim
work.

The rest are source-data faults, not resolution failures: a `thousand-sons` row
naming "Wrath of the Rock" and a `world-eaters` row naming "Angelic Inheritors"
are both Space Marine detachments on the wrong faction, and a handful of rows
have raw list text where the detachment should be. Resolving those would mean
guessing, which this deliberately does not do.

**Re-running `parse-lists --retry-failed` buys nothing here.** It would put the
parser's `detachments` array in the blobs, but the backfill's registry-driven
resolution is strictly better than the parser's split — that is the whole point
of doing it against `dim_detachment`. 98.8% is the ceiling until the brain gains
content.

## Not done, and why

**Surfacing combos in new-meta** is a UI feature nobody asked for. The data is
ready when it is wanted: `SELECT combo_id, COUNT(*), AVG(result) FROM
fact_game_results GROUP BY 1` answers "which pairing wins" as an indexed read,
and `dim_detachment_combo` holds all 3,490 legal combos including the ones
nobody has played.
