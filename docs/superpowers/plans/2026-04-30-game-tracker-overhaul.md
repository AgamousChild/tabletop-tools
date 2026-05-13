# Game Tracker Overhaul (#39)

## Goal

Redesign game-tracker with polished UI. Requires Worker and data model changes.

## Current State

- Multi-screen match flow: mission → pregame → battle (turn-by-turn) → endgame
- Stores in Turso: matches + turns tables
- Basic form-based UI
- No integration with army lists or brain data

## Needs Micah's Design Input

1. **What data should be captured per turn?** Currently: VP scored. Should we add: primary scored, secondary scored, units destroyed, command points spent?
2. **Should it integrate with list-builder?** Import your list, track casualties per unit?
3. **Mission selection:** From brain data (Chapter Approved missions)? Manual entry?
4. **Photos:** Keep the photo capture feature? Improve it?
5. **Scoring display:** Real-time VP graph? Running total? Side-by-side comparison?
6. **Post-game:** Auto-submit to new-meta dataset? Generate matchup insights?

## Data Model Changes Likely Needed

- `turns` table: add columns for primary VP, secondary VP, CP remaining, units destroyed
- `matches` table: add mission_id (link to brain CA missions), deployment_zone, first_turn, `faction_id`, `detachment_id` (required for auto-submit to new-meta)
- New table: `match_casualties` — track which units died each turn. `unit_id` references game-data-store unit IDs (IndexedDB keys, not free text)
- Link to `meta_event_players` for tournament integration

All schema changes require updating the CREATE TABLE SQL in all 8 test files per CLAUDE.md conventions.

## Architecture Question

Should game-tracker data feed into the meta analytics cube? If yes:
- Each recorded game becomes a row in fact_game_results
- Need `faction_id` and `detachment_id` on both players (must be on the match record)
- This would give us "kitchen table" game data, not just tournament data
- Auto-submit to new-meta requires `faction_id` and `detachment_id` on the match record

## Estimated effort

Unknown until design is defined. Rough guess:
- UI redesign: 4-6 hours
- Data model changes: 2 hours (+ updating 8 test files)
- Worker/router updates: 2 hours
- Testing: 2 hours

## Blocked by

- Design input from Micah
- Possibly #45 (TTT list format) for army list integration
