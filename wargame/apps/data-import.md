# Playbook — data-import: LLM proposals for the unmatched/ambiguous mapping tail

> **Deliverable.** Use the existing match counters to decide whether an LLM
> reconciliation pass is worth building; if yes, it's a reviewable-proposals
> batch job, never an inline auto-binder.
>
> **Status:** drafted 2026-07-06 (loop iteration 10). Grounded this session:
> `server/src/lib/id-mapping.ts` (normalizeName + buildIdMapping read),
> data-import CLAUDE.md (weekly cron → R2 → client IndexedDB flow).

## Current state (grounded — the metric already exists)

- `buildIdMapping(datasheets, factions, bsdataUnits)`: normalized-name match
  (lowercase, punctuation-stripped) with faction disambiguation; returns
  **`{matched, unmatched, ambiguous}` counts** — and the code comment is
  explicit that `ambiguous` = "first candidate was taken… can silently bind
  the wrong unit," surfaced as a number on purpose.
- Parsers (Wahapedia CSV, BSData XML) are deterministic and out of LLM scope
  (they parse *structured* data; an LLM there is a regression).

## The decision gate (measure before building — same as new-meta)

1. Run the weekly sync (or replay the last one locally) and **record the
   actual `unmatched` and `ambiguous` counts.** The wargame refuses to
   assume they're big.
2. **If unmatched+ambiguous is a handful** → maintain a small manual override
   table (Rule 6) and stop — an LLM pipeline for 12 rows is ceremony.
3. **If it's dozens-to-hundreds** → build the tail pass below.

## The tail pass (if gated in)

1. **Job:** for each unmatched Wahapedia datasheet, give Tier I the datasheet
   name+faction and the k nearest BSData candidates (string-distance
   shortlist — deterministic pre-filter keeps the prompt small); schema:
   `{wahapediaId, proposedBsdataId | null, confidence, reason}` (D08 J3+J5).
   For `ambiguous` rows: same, but candidates = the tied set — the LLM's only
   job is picking within the tie.
2. **Output = proposals, never bindings:** rows land in a review table; the
   admin judge pattern (admin playbook `grade()`) can pre-screen
   APPROVE/UNSURE; a human approves before the mapping ships. Approved
   overrides feed `buildIdMapping` as an input table (checked before fuzzy
   matching), making the fix durable across weekly syncs.
3. **Where it runs:** T1 local batch (D09) — the weekly Worker cron stays
   untouched (Rule 9: its budget is already spent on parsing).
4. **Proof:** counters before/after overrides applied; zero direct writes to
   the live mapping from the LLM job (grep: job writes only the proposals
   table).

## Verification checklist

- [ ] Actual unmatched/ambiguous numbers recorded (the gate).
- [ ] Override table consumed by `buildIdMapping` (test with a synthetic
      override).
- [ ] Proposals→review→override flow demonstrated on real tail rows (if
      gated in).

## Risks / notes

- Name matching failures often encode *real* modeling questions (unit
  variants, combined datasheets) — the `reason` field matters more than the
  match; a reviewer learns the taxonomy gaps from it.
- Cross-references: same review-queue/metrics machinery as D08; same
  "deterministic shortlist → LLM picks within it" shape as new-meta (a);
  keep all three consistent (one pattern, three consumers — Rule 3).
