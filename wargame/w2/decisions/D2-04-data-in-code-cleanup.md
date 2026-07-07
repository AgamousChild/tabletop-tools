# D2-04 — Data-in-code cleanup (Rule 6 cluster)

> **Decision.** For every hardcoded lookup/content/heuristic table the Phase A
> census found, decide: move to a datastore, consolidate into one shared
> module, or keep in code as a documented heuristic — and fix the boundary
> rule so the next agent doesn't have to re-litigate it case by case.
>
> **Scope:** non-LLM (W2). Evidence: `apps/admin.md`, `apps/tournament.md`,
> `apps/list-builder.md`, `apps/bcp-scraper.md`, `apps/data-import.md`,
> `apps/brain.md`, `apps/versus.md` (2026-07-06 census), spot-verified against
> code the same day (line numbers below are from that read).

## Forces

Root `CLAUDE.md` Rule 6 is a one-line absolute: "No hardcoded lookup tables in
`.ts` files… Code reads from data, doesn't contain data." Taken literally,
every `const X = [...]` in the repo violates it — including the no-cheat
z-score threshold, which nobody actually wants in a database. The rule as
written doesn't distinguish **entity data** (things with names, ids, and a
lifecycle — factions, missions, tasks) from **tunables** (a threshold someone
picked and can defend in a code comment). Seven violations of varying
seriousness got flagged in one census pass; without a rubric, each gets
re-argued from scratch and the answer drifts by app.

