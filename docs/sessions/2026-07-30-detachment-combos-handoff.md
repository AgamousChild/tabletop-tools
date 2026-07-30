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

Already on `main` from earlier in the session: `a0cee41` (listId capture +
`/v1/armylists` endpoint fix), `23660f4` (parse CLI wrapper), `864a222`
(multi-line BattleScribe + preamble-tolerant detection), `9fe3660` (weekly
scrape workflow), `7dfa982` (oxlint fix, PR #151), PR #152.

## Test counts as of this handoff

`packages/db` 116 · `packages/server-core` 91 · `apps/tournament/server` 107 ·
`apps/bcp-scraper/server` 99 · `apps/new-meta/server` 49 ·
`apps/content-ingestor` 275. oxlint clean, `drizzle-kit check` clean.

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

### 2. Backfill writes the bridge + combo_id (NEXT)

Extend `meta-detachment-backfill.ts`:

1. Read `list.detachments[]` and `list.detachmentName` out of `list_ttt`
   (currently `extractDetachment()` returns only a single string — it needs a
   sibling that returns the array plus the full raw name).
2. **Resolve the FULL `detachmentName` against dim_detachment first.** Only if
   that fails, resolve each split part. This is what protects
   `Penitents and Pilgrims` — see the trap in step 1.
3. Insert `meta_event_player_detachment` rows: `position` from array order,
   `detachment_points` copied from `dim_detachment.dp` at write time.
4. `comboId(factionId, resolvedIds)` — already exported from
   `meta-detachment-combos.ts`, already sorts members.
5. The combo row usually EXISTS already (863 enumerated, `is_legal = 1`). Only
   call `upsertCombos(..., isLegal=false)` when the resolved set isn't among
   them. `upsertCombos` takes `MAX(is_legal)` so this can't downgrade a legal row.
6. Set `meta_event_players.combo_id`; keep `detachment_id` = position 1.

Existing single-detachment writes to undo/overwrite: the first backfill run wrote
`detachment_id` on **1,271 rows** under the old one-detachment model. Those are
reversible (`SET detachment_id = NULL`) and will be superseded by this pass.
Reuse the keyset cursor (`afterId`/`lastId`) — it's already in place.

### 3. Ingest writes them on the way in

`packages/server-core/src/meta-ingest.ts` — `MetaIngestPlayer` should accept a
detachment array so new scrapes populate the bridge and `combo_id` directly
rather than needing a backfill pass.

### 4. Cube carries combo_id

`packages/server-core/src/meta-cube.ts:264` selects `p1.detachment_id` /
`p2.detachment_id` into `fact_game_results`. Add `combo_id` (and consider
`opponent_combo_id`). Then rebuild for affected events —
`buildCubeForEvents(db, eventIds)`.

### 5. MCP tools

`mcp/ops-server/src/lib/bcp-ops.ts` + `index.ts` already expose
`bcp_parse_lists` and `bcp_backfill_detachments` with the 4-step pipeline
documented. Add `bcp_sync_detachment_dims` and `bcp_enumerate_combos`, and fold
them into `bcpPipelineFull` in dependency order.

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
- `upsertMetaEvent` is delete-then-reinsert keyed on `(source, sourceId)`, and it
  does one round-trip per player and per pairing — a 129-event refresh took ~4
  hours. Batching those inserts is the obvious optimisation for the weekly cron.
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
npx tsx scripts/apply-migration.ts 0015_detachment_combos --dry-run
```
