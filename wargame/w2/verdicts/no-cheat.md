# no-cheat — Phase C design verdict

> Scope: statistics model, session/data design, storage. The CV/ML vision
> model (background subtraction, blob detection, k-NN/ONNX-YOLOv8n pipeline)
> is W1/D06's territory and out of scope here. Grounded against
> `apps/no-cheat/server/src/lib/stats/analyze.ts`, `.../routers/session.ts`,
> `.../routers/training.ts`, `.../lib/storage/r2.ts`,
> `apps/no-cheat/client/src/lib/store/trainingStore.ts`,
> `packages/db/src/schema.ts:85-180`, and `apps/no-cheat/CLAUDE.md`, read
> directly 2026-07-06. Builds on the Phase A census (`w2/apps/no-cheat.md`)
> and Phase B decisions D2-04, D2-06, D2-08.

## 1. Verdict

**Refactor.** Architecture (two-tier, client-only CV, tRPC statistics
server) is sound and stays. But the statistical core is **measuring the
wrong thing on every call** — `addRoll` re-tests accumulating data with no
correction for repeated testing, a peeking problem that inflates
false-positive "loaded dice" accusations against real opponents. That has
to be fixed before this app's math backs the claim it makes. Storage/
session fixes below are small and ride along; they don't change the
headline.

## 2. App-local decision points wargamed

### 2a. The statistics model — peeking, and what replaces it

**This is the app's soul.** no-cheat tells a player "your opponent's dice
are loaded," in front of that opponent, mid-game. Wrong math makes it a
trust-destroying accusation machine, not a tool.

**The problem, precisely.** `analyze()` (`analyze.ts:26-79`) runs a
per-face z-test plus a chi-squared goodness-of-fit test against the
*entire accumulated pip pool* for a session. `session.addRoll`
(`session.ts:82-88`) calls this after every roll once `n >= 30` pips, at a
fixed significance threshold (`Z_THRESHOLD = 2.5`, `CHI_SQ_CRITICAL =
11.07`, nominal p≈0.05 or tighter per test). Repeating the same test
against a growing sample and flagging the first crossing is classic
peeking / repeated-significance-testing error: effective false-positive
rate across a session climbs well past the nominal single-test rate,
because a 40+ roll session has dozens of correlated look opportunities,
not one. D2-04 correctly ruled the *values* (2.5, 11.07) class-D —
statistically defensible tunables that stay in code — but that ruling says
nothing about the *testing procedure* wrapped around them, and it's wrong.

**Options:**