Two of the seven ship an explicit self-defense in-code ("presentation-only ID
mapping," "source of truth — NOT parsed") — these are existing engineering
judgment calls, not oversights. The rubric has to be able to rule on a
defended exception, not just an unexamined one.

## Grounding (what's actually in the repo)

| # | Location | What | Size |
|---|---|---|---|
| 1 | `apps/admin/client/src/pages/TasksPage.tsx:1-191` | `TASKS` array — 28 project-tracker items (id/subject/category/priority/status) | 28 rows |
| 2 | `apps/tournament/server/src/routers/round.ts:10-17` | `MISSIONS` array — 6 mission names, `randomMission()` picks one | 6 rows |
| 3 | `apps/tournament/server/src/routers/player.ts:230-255` | `seedTestPlayers` — 16 hardcoded fake players (name/faction/detachment) | 16 rows |
| 4 | `apps/list-builder/client/src/lib/armyRules.ts:8-13` | `BATTLE_SIZES` — 4-row table (name/points/maxDuplicates/description) | 1st copy |
| 5 | `apps/list-builder/client/src/lib/useListsV2.ts:271-276` | `BATTLE_SIZE_POINTS` — points→enum-label map | 2nd copy |
| 6 | `apps/list-builder/client/src/components/ListBuilderScreen.tsx:56-63` | `byName` — 3rd restatement, already inconsistent with #4 on Strike Force maxDuplicates | 3rd copy |
| 7 | `apps/list-builder/client/src/components/UnitSelectionScreen.tsx:369-376` | `ROLE_FILTERS` — 6-value role taxonomy for the UI filter | 6 rows |
| 8 | `apps/bcp-scraper/server/src/lib/gw-parser.ts:5-59` | `FACTION_NAMES` (28) + `SUBFACTION_NAMES` (22) — parse-time name lists; `factionToSlug` (:95-100) tries `normalizeFaction` (DB-backed) first, falls back to these | 50 rows, DB-fallback |
| 9 | `apps/data-import/server/src/lib/sync.ts:83-99` | `CATALOG_FACTION_ALIASES` — 12-row BSData-catalog→slug map, comment cites "Rule 1... presentation-only ID mapping" | 12 rows |
| 10 | `apps/data-import/server/src/lib/sync.ts:789-820`+ | `MFM_FACTION_SLUGS` (29) + `SM_CHAPTERS_WITHOUT_MFM` + `BSDATA_TO_MFM_NAME_ALIASES` | 29+ rows |
| 11 | `apps/data-import/server/src/lib/bsdata.ts:48-60` | `SM_CHAPTER_TO_SUBFACTION` | small |
| 12 | `apps/data-import/server/src/lib/faction-pack.ts:98-129` | `factionSlugToBsdataName` — same underlying fact, 4th variant | 4th copy |
| 13 | `apps/brain/server/src/data/primary-missions.ts` | `PRIMARY_MISSIONS` — hand-transcribed CA2025 mission cards, comment: "Source of truth — NOT parsed" | 490 lines |
| 14 | `apps/brain/server/src/data/challenger-cards.ts` | `CHALLENGER_CARDS` — hand-transcribed CA2025 challenger cards | 219 lines |
| 15 | `apps/brain/server/src/data/11th-edition-detachments.ts` | Deprecated hand-scraped detachments; self-marked "DO NOT add," 1 node still built each run | 82 lines |
| 16 | `apps/versus/client/src/lib/leaderAbilities.ts:18-64` | `ABILITY_PATTERNS` — 9 regexes mapping leader-ability English text → `WeaponAbility` enum | 9 patterns |
| 17 | `apps/no-cheat/server/src/lib/stats/analyze.ts:4-10` | `LOW_THRESHOLD`/`HIGH_THRESHOLD`/`Z_THRESHOLD` — statistical constants for loaded-dice detection | 3 constants |

Confirmed schema fact: `scoringMission` already exists as a table
(`packages/db/src/schema.ts:1389`) with a `mission_generated_score` FK
(`:1417-1419`) — the tournament MISSIONS array (#2) has a ready home today,
not a hypothetical one.

## The rubric: entity data vs. heuristic vs. tunable

Rule 6's literal text ("no hardcoded lookup tables") is too blunt to apply
directly — it would also indict the Z-score threshold, which is correctly in
code. The distinguishing question is **what kind of fact is this, and who
changes it**:

| Class | Test | Verdict | Standard |
|---|---|---|---|
| **A. Entity/lookup data with a datastore home** | Does a table for this concept already exist, or would a new GW-content-adjacent entity need one? Is the list edited by adding/removing rows over time, by someone other than a developer? | **Move to DB** | Rule 6 applies at full force. No exception. |
| **B. Alias/mapping table consumed at build/parse time** | Is this reconciling two *external* naming schemes (BSData catalog name ↔ canonical slug), never shown to a user, never edited outside a source-sync PR? | **Single shared module**, not necessarily a DB table | The map is still "data," but its lifecycle is coupled to the ingestion code that consumes it — moving it to a DB table adds a runtime dependency (query at parse time) for zero benefit if it only ever changes alongside the parser. The Rule 6 fix here is **DRY** (one file, one lookup), not necessarily "in the database." |
| **C. Hand-transcribed licensed content** | Is this GW rules text with no canonical parse source yet, entered once and stable until the next Chapter Approved revision? | **Case-by-case**: datastore now if a schema exists; pipeline if a parse source will exist soon; accept-in-code with a hard expiry note otherwise | Never indefinite — every entry needs a documented trigger for when it must be replaced (a new CA drops, a parser ships). |
| **D. Genuine tunable/heuristic** | Is this a threshold, weight, or pattern a domain expert would defend with "because we tested it," not "because GW published it"? Does changing it require re-validation (a threshold) rather than a data-entry edit (a new faction)? | **Stays in code** | Requires: (1) a comment stating the empirical/statistical basis, (2) a comment stating what triggers a change, (3) a test asserting the boundary behavior. |

The operational shortcut: **ask "does this fact have GW's name on it, and does
it change when GW publishes something, not when a developer decides to
retune it?"** If yes → class A/B/C, Rule 6 in play. If no (it's an
engineering judgment call about *how* to detect/parse/score) → class D,
Rule 6 does not apply, but the documentation standard does.

## Per-item verdicts

| # | Item | Class | Verdict | Where it goes |
|---|---|---|---|---|
| 1 | admin `TasksPage` 28-item list | A | **Move.** This is Micah's own project tracker, edited constantly, already independent of GW content — the single clearest Rule 6 violation in the set. | New `tasks` table + admin router (`stats`-adjacent), replacing the hardcoded array. Low effort, immediate win. |
| 2 | tournament `MISSIONS` (6 names) | A | **Move.** Schema-ready today (`scoringMission` exists, unused for this). | Backfill `scoringMission` rows, point `randomMission()` at a query. Ties into D2-01 (tournament data-model unification) — do in the same pass as that migration, not before, to avoid touching `round.ts` twice. |
| 3 | tournament `seedTestPlayers` fake data | A (but also Rule 7) | **Delete from prod path, keep as test fixture.** This isn't a lookup table problem — it's Rule 7 (no test data in production) wearing a Rule 6 costume. The 16 names should live in a test-only module (`__fixtures__` or similar), and the mutation itself needs a dev/staging gate (`ctx.env.ENVIRONMENT !== 'production'`) before it's callable at all. | `apps/tournament/server/src/__fixtures__/test-players.ts` (or equivalent), gated router call. |
| 4–7 | list-builder battle-size table ×3 + `ROLE_FILTERS` | A (battle sizes) / borderline A-D (roles) | **Move battle sizes; consolidate roles.** Battle size (points/maxDuplicates/description) is entity data with an internal inconsistency bug *today* (copy #6 disagrees with #4 on Strike Force maxDuplicates) — that's Rule 6 cost made concrete, not hypothetical. `ROLE_FILTERS` is a UI-only derived taxonomy (Battleline/Characters/Other/etc. are GW's official categories, so technically class A, but the list is short, stable across editions in practice, and only consumed by one filter control) — move it too, but it's lower priority than the 3x-duplicated, actively-buggy battle-size table. | New `battle_size` table (or `content_entity`-adjacent lookup) in `packages/db`, one shared read in `game-data-store` used by all 3 call sites. `ROLE_FILTERS` → same table family or a `content_entity` category enum if one exists; otherwise defer to D2-07 (shared-utility consolidation) if it turns out UI-only. |
| 8 | bcp-scraper `FACTION_NAMES`/`SUBFACTION_NAMES` | B | **Keep as a single shared module, but source it from the DB at build/deploy time, not hand-maintain twice.** This already has the right shape (`factionToSlug` tries the DB-backed `normalizeFaction` first, these are the fallback) — the fix isn't "move to DB," it's "stop hand-maintaining a second copy of `dim_faction`/`dim_subfaction` as a literal." Generate this array from a DB export at parse-module load or codegen it into a `.generated.ts` in a pre-commit/CI step so a new faction is a DB insert, not a code change (matches the census's own recommendation, `bcp-scraper.md` item 6). | `apps/bcp-scraper/server/src/lib/gw-parser.generated.ts`, regenerated from `dim_faction`/`dim_subfaction` by a script under `scripts/`. |
| 9 | data-import `CATALOG_FACTION_ALIASES` | B | **Keep in code, but as ONE shared module**, not reconciled against #10/#11/#12 by hand. The inline comment's claim ("presentation-only ID mapping... Rule 1 upheld because the data still lives in MFM upstream") is *correct on Rule 1* (no parallel entity registry — this doesn't assert faction facts, it translates a spelling) but doesn't address Rule 6/3: four independent hand-maintained variants of the same fact is the DRY violation the census flagged (data-import item 2). | Consolidate #9/#10/#11/#12 into one `packages/game-content` (or `packages/db`) module — `catalogAliases.ts` — imported by `sync.ts`, `bsdata.ts`, `faction-pack.ts`. Not a DB table: this only ever changes alongside a source-format change, and a build-time constant avoids a network round-trip in a Node CLI that already runs offline-tolerant. |
| 10–12 | MFM/BSData/faction-pack alias tables | B | **Same disposition as #9** — one file, three fewer copies. | Same module as above. |
| 13 | brain `primary-missions.ts` (490 lines) | C | **Accept in code, with an expiry trigger — do not move to DB today.** No parser exists for CA2025 PDF mission cards; a DB table doesn't remove the hand-transcription step, it just relocates it and adds a migration+seed step for content that changes once a year. The real fix is upstream (a PDF/markdown parser), which is its own project (tracked already — census item "hand-transcribed content-as-code... vs parsed/OCR pipeline," `brain.md` candidate #3). Until that pipeline exists, class-C content stays in code, comment-documented as it already is. | No change now. Flip trigger below. |
| 14 | brain `challenger-cards.ts` (219 lines) | C | **Same as #13.** | No change now. |
| 15 | brain `11th-edition-detachments.ts` (82 lines, deprecated) | C (resolved) | **Finish the deprecation — delete the file.** This one is not a live judgment call; the file's own comment says "DO NOT add" and every entry except the Army Construction rules node has already been superseded and removed. This is a dead-code-in-waiting item, not a data-boundary debate: extract the one retained node (Army Construction rules — not a detachment, no faction-pack home) into a small standalone constant or a proper `core` rules table, then delete the file. | Move the one surviving node to `apps/brain/server/src/data/core-rules.ts` (or a DB row if a `core` rules table exists), delete `11th-edition-detachments.ts`. |
| 16 | versus `leaderAbilities.ts` regex patterns | D | **Stays in code.** This is a parser for free-text rules English into a closed, typed 24-variant `WeaponAbility` union (per W1's own versus finding) — it's an NLP heuristic over content, not a copy of the content itself. The abilities' *existence* lives in the faction data pipeline; this module only recognizes phrasing. Moving regex patterns into a DB table gains nothing (they're still code — `RegExp` isn't SQL) and loses type-checking against the `WeaponAbility` union. | No change to storage. Documentation gap to close: add the class-D comment block (basis + change-trigger) per the standard below — currently has decent doc but no explicit "what triggers a pattern update" note. |
| 17 | no-cheat statistical constants (`LOW_THRESHOLD`/`HIGH_THRESHOLD`/`Z_THRESHOLD`) | D | **Stays in code — correctly placed already.** These are hypothesis-test parameters, not facts about the world; `Z_THRESHOLD` even carries a p-value justification in-comment today (`analyze.ts:9`, "~p < 0.012 one-tailed"). This is the rubric's reference example for class D: a number a statistician tuned and would defend with a test, not a lookup a data-entry person maintains. | No change. Already meets the documentation standard (basis is commented); add a note on what evidence would justify retuning it (e.g., "revisit if false-positive rate observed >X% in production logs") to fully close the loop. |

## Options (rubric variants considered)

**Option 1 — Literal Rule 6 ("everything is data, move everything")**
Every item above, including #16/#17, goes to a table or config row.
*Play-out:* no-cheat's Z-threshold becomes a DB row nobody queries at runtime
(no-cheat CV runs client-side/offline — a DB round-trip for a constant is a
regression, not a fix); `leaderAbilities.ts` patterns become `RegExp`-as-text
in SQLite with no type safety, and the union exhaustiveness check W1 already
relies on breaks. Rejected — the rule's own purpose (avoid hand-edited facts
drifting from reality) doesn't apply to numbers nobody but a developer edits.

**Option 2 — No rubric, case-by-case as flagged**
Keep resolving each item ad hoc, as the census already did informally
(borderline/acknowledged/violated labels). *Play-out:* this is what produced
the inconsistency in the first place — data-import's inline comment defends
its alias tables while tournament's near-identical MISSIONS array is flagged
without defense; nothing distinguishes them systematically. Rejected —
doesn't scale past this one census pass, and the next agent re-litigates it.

**Option 3 — Four-class rubric (recommended, detailed above)**
Distinguish by *what changes it and when*, not by surface area or line count.
*Play-out:* correctly separates admin's `TasksPage` (A, obvious) from
no-cheat's Z-threshold (D, obvious) and gives the borderline cases (bcp-parser
fallback, data-import aliases, brain's hand-transcribed content) a defensible
middle category instead of forcing a binary call.

## Scores

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Literal Rule 6 (move everything) | 2 | 2 | 1 | 2 | 2 | **1.8** |
| 2. Case-by-case, no rubric | 3 | 2 | 5 | 4 | 2 | **3.1** |
| 3. Four-class rubric | 5 | 5 | 4 | 5 | 5 | **4.8** |

(Weights: Quality and Risk weighted highest here — this is a governance
decision, not a runtime one; Latency axis dropped, not applicable.)

## Recommendation

**Primary: Option 3, the four-class rubric**, applied per the per-item table
above. Concretely, in priority order:

1. **Now (low effort, clear win):** admin `TasksPage` → `tasks` table (#1);
   delete `11th-edition-detachments.ts` after extracting its one live node
   (#15); gate/relocate `seedTestPlayers` (#3, Rule 7 fix riding along).
2. **Next (ties to D2-01/D2-07):** tournament `MISSIONS` → `scoringMission`
   backfill, done alongside the tournament data-model unification so
   `round.ts` isn't touched twice (#2); list-builder battle-size
   consolidation, since it has a live bug today (#4-6); bcp-scraper
   generated-fallback file (#8); data-import alias-table consolidation into
   one module (#9-12).
3. **Accept, revisit on trigger:** brain's hand-transcribed mission/challenger
   content (#13, #14) — no action until a parser exists.
4. **No action, documentation-only:** versus leader-ability regexes (#16),
   no-cheat statistical constants (#17) — add/confirm the class-D comment
   standard (basis + change-trigger), nothing moves.

**Fallback:** if Option 3's class boundaries prove contentious in review
(e.g., Micah judges `ROLE_FILTERS` should be class D, not A), fall back to
Option 2 for that single item only — resolve it by explicit one-off ruling —
rather than discarding the rubric for the whole cluster. The rubric's value
is in the 90% of cases it resolves cleanly; a handful of genuinely disputed
edge items don't invalidate it.

## Flip triggers

- **#13/#14 (brain hand-transcribed content) flip from "accept" to "move/
  pipeline"** the moment either: (a) a PDF/markdown parser for Chapter
  Approved mission cards ships (matches brain's own candidate-decision #3),
  or (b) the next Chapter Approved revision requires a second hand-edit of
  the same ~700 lines — two manual edits is the signal that this has become
  a maintenance pattern, not a one-time transcription.
- **#8 (bcp-scraper name lists) flips from "generated fallback" to "delete
  the fallback entirely"** once `normalizeFaction`'s DB path has 100%
  coverage in production for one full scrape cycle with zero fallback hits
  (verify via a log counter on the fallback branch before deleting it).
- **#16/#17 (class D items) flip to reconsideration** only if either grows
  past a size where code-review can validate it by reading (e.g.,
  `ABILITY_PATTERNS` growing past ~30 entries as new ability text patterns
  are discovered) — at that point a structured rule-registry (already named
  in `versus.md` candidate #4) becomes the better home even though it's still
  class D reasoning, just outgrowing "a few regexes in one file."

## Implementation notes

- Class A moves belong in `packages/db/src/schema.ts` (new tables) +
  Drizzle migration; consuming apps read via existing per-app router
  patterns — no new package needed.
- Class B consolidations belong in `packages/game-content` (parse-time,
  build-adjacent) rather than `packages/db` (runtime) — these are consumed
  by Node CLIs and Workers at parse/sync time, not by end-user queries; a DB
  round-trip is unnecessary latency for a fact that only changes with a
  source-format change.
- The bcp-scraper generated-fallback file (#8) is the one item that could go
  either way (generate-at-build vs. query-DB-at-runtime-with-cache) — default
  to generate-at-build (simpler, no new runtime dependency for a Worker that
  already treats this as a fallback path only).
- No item in this cluster is a Rule 9 (chunking) concern — all are small,
  synchronous reads; D2-04 doesn't intersect D2-05.
- Every class-D item that survives this pass should carry the same two-line
  comment shape going forward: *(1) empirical/statistical basis, (2) what
  observed evidence would trigger a retune.* `analyze.ts` already has (1);
  add (2) there and to `leaderAbilities.ts` as part of this cleanup, even
  though no code moves.
