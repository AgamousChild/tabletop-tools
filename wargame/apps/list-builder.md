# Playbook — list-builder: list import parsing + suggestion explanations

> **Deliverable.** Two additive LLM surfaces: (a) paste-a-list import (new
> capability — today it only *exports* plain text), (b) natural-language
> rationale for rating suggestions. Ratings math and legality rules stay
> deterministic, untouched.
>
> **Status:** drafted 2026-07-06 (loop iteration 10). Grounded: list-builder
> CLAUDE.md (V2 server-first lists, rating router, export-to-clipboard
> feature 9; **no import path exists in the feature list** — this is
> greenfield, not an upgrade).

## Surface (a) — list import ("paste any list")

### Shape

Players paste lists exported from other apps (GW app, BattleScribe/NewRecruit,
free-typed) — a normalization task: free text → `{faction, detachment,
units[{name, count, points, loadout?}]}` → resolved against IndexedDB unit
data → a V2 list via the existing `listV2` router.

### Plan

1. **Deterministic first (the family pattern):** bcp-scraper already has
   `parseList(text)` with ok/partial/failed status (`lib/list-parser.ts`) —
   **reuse it, don't rewrite** (Rule 3). Move/share it via a package if
   import lands here. Record its pass rate on a 30-list sample of real
   pasted formats.
2. **LLM for the tail (D08 ladder):** `partial`/`failed` parses go to Tier I
   with a Zod schema mirroring the parser's output + `needsReview`. On-paste
   latency budget: one 8B call ≈ 2–5 s — acceptable behind a spinner for an
   explicit import action; **degrade gracefully to "manual build" when local
   lane is absent** (this is a hosted-app feature — the LLM call routes per
   D07: Workers AI for public, local for dev).
3. **Entity resolution stays deterministic:** parsed names → IndexedDB lookup
   via normalized-name matching (data-import's `normalizeName` — shared,
   Rule 3); unresolved units surface as review chips in the builder UI, never
   silent guesses.
4. **Proof:** 30-list fixture set (mixed sources) → ≥90 % units auto-resolved
   on `ok` parses; unresolved chips render; no import ever creates an
   illegal list silently (legality validator runs on import output).

## Surface (b) — "why is this suggested?" explanations

1. Suggestions today are rating-sorted alternatives (deterministic — keep).
   The LLM layer only *narrates*: given the rating features (win-rate delta,
   usage, points), produce one sentence. Routes through the shared provider;
   cache by (unitA, unitB, ratingSnapshot) in a table (Rule 6) so each pair
   is generated once, reviewed lazily, served statically.
2. **Proof:** narration never contains numbers absent from the feature input
   (hallucination check on a 20-pair sample); cache hit rate visible.

## Verification checklist

- [ ] Parser reuse (grep: one `parseList` implementation platform-wide).
- [ ] Fixture pass-rates recorded (deterministic vs +LLM tail).
- [ ] Import → legality validation → V2 save round-trip test.
- [ ] Explanation cache table + hallucination spot-check.

## Risks / notes

- Import is a *feature decision* Micah hasn't asked for yet — this playbook
  makes it cheap when wanted; don't build ahead of need (root rule: no
  features that aren't needed yet). The versus/new-meta normalization work
  delivers the shared parser regardless.
- Pasted lists are user-provided text; store them like new-meta's
  `list_text` (user data, not GW content) — fine within the data boundary.
