# Playbook — new-meta: list normalization tail + NL meta-queries

> **Deliverable.** (a) Raise the parse coverage of stored tournament lists
> using the LLM-for-the-tail pattern; (b) an optional natural-language query
> layer over the meta tables. Glicko-2 and matchup math stay deterministic.
>
> **Status:** drafted 2026-07-06 (loop iteration 10). Grounded this session:
> `meta_event_players.list_text` column (+ `list_ttt` parsed JSON),
> `lib/detachment.ts::extractDetachment` (regex-first), `lib/aggregate.ts`,
> and bcp-scraper's `parsePendingLists` (chunked 100/run, ok/partial/failed
> counters) — the pipeline that feeds these tables.

## Current state (grounded — the instrumentation already exists)

- Free-text army lists live in `meta_event_players.list_text`; parsed form in
  `list_ttt` (JSON), produced by bcp-scraper's deterministic
  `parseList(text)` with **status counters ok/partial/failed** per run.
- `extractDetachment(listText)` does regex-pattern detachment detection.
- Faction/detachment/placement fields feed the dashboards; Glicko-2 runs off
  results only (no text) — correctly out of LLM scope.

## Surface (a) — normalization tail (shared with bcp-scraper playbook)

1. **Measure first:** query the live counters — what % of rows with
   `list_text` have `list_ttt` status `partial`/`failed`? *(Record the
   number; if it's already <5 %, the LLM lane may not be worth building —
   the flip trigger runs backwards too.)*
2. **LLM tail pass (T1 batch, D08):** rows with `partial`/`failed` →
   Tier I compile against the same output schema as `parseList` (+
   `needsReview`, confidence); write back to `list_ttt` tagged
   `parsedBy: 'llm'`; review queue for low-confidence.
3. **Entity alignment:** parsed faction/detachment names resolve against the
   canonical entity registry (Rule 1 — `content_entity`, same tables
   tournament uses); mismatches surface in the existing admin page rather
   than a new tool.
4. **Proof:** coverage % before/after recorded; 20-row spot check;
   `parsedBy` tag queryable so LLM-parsed rows are auditable forever.

## Surface (b) — natural-language meta queries (optional tier)

1. Shape: "which detachments beat X since the dataslate?" → LLM compiles NL →
   a **whitelisted query plan** (predefined parameterized queries over
   existing tables — never raw SQL from the model), → deterministic
   execution → tabular answer.
2. Routes through the shared provider (D07): Workers AI on the public site,
   local in dev. Latency-tolerant (it's an analyst feature, not a hot path).
3. **Proof:** 15-question fixture set → 100 % of executed queries are from
   the whitelist (constrained by schema, D08 J3 — the enum of query plans is
   literally the JSON-schema enum); refusals are explicit ("can't answer
   with available queries").
4. **Honest default: don't build until asked** — the dashboards already
   answer the common questions; this tier exists in the wargame so its shape
   is decided, not because it's scheduled.

## Verification checklist

- [ ] Tail % measured before any LLM work; decision recorded either way.
- [ ] `parsedBy` audit tag in `list_ttt`; spot-check numbers logged.
- [ ] Entity alignment via canonical registry (no local lookup maps — Rule 6).
- [ ] NL tier: whitelist-only execution proven on fixtures (if built).

## Risks / notes

- `list_text` is user/tournament-submitted content — storing and parsing it
  is fine; committed artifacts still avoid GW text (parsed structures are
  names/points/counts — same class as versus mappings).
- Radical-transparency principle (app's differentiator): LLM-parsed rows are
  *labeled* in the UI where shown — transparency applies to provenance too.
