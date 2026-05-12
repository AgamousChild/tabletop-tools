# 11th Edition Preparation (#46)

## Situation

New edition dropping June 2026 (~2 months). Warhammer Community website publishing preview articles with new rule frameworks. Need to be ready to flip the entire platform on launch day.

## Phase 1: Intelligence Gathering (NOW)

### Task: Scrape Warhammer Community previews

Add warhammer-community.com to the content ingestor. Scrape all articles tagged with 11th edition / new edition preview. Extract:
- New core mechanics
- Changed phases
- Army construction changes
- New keywords / abilities
- Points system changes

Store as brain community nodes with `edition: '11th'` tag.

### Task: Track what changes

Create a living document: `docs/11th-edition-changes.md`
- What mechanics are confirmed changing
- What stays the same
- What's unknown
- Impact on each app

**Note:** Phase 3 is blocked until GW releases full rules — preview articles only give partial mechanics. Do not begin implementation work based on speculative previews.

## Phase 2: Architecture Planning (May)

### Data model

- `dim_edition` already exists — verify it is populated and that the meta pipeline queries filter on `edition_id`. Add 11th edition entry.
- Brain graph needs edition-aware nodes (same ability may have different text in 10th vs 11th)
- meta_top needs to separate 10th and 11th data once 11th events start
- Game data store needs to handle both editions during transition

### Edition toggle

URL hash param `#/edition/10th` vs `#/edition/11th`, persisted in `localStorage`. Users can switch between editions without losing their place.

### App impact assessment

| App | Impact | Changes needed |
|---|---|---|
| Brain | HIGH | New parsers for 11th faction packs, updated core rules, edition toggle |
| Versus | HIGH | Simulation pipeline may change fundamentally (new wound table? new AP?) |
| List Builder | HIGH | Army construction rules change |
| Game Tracker | MEDIUM | Phase sequence may change, scoring changes |
| New Meta | LOW | Just needs edition filter on queries, data model already supports it |
| Tournament | LOW | Mission pack changes, Swiss algorithm stays |
| No-Cheat | NONE | Dice physics don't change between editions |
| Data Import | HIGH | New data sources, new XML format from BSData |

## Phase 3: Implementation (Late May)

Blocked until GW releases full rules. Preview articles only give partial mechanics — do not begin implementation based on speculation.

- Fork brain parsers for 11th edition format
- Build edition toggle in UI (show 10th or 11th rules)
- Pre-build 11th edition graph from preview articles
- Test with preview data

## Phase 4: Launch Day (June)

- Import 11th edition faction packs as they release
- Switch default edition to 11th
- Keep 10th available for historical reference
- Start scraping 11th edition events from BCP

## Estimated effort

Phase 1: 2-3 hours (scraping + document)
Phase 2: 1 day (planning, no code)
Phase 3: 1-2 weeks (depends on how much changes) — blocked until full rules released
Phase 4: 1 day

## Needs

- Micah to share Warhammer Community preview article URLs
- Understanding of which rules are confirmed vs speculative
- Decision: do we support both editions simultaneously or just switch?
