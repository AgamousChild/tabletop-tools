# Playbook — versus: LLM-assisted special-rules compilation

> **Deliverable.** Close the gap between datasheet ability *text* and the
> simulator's typed modifier pipeline — with a batch LLM compile + human
> review + shared mapping data, never LLM-at-simulation-time.
>
> **Status:** drafted 2026-07-06 (loop iteration 9). Grounded this session:
> versus CLAUDE.md, `client/src/components/SpecialRulesEditor.tsx`,
> `client/src/lib/useSimulateV2.ts` (presence), and
> `packages/game-content/src/types.ts:19–43`.

## Current state (grounded — the target vocabulary already exists)

- Simulation is **pure client-side math** over a modifier pipeline
  (CLAUDE.md; `useSimulateV2`). Unit data from IndexedDB (BSData via
  data-import). Server only stores results.
- **Special rules are already a closed, typed vocabulary:**
  `WeaponAbility` = 24-variant discriminated union
  (`SUSTAINED_HITS{value}`, `LETHAL_HITS`, `DEVASTATING_WOUNDS`, `TORRENT`,
  `TWIN_LINKED`, `BLAST`, `REROLL_*`, `HIT/WOUND/STRENGTH/ATTACKS/
  TOUGHNESS_MOD{value}`, `ANTI{keyword,value}`, `MELTA{value}`,
  `IGNORES_COVER`, `HAZARDOUS`, `PRECISION`, `INDIRECT_FIRE`, `ASSAULT`,
  `PISTOL`, `ONE_SHOT`, `PSYCHIC`) — `types.ts:19–43`.
- Users hand-pick these in `SpecialRulesEditor` (+ leader rules). Features
  6–8 (CLAUDE.md) want abilities "addressed" and "applied correctly" from
  unit data where possible.
- **The gap:** nothing translates a unit's ability *text* (sitting in
  IndexedDB) into `WeaponAbility[]` — the user is the compiler.

## The decision (mini-wargame)

| Option | Verdict |
|---|---|
| **Curated table only** (humans map every ability) | Works but slow; hundreds of distinct ability texts across factions; the tedium is exactly what stalls it |
| **LLM at simulation time** | ❌ rejected — nondeterministic math, latency in the hot path, trust; the simulator must stay pure (root rule: keep deterministic things deterministic) |
| **LLM-assisted curation (batch compile → human review → data)** | ✅ **chosen** — the task is a *closed-vocabulary translation* (short ability string → 0..n of 24 variants), ideal for D08 schema-constrained decoding; humans approve; runtime reads data |

Why this task is unusually LLM-safe: the output space is finite and typed
(Zod discriminated union → JSON schema → constrained decode), inputs are 1–3
sentence strings, and every proposal carries `needs_review` — an unmappable
ability is **explicitly marked "not simulatable"**, which is honest, instead
of silently wrong.

## Implementation plan

### Phase A — Inventory (no LLM)

1. From the data-import JSON (R2/IndexedDB source), extract distinct
   **11th-edition** ability texts (Rule 5) with BSData ability IDs +
   occurrence counts. Expect a few hundred distinct strings *(verify —
   record the actual count)*.
2. Rank by usage (abilities on popular units first — coverage per review-hour).
3. **Proof:** the inventory table exists with counts; top-50 list eyeballed.

### Phase B — Batch compile (T1, Tier I, D08 ladder)

1. Zod schema: `{ abilityId, proposals: WeaponAbility[], confidence: 0–1,
   needsReview: boolean, note?: string }` — the `WeaponAbility` Zod union is
   written once in `game-content` next to the TS type (single source).
2. Prompt: ability text + the 24-variant vocabulary with one-line semantics
   each + 3–4 worked examples (e.g. "each 6 to hit scores an extra hit" →
   `SUSTAINED_HITS 1`) + explicit "if it does not map, return [] with
   needsReview:true and say why".
3. Run on `qwen3:8b-q4_K_M` (schema-constrained, D08 J3), Tier II `/think`
   re-pass for low-confidence items; D09 runner (resumable, logged).
4. **Proof:** validity 100 % by construction (constrained); spot-check 30
   proposals by hand; disagreement rate recorded.

### Phase C — Review + storage (Rule 6, Rule 1 — and the data boundary)

1. Proposals land in an `ability_rule_mappings` table/artifact:
   `{bsdataAbilityId, nameHash, effects: WeaponAbility[], status:
   proposed|approved|rejected|not_simulatable, reviewer, ts}`.
   **Data-boundary note: store IDs + typed effects only — never the GW
   ability text** in committed artifacts; the text lives where it already
   lives (runtime IndexedDB from community data).
2. Review flow: start with a CLI/table review (approve/reject/edit) — the
   admin app can grow a page later if the CLI hurts (stop-when-works).
3. Ship approved mappings through the **data-import pipeline** (one data
   source for every app, Rule 1) → IndexedDB alongside unit data.
4. **Proof:** mappings arrive client-side via the normal sync path; no
   ability text in any committed file (grep).

### Phase D — Runtime wiring (small, deterministic)

1. On unit load, look up its abilities in the mapping → pre-populate
   `SpecialRulesEditor` with approved `WeaponAbility[]` (user can still
   add/remove — feature 7 preserved); `not_simulatable` abilities render as
   a visible "not simulated" chip (honesty in the UI).
2. **Proof:** for 5 known units, auto-applied simulation output ==
   hand-applied output (existing sim tests extended); the chip shows for a
   known-unmappable aura.

### Phase E — Coverage loop

Coverage metric (% of ability occurrences with approved mappings) in the run
log; the gap report feeds the next review batch. New BSData sync → diff new/
changed ability IDs → auto-queue compile for just those (chunked, Rule 9).

## Verification checklist

- [ ] A: distinct-ability count recorded; top-50 reviewed.
- [ ] B: 30-item spot-check disagreement rate recorded.
- [ ] C: grep proves no GW text committed; sync delivers mappings.
- [ ] D: 5-unit parity test green; not-simulatable chip renders.
- [ ] E: coverage % visible; incremental re-compile on sync diff works.

## Risks / notes

- **Vocabulary gaps:** some real abilities (auras, conditional rerolls,
  fight-on-death) exceed the 24 variants. The playbook treats vocabulary
  extension as a *simulator* feature request (typed, tested), never an LLM
  free-form output — the union stays closed.
- **Model temptation:** do not let the compile pass "improve" semantics
  (e.g. mapping Rapid Fire to ATTACKS_MOD unconditionally) — worked examples
  in the prompt pin the conservative interpretation; reviewer owns judgment.
- Leader rules (`LeaderRule` in the editor) reuse the same mapping table —
  no second pipeline.
