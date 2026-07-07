# versus — W2 Phase C per-app design verdict

> Grounded in `wargame/w2/apps/versus.md` (2026-07-06 census), a direct
> re-read of `apps/versus/client/src/lib/rules/pipeline.ts` (761 lines),
> `apps/versus/client/src/components/SimulatorScreen.tsx` (handleRunClick
> §483-542, history/delete §1296-1302), `apps/versus/CLAUDE.md` (Feature 10,
> line 56), and Phase B decisions D2-03, D2-04, D2-07, D2-08. LLM-shaped
> work (W1's proposal to compile leader-ability text via LLM) is out of
> scope; its finding that `WeaponAbility` is a closed 24-variant typed union
> is carried in as context for the engine-design calls below.

## 1. Verdict

**Refactor, not redesign.** The architecture is right: a pure client-side
rules engine reading unit data the server never touches, a thin server that
only re-derives and asserts an invariant before persisting, one relational
V2 schema. Nothing here calls for moving tiers around. But the app carries
three concrete, already-diagnosed defects — two hand-maintained copies of
the same 40K ruleset drifting inside one file, a 5000-iteration Monte Carlo
run blocking the main thread with no worker or yield, and a dead v1 router
one call site from deletion — plus the platform's most stale
`packages/db/CLAUDE.md` entry (1 table claimed, 4 real). All are fixable in
place; none require new architecture.

## 2. App-local decision points wargamed

### (a) Monte Carlo vs. closed-form duplication

**Forces.** `pipeline.ts` carries two independent implementations of the
same rules: `resolveHits/Wounds/Saves` (closed-form expected value, lines
72-253) and `mcRollHits/mcRollWounds/mcRollSaves` plus `runMonteCarlo`
(per-die simulation, lines 275-641). Both handle the same ability set —
TORRENT, LETHAL_HITS, SUSTAINED_HITS, REROLL_HITS(_OF_1), HIT_MOD,
WOUND_MOD, ANTI, REROLL_WOUNDS/TWIN_LINKED, DEVASTATING_WOUNDS, MELTA,
PRECISION — as two separate branches per ability, hand-kept in sync. 251
tests cover both paths (`pipeline.test.ts` alone 1133 lines / ~79 cases),
which catches drift *if* a change touches both branches and the suite
runs — it doesn't stop a one-path fix from shipping.

| Option | What it is | Play-out |
|---|---|---|
| 1. Derive MC from closed-form primitives | Refactor `mcRollHits`/`mcRollWounds` to reuse the same rate/target derivations `resolveHits`/`resolveWounds` compute (`effectiveSkill`, `totalHitRate`, `sixRate`), rolling one die against the derived rate instead of re-deriving it per ability | Collapses two ability-branch trees into one. Real complication: closed-form works in expected values (fractional hits), MC needs a per-die stochastic draw — the shared unit must be the rate derivation, not the aggregate result. Feasible, but a real refactor on the hottest path in the app, not a find-replace. |
| 2. Property-test one against the other as a drift guard | Assert `runMonteCarlo`'s empirical mean converges to `simulateWeapon`'s expected value within tolerance, across an ability-combination matrix | Catches drift without touching either implementation. Weaker than option 1: detects divergence after the fact, and a tolerance loose enough to avoid MC-variance flakiness at 5000 iterations could let a small real bug through. |
| 3. Accept with paired-update convention | Comment cross-references at each ability branch pair, rely on review discipline to touch both | Zero engineering cost. Same failure mode D2-03 already documented for v1/v2 retirement (0/4 track record) — an unenforced convention isn't a fix. |

**Score** (weights: Effort ×2, Risk ×2, Fit ×1, Quality ×1 — maintenance
cost against a hot, well-tested path, not a feature call; Latency dropped)

| Option | Fit | Quality | Effort | Risk | Weighted |
|---|---|---|---|---|---|
| 1. Derive MC from closed-form | 5 | 5 | 2 | 3 | 3.7 |
| 2. Property-test drift guard | 4 | 4 | 4 | 4 | **4.0** |
| 3. Paired-update convention | 2 | 2 | 5 | 2 | 2.5 |

**Recommendation: Option 2, primary; Option 1 fallback** once the guard
catches a real divergence or `WeaponAbility` grows past today's 24
variants. A convergence property test extends the existing 251-test/TDD
harness, is purely additive, and targets the census's exact concern
(drift) without betting a hot-path rewrite on the stochastic/expected-value
bridge working first try.

**Fallback:** if the property test is too flaky (MC variance swamping
small rate differences), tighten via fixed-seed/high-iteration test mode —
don't drop back to Option 3.

### (b) Main-thread MC jank

**Forces.** `runMonteCarlo` (`pipeline.ts:486-641`) runs directly inside
`handleRunClick` (`SimulatorScreen.tsx:483-542`), `iterations = 5000`
hardcoded at the call site (line 520). Per iteration: roll every weapon's
dice individually, then hits/wounds/saves per attack — O(iterations ×
weapons × models × attacks), fully synchronous, no `postMessage`, no
`requestIdleCallback`, no chunking. Usable at today's typical unit sizes;
the census flags it as a risk that grows with unit/weapon counts, not a
present bug.

| Option | What it is | Play-out |
|---|---|---|
| 1. Web Worker | Move `runMonteCarlo` to a worker module, `postMessage` config in/out | Fully unblocks the main thread regardless of scale. New build surface (Vite worker bundle, serialization boundary for `WeaponProfile`/`WeaponAbility` — likely fine, they're plain data) and a loading-state UX change. |
| 2. Chunked/yielded execution | Batch iterations (e.g. 500), yield to the event loop between batches, progress indicator | No new build surface. Total wall-clock roughly unchanged, perceived responsiveness improves. Requires `handleRunClick` async and a chunk-size/yield param on `runMonteCarlo` — smaller change than a worker. |
| 3. Accept at current sizes | No change | Correct per "don't polish what doesn't need polishing" if today's sizes genuinely don't jank — census reports the structural risk, not an observed hang. No tripwire exists to know when this stops being true. |

**Score** (weights: Effort ×2, Stack ×1, Fit ×1, Risk ×1)

| Option | Fit | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|
| 1. Web Worker | 5 | 2 | 3 | 4 | 3.4 |
| 2. Chunked/yielded execution | 4 | 4 | 5 | 4 | **4.2** |
| 3. Accept at current sizes | 3 | 5 | 5 | 2 | 3.6 |

**Recommendation: Option 2, primary; Option 1 fallback.** Chunking gets the
responsiveness win via a signature change instead of a new build/
serialization surface, and strictly improves on option 3 at no added risk.
The 12-positional-argument `runMonteCarlo` call is worth collapsing to a
config object while this signature is touched anyway (see §4).

**Flip trigger:** move to Option 1 if chunking overhead pushes total
wall-clock past acceptable, or a future feature needs the main thread free
*during* the roll (not just after).

### (c) Engine placement: client-only vs. server-side with cross-user caching

**Forces.** `versus/CLAUDE.md:56` (Feature 10) states the intent directly:
*"When saving the data, the results can be sent to the server. They are
not GW IP. We can then use the unit ids and applied special rules to cache
results and send them back... or show them more quickly."* Never built —
the deprecated `simulate.lookup({ configHash })` (still called once, at
`SimulatorScreen.tsx:574`, per D2-03) is the closest analog, and it's a
dead-end lookup against a JSON blob, not a cross-user cache.

| Option | What it is | Play-out |
|---|---|---|
| 1. Keep client-only (status quo) | Server never computes, only persists | Strongest privacy; zero marginal Worker CPU cost; works offline once IndexedDB is warm. Downside: every user redoes identical rolls for common matchups — real waste at scale, not yet a real load at hobby-tier traffic. |
| 2. Server-side, cache everything | Server computes or stores client-submitted `(unitIds, abilities, configHash) → result`, served on repeat | Matches Feature 10's intent; caching derived numbers (not GW stats) doesn't breach the no-GW-content boundary. Real costs: MC's result is stochastic — caching "the" MC draw either defeats re-rolling or requires MC to just always recompute, a distinction Feature 10 doesn't make; moving compute server-side also puts it on a budgeted Worker invocation (Rule 9) this app currently has zero exposure to. |
| 3. Hybrid — cache closed-form only, MC always local | Server caches/serves `simulateWeapon`'s deterministic result by config hash; MC distribution never cached | Resolves option 2's determinism problem: the cheap, deterministic thing is exactly what's safe to cache; the expensive stochastic thing is exactly what shouldn't be. Still carries reduced Rule 9/offline exposure, but closed-form compute is negligible CPU either way. |

**Score** (weights: Effort ×2, Risk ×2, Fit ×1, Quality ×1, Stack ×1)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Client-only (status quo) | 4 | 3 | 5 | 5 | 4 | 4.1 |
| 2. Server-side, cache everything | 3 | 3 | 2 | 3 | 2 | 2.5 |
| 3. Hybrid (closed-form cache only) | 4 | 4 | 3 | 4 | 4 | **3.9** |

**Recommendation: Option 1 today; Option 3 fallback, gated on a usage
signal.** No evidence of repeat-matchup load exists yet (single-user era) —
building a cache for a cost that hasn't materialized violates "no features
that aren't needed yet." Feature 10's intent stays documented, not deleted:
the hash-key groundwork (`currentConfigHash`/`simpleHash`,
`SimulatorScreen.tsx:547-560`) already exists from the dying v1 lookup
path and only needs re-pointing at `simulateV2` plus a cache table later.

**Flip trigger:** once multi-user traffic shows non-trivial repeat-configHash
duplication, build Option 3 (closed-form cache only, never the MC draw).
Only reconsider Option 2 if Worker CPU headroom and a real multi-user cost
model both exist.

### (d) Simulation history value

**Forces.** `simulateV2` exposes `save/history/get/delete`, consumed at
`SimulatorScreen.tsx:1296-1302`, backed by a full list/delete UI — a real,
wired feature, unlike the dead v1 router. It is also the app's largest
schema surface: 3 live tables (`simulation`, `simulation_weapon`,
`simulation_modifier`) versus 0 for the core matchup calculation itself.
No analytics/telemetry exist anywhere in this codebase for how often the
one current user (Micah) actually revisits saved sims — grepped, no hits.
This is a data gap, not a verdict: this doc can confirm the surface is
wired but not that it earns its keep.

| Option | Play-out |
|---|---|
| 1. Keep as-is | Safe default absent contrary evidence — deleting a used feature is worse than carrying an underused one at this cost (no Rule 9 exposure, no bugs flagged). |
| 2. Instrument, then decide | Cheapest close of the actual gap — a one-line question to Micah, or a lightweight `last_viewed_at` signal, before any structural call. |
| 3. Cut scope now | Unjustified by any evidence in hand; cutting a working, low-cost feature on a hunch is the shortcut root Rule 0 says to ask about, not take. |

**Recommendation: Option 2 — ask, don't guess.** Per root CLAUDE.md Rule 0,
the honest verdict is that usage data doesn't exist in-repo to check; flag
as an open question for Micah rather than score a guess. No fallback
needed — "don't touch it" is already Option 1's default.

## 3. Cross-cutting obligations (Phase B decisions)

- **D2-03 (legacy retirement).** versus is near-safe: `SimulatorScreen.tsx:574`
  (`trpc.simulate.lookup`) is the **only** production call into the
  deprecated `simulate` router — `save`/`history`/`delete` there have zero
  callers, all live traffic already runs through `simulateV2`. Checklist:
  (a) delete the `simulate.lookup` call site (`:574-577`) and any plumbing
  feeding *only* that call — but keep `currentConfigHash`/`simpleHash` if
  §2(c)'s hybrid-cache fallback is ever pulled forward; (b) unmount
  `simulate`; (c) migration dropping `simulations` (`schema.ts:188`); (d)
  update `packages/db/CLAUDE.md`'s versus table count same-PR. Same-day
  change, no user data migration needed.
- **D2-04 (Rule 6).** `leaderAbilities.ts`'s `ABILITY_PATTERNS` is ruled
  **class D** (a parsing heuristic into the closed `WeaponAbility` union,
  not a copy of GW content) and stays in code. Open item: add the
  change-trigger half of the two-line class-D comment (basis already
  present) — revisit as a structured rule registry once `ABILITY_PATTERNS`
  passes ~30 entries (today: 9). No storage change.
- **D2-07 (Rule 3).** Dice-notation average math (`attackCount.ts:26-47`
  server vs `pipeline.ts:9-17` client) goes to a **new `packages/util`** —
  the one D2-07 item needing a new package, since neither `server-core` nor
  `ui` nor `db` fits and both runtimes need the same function across a
  client-bundle/Worker-bundle boundary. Reconcile `resolveAttacksExpected`
  (no `-` modifier, throws on bad input) and `resolveAttacks` (supports
  `-`, silent 0) into one API; add `resolveMin`/`resolveMax` (client-only
  today) alongside it. D2-07 mandates TDD order (union-behavior test first,
  confirm it fails against each original alone) and schedules this **last**
  of its six items, since it's the only one touching versus's hot path —
  sequence this app's §2(a)/§2(b) work before or alongside it, not blind to
  it, since all three touch the same dice-roll call sites.
- **D2-08 (doc drift).** Two corrections land here: (1) test count —
  census claims 137 (8 server + 129 client); actual re-verified is 251 (50
  server / 4 files + 201 client / 11 files, `pipeline.test.ts` alone 1133
  lines / ~79 cases); (2) table ownership — `packages/db/CLAUDE.md` lists
  versus at 1 table; actual is 4 (3 current + 1 deprecated, → 3 once D2-03
  lands). Both already on D2-08's immediate-sweep list.

## 4. Ordered work plan

1. **Delete the `simulate` v1 call site and router** (D2-03) — remove the
   `SimulatorScreen.tsx:574-577` lookup, unmount `simulate`, migrate away
   `simulations` (`schema.ts:188`). Smallest, safest, do first.
2. **Add the class-D doc note to `leaderAbilities.ts`** (D2-04). Comment
   only, no risk — bundle with step 1 or do standalone.
3. **Correct versus's CLAUDE.md/`packages/db/CLAUDE.md` drift** (D2-08):
   test count and table count, the latter reflecting post-retirement state
   once step 1 lands — same PR as step 1.
4. **Add the MC-vs-closed-form property test** (§2a). Additive, uses the
   existing harness; this is the drift guard that makes steps 5-6 safe.
5. **Chunk/yield the Monte Carlo loop** (§2b) — `handleRunClick` async,
   `runMonteCarlo` takes a chunk-size/yield param; collapse its 12
   positional args to a config object while the signature is open. After
   step 4, so the property test is a safety net for this refactor.
6. **Consolidate dice-notation math into `packages/util`** (D2-07 item 3) —
   TDD union-behavior test first, then implement and cut over both call
   sites. Last, per D2-07's own ordering: steps 4-5 touch the exact
   functions this migration moves.
7. **Ask Micah about simulation-history usage** (§2d) before any further
   action on that surface.
8. **Defer, flag-gated:** hybrid closed-form result caching (§2c) — don't
   build until multi-user traffic shows real repeat-matchup duplication;
   preserve `currentConfigHash`/`simpleHash` in step 1 rather than deleting
   it, since it's the reusable half of this fallback.