**(i) Frequentist + sequential-testing correction (alpha-spending/SPRT).**
Keep z/chi-squared, add an alpha-spending boundary (O'Brien-Fleming/Pocock)
or reframe as a sequential probability ratio test against a fixed effect
size. *Play-out:* smallest surface change, no schema change, `isLoaded`
stays boolean. Cost: alpha-spending boundaries are nontrivial to implement
correctly, and choosing an effect size ("how loaded is loaded") is a
judgment call today's code never had to make explicit — real risk of a
second subtle bug one level up. Score: Fit 4, Quality 4, Effort 2, Stack
5, Risk 3.

**(ii) Bayesian posterior — "probability loaded," updated per roll.**
Dirichlet-multinomial posterior over face probabilities, symmetric
fair-die prior, updated incrementally each roll. Report `P(loaded|data)`
directly — legitimately updates every roll with no peeking penalty,
because there's no repeated "test," just a sharpening posterior.
*Play-out:* arguably the right UX independent of the math problem — "73%
probability loaded, climbing" is more honest than a boolean flipping at an
arbitrary threshold — and sidesteps peeking by construction. Cost: a real
rewrite of `analyze()`, a schema change (`zScore`/`isLoaded` → a
`posteriorProbability` float plus a decision on what still maps to a UI
flag), and an explicit prior choice (uniform is defensible; a
manufacturing-tolerance-informed prior would be better but doesn't exist).
Score: Fit 5, Quality 5, Effort 2, Stack 4, Risk 3.

**(iii) Test-only-at-session-close.** Strip the mid-session call out of
`addRoll` entirely; keep the existing full test only in `close`
(`session.ts:154-167`, already there). One test, one look, nominal p-value
holds. *Play-out:* statistically cleanest, cheapest to ship (delete four
lines), but throws away the live-trend value that's arguably the point of
an in-game tool — finding out at session close that you should have
stopped playing 20 rolls ago. Score: Fit 2, Quality 3, Effort 5, Stack 5,
Risk 4.

**Wargame.** (iii) fixes peeking by amputation, not correction, and
regresses the app's core interactivity. (i) is the conservative fix but
bakes in a correction method that's more intricate than the test it's
guarding — trading one subtle-bug risk for another, just moved up a level.
(ii) best matches what the product is actually trying to say
("increasingly confident this die is loaded" is inherently a posterior
statement) and supports live updates with no correction factor, at the
cost of the biggest rewrite.

**Recommendation: primary (ii), Bayesian posterior** — the only option
that makes "every roll updates the picture" correct by construction. It
also replaces the arbitrary `low`/`medium`/`high` confidence tiers gated on
raw pip count (`analyze.ts:31`) with a posterior credible interval, a more
honest version of the same idea. **Fallback: (i), alpha-spending
correction**, if a Bayesian rewrite is too large for this pass — strictly
better than shipping nothing, keeps the existing schema, can be built
incrementally. Do not ship (iii) alone; it trades core interactivity for
correctness (i) and (ii) both achieve without that trade.

**Flip trigger:** if the Bayesian prior choice proves contentious or
under-informed, fall back to (i) — an admittedly-arbitrary frequentist
threshold (today's status quo, already comment-justified) beats an
equally-arbitrary Bayesian prior dressed up as more rigorous.

### 2b. Pip storage — JSON array vs per-die rows

`rolls.pip_values` is a JSON `number[]` in a TEXT column (`session.ts:78`);
every read path `JSON.parse`s it in app code (`session.ts:85,127,157,205`)
— no SQL touches individual pip values.

**Options:** (a) keep JSON blob, (b) normalize to a `roll_pips` child table
(`roll_id`, `die_position`, `pip_value`).

**Play-out.** Per-die-position analysis ("is die #2 specifically the
loaded one") needs a stable physical-die identity across rolls, which
nothing in the current CV pipeline (background/isolate/blobDetector, per
census) provides — dice tumble; array index resets every photo. Normalizing
storage ahead of that capability buys nothing: `GROUP BY die_position`
would group by "index within this photo," not a stable die identity.

**Recommendation: keep JSON array (a).** Not a Rule 6 violation (roll
data, not a lookup table), and correctly scoped to what the CV layer can
promise today. **Fallback:** revisit as a real per-die feature once W1/D06
ships stable per-die identity tracking (fixed tray position, marking-based
re-ID, etc.) — the storage format should follow the capability, not
precede it, per D2-04's class-D reasoning.

### 2c. Incremental sufficient statistics vs O(n) re-scan per roll

**Current:** `addRoll`, `undoLastRoll`, `close` each re-fetch *all* rolls
and re-run `analyze()` from scratch (`session.ts:83-86,126-128,155-158`) —
O(n) per call, O(n²) per session. Census flagged this as a Rule 9
"plausible budget-approacher"; at realistic session sizes (tens–low
hundreds of rolls, ≤6 ints each) it's nowhere near a CPU-budget breach
today — the real cost is future-proofing and undo-correctness.

**Options:** (a) keep full re-scan, (b) incremental sufficient statistics
— running per-face counts (`n`, `counts[1..6]`), updated `+1`/`-1` on
add/undo instead of re-summing.

**Play-out.** Sufficient statistics here are just six integers plus `n` —
trivially incremental, and undo-correct as long as the decrement targets
the specific undone roll (already identified via `lastRoll.id`,
`session.ts:112-117`). Full re-scan is undo-correct by brute force; counts
are undo-correct by construction, since the test statistic depends only on
counts, not order. If 2a moves to Bayesian, the Dirichlet posterior is
*also* fully characterized by the same six counts — so this is the right
sufficient statistic regardless of which 2a option ships.

**Recommendation: primary — incremental counts** (six int columns, or one
JSON counts object per 2b's same reasoning) on `diceRollingSessions`,
updated transactionally with each roll insert/delete. Not urgent, but
small, low-risk, and removes an O(n²) pattern before it matters.
**Fallback:** defer to immediately after 2a ships rather than stacking two
non-trivial changes on the same functions in one pass.

**Flip trigger:** if a future feature needs order-dependent analysis
(e.g., a late-session streak signal distinct from aggregate skew),
sufficient statistics stop being sufficient and this has to be reopened.

### 2d. Training corpus ownership — shared-per-dice-set vs per-user

**Current, confirmed:** `training.list`/`listFrames` (`training.ts:66-100,
202-236`) return examples for a `diceSetId` **across all users** unless
`myOnly: true` is passed — and `listFrames` doesn't even offer that
opt-out; it hardcodes `eq(trainingFrames.userId, ctx.user.id)`
(`training.ts:211`) while `list` does not. That's an inconsistency inside
the same router: `list` is shared-by-default, `listFrames` is
private-by-default, for structurally identical data.

**Options:** (a) shared-per-dice-set (pools training data for a
common physical dice set), (b) strictly per-user.

**Play-out.** `dice_sets` rows are already `userId`-scoped
(`diceSets.userId`; ownership verified in `session.ts:22`), so there's no
existing cross-user "same physical dice set" concept for (a) to attach to
— two users' `diceSetId`s for coincidentally-the-same dice are unrelated
rows. So (a)'s premise doesn't hold: sharing `list` doesn't pool data for
"the same dice," it leaks one user's training examples to any caller who
can guess a `diceSetId` — which isn't even ownership-checked in
`list`/`listFrames` the way it is in `saveExamples`/`saveFrame`
(`training.ts:26-33` checks ownership on save; `list`, `:76-84`, doesn't).
This is an oversight riding on a permissive default, not a considered
design — the census's "design or accident?" resolves to **accident**.

**Recommendation: per-user (b), enforced consistently.** Add the same
`diceSets.userId` ownership check `saveExamples`/`saveFrame` already do to
`list`/`listFrames`/`getStats`/`exportDataset`; drop `myOnly` as an
opt-in — make it the only mode. **Fallback:** if genuine cross-user
pooling is wanted later (e.g., a "community dice sets" concept), build it
as an explicit new feature (a shared flag or corpus entity) — not a
default permission gap on today's per-user table.

### 2e. Two training stores — server tables vs client IndexedDB

**Confirmed, not duplicated — two different pipelines, two different
payloads.** Client `trainingStore.ts` (IndexedDB `no-cheat-training` DB)
stores `StoredExample { features, roiGray: Uint8Array, roiWidth,
roiHeight }` — raw cropped-die pixels plus features, keyed by `diceSetId`,
consumed by `TrainingScreen.tsx`/`ActiveSessionScreen.tsx` for the local
k-NN classifier (never touches the network). Server `trainingExamples`/
`trainingFrames` tables store `features` and R2-hosted PNGs plus YOLO
bounding boxes, purpose-built for `exportDataset` (`training.ts:238-280`)
to produce a YOLOv8-trainable dataset. Two different training regimes
(per-user local k-NN calibration vs. shared/exportable YOLO corpus) that
happen to share the word "training," not a duplicated store.

**Play-out.** The real risk is **undocumented separation**, not
duplication — `CLAUDE.md` describes only the stale "Exemplar Store"
IndexedDB architecture and says nothing about the server `training`
router. A future reader would not know the server-side path exists or why
two "training" concepts exist, and could plausibly "consolidate" them as a
false DRY win — breaking both (the k-NN loop needs local raw pixels;
the YOLO export needs R2-hosted images for an out-of-Workers training job).

**Recommendation: deliberate separation, confirmed correct — document,
don't merge.** No storage change. Add a `CLAUDE.md` section naming both
paths and why they're separate. This is D2-08's territory as much as a
design call — see below. **Fallback:** none needed; this is a
documentation gap, not a live two-option decision.

## 3. Cross-cutting obligations (D2-06, D2-08)

Not re-litigated here — Phase B already scored these — but they apply to
this app and belong in its work plan:

- **D2-06 Tier 1, ship now:** `session.delete` (`session.ts:256-274`)
  deletes the DB row but never calls `bucket.delete()` on the evidence
  photo — confirmed, no R2 cleanup. Same defect exists for
  `training.delete`/`training.deleteFrame` (`training.ts:129-151,
  282-303`) — neither deletes its R2-hosted image. The census's "orphaned
  R2 blobs" finding is broader than session evidence alone: three tables
  with an R2-backed URL column and a delete path, not one.
- **D2-06 Track 2 (shared helper):** `createNullR2Storage()`
  (`r2.ts:35-42`) discards silently with only `console.warn` — a missing
  `EVIDENCE_BUCKET` binding in production quietly destroys the evidence
  this app exists to capture, the worst possible failure mode for this
  specific app. Adopt D2-06's `NullStorage`-throws-by-default helper first
  in line once it lands in `packages/server-core`.
- **D2-08 (doc drift):** `CLAUDE.md:156-161`'s "Exemplar Store" section
  (`cluster.ts`, `templateMatch.ts`, `pipReader.ts`, `exemplarStore.ts`)
  describes files that don't exist; the real stack is background/isolate/
  blobDetector/features/knnClassifier/mlPipeline(ONNX+YOLOv8n)/
  trainedPipeline. Rewrite the architecture section to match (CV pipeline
  depth deferred to W1/D06), add the missing `training` router (8
  undocumented procedures) and its two undocumented tables
  (`training_examples`, `training_frames` — this app's slice of
  `packages/db/CLAUDE.md`'s broader table-count drift), and correct the
  stale "242 tests" claim (actual: 9 server + 30 client test files).

## 4. Ordered work plan

1. **Now — D2-06 Tier 1:** add R2 cleanup to `session.delete`,
   `training.delete`, `training.deleteFrame`. Independent, ship first.
2. **Now — 2d ownership fix:** add the missing `diceSets.userId` check to
   `training.list`/`listFrames`/`getStats`/`exportDataset`; remove the
   inconsistent `myOnly` opt-in. Small, closes a real cross-user data
   exposure, no schema change.
3. **Now — D2-08 doc sweep:** drop "Exemplar Store," document the real CV
   file list (pointer only — depth owned by W1/D06), add the `training`
   router + tables, correct the test count, add the 2e "two stores,
   deliberately separate" note.
4. **Next — 2a statistics rewrite (largest single change):** Bayesian
   posterior (primary) or alpha-spending-corrected frequentist (fallback).
   Schema- and UI-touching — its own reviewed unit, not folded into the
   smaller fixes above.
5. **Alongside/immediately after #4 — 2c incremental statistics:** land
   the six-count running aggregate in the same pass, since both consume
   the same sufficient statistic and touch the same three functions —
   avoids touching `addRoll`/`undoLastRoll`/`close` twice.
6. **Deferred, gated on W1/D06 — 2b per-die storage:** do not start until
   stable per-die identity tracking exists in the CV layer.
