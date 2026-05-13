# Project Tasks

Last updated: 2026-05-10

## Progress

- **Completed:** 12
- **In Progress:** 2
- **Pending:** 19
- **Total:** 33

---

## Priority Order

### Tier 1: High Impact / Time-Sensitive

| Pri | # | Task | Status | Notes |
|---|---|---|---|---|
| 1 | 36 | BCP: paginate event scan beyond 155 events | done | Windowed monthly scanning, 6,019 events found |
| 2 | 47 | BCP: scrape all 10th edition GTs + US RTTs 20+ | in_progress | Scraper Worker deployed (Monday 4am cron), auth+search+pairings working, meta pipeline needs incremental optimization |
| 3 | 46 | 11th Edition: prepare platform for June launch | in_progress | Deadline-driven — June is weeks away |
| 4 | 57 | Brain: ingest full WHC archive (news, rules, battle reports, hobby, lore) | pending | Massive content boost |

### Tier 2: User-Facing Value

| Pri | # | Task | Status | Notes |
|---|---|---|---|---|
| 5 | 29 | New-meta: build Hutber/StatCheck quality dashboard | pending | Key differentiator |
| 6 | 44 | New-meta: improve list viewer — parse and display lists | pending | Pairs with #29 |
| 7 | 55 | Brain: pre-computed unit stacks — top builds per unit with math | pending | Unique feature |
| 8 | 56 | Brain: graph Build mode — pick unit, explore attachments, see stacked effects | pending | Extension of #55 |
| 9 | 41 | Versus: strat/detachment/ability selectors | pending | Makes sim useful for real games |

### Tier 3: Platform Features

| Pri | # | Task | Status | Notes |
|---|---|---|---|---|
| 10 | 51 | List Builder: BattleScribe/Yellowscribe export | pending | Ecosystem interop |
| 11 | 45 | TTT package format (7-layer portable army) | pending | Ties everything together |
| 12 | 43 | Tournament: BCP integration — sync events | pending | Connects tournament to real data |
| 13 | 48 | Admin: YouTube channel manager — auto-process 24/7 | pending | Content pipeline automation |
| 14 | 35 | Admin: set up routines (npm scripts) | pending | Housekeeping |
| 15 | 27 | Fix first turn scraper checkbox detection | pending | |
| 16 | 52 | List Builder: BOM layer — kit costs, shopping list | pending | Nice-to-have |
| 17 | 54 | Catalog downloaded 3D models from Cults3D | in_progress | Low urgency |

### Tier 4: Micah-Led / Bigger Lifts

| Pri | # | Task | Status | Notes |
|---|---|---|---|---|
| 18 | 38 | List Builder: overhaul with designed interface | pending | Major redesign, needs Micah's vision |
| 19 | 42 | List Builder: use brain detachment/unit cards | pending | Depends on #38 |
| 20 | 39 | Game Tracker: overhaul with new UI + data model | pending | Major redesign |
| 21 | 40 | No-Cheat: Python vision model for dice detection | pending | Different stack, R&D |
| 22 | 53 | Find a visual interface builder tool | pending | Research task |

---

## Completed

| # | Task | Date |
|---|---|---|
| 50 | Fix OverRep → Meta% (was showing 4.9x, now shows 21.3%) | 2026-05-05 |
| 25 | Brain retrieval: keyword relevance filter on connected nodes | 2026-05-05 |
| 26 | Brain Ask prompt: focused "answer the question" not "summarize faction" | 2026-05-05 |
| 28 | Turso: update all Worker secrets to new URL | 2026-04-29 |
| 30 | New-meta: add detachment data to cube (22,747) | 2026-04-29 |
| 31 | Auto-review Red Path drafts (3,286 approved) | 2026-04-30 |
| 32 | Auto-review Warphammer Math (88 approved) | 2026-04-30 |
| 34 | Brain: revert Ask model to configurable | 2026-04-29 |
| 37 | New-meta: add schema to packages/db | 2026-04-29 |
| 49 | Admin: task list page deployed | 2026-04-29 |

---

## Plans

All at `docs/superpowers/plans/2026-04-30-*.md`. Reviewed by antagonistic-reviewer.

## Platform Stats

- Brain: 19,821 nodes (7,694 community)
- BCP: 153 events, 30,052 players, 75,519 pairings, 29,950 lists
- Cube: 151,038 fact rows, 5,608 meta_top rows
- Cults3D: 1,405 models cataloged, 1,028 matched to local files
- Tests: 141 passing (new-meta)

## 11th Edition Terrain (from WHC)

4 large rect (7"x11.5"), 2 triangles (8"x11.5"), 4 medium rect (6"x4"), 2 long lines (10"x2.5"). Cover = -1 BS. Hidden rule. Engagement range = 2".

## TTT Package (7 Layers)

Meta → List → Rules → TTS → BOM → PDF → Exports
