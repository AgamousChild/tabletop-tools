# New-Meta Dashboard UI (#29)

## Goal

Match Hutber Stats / Stat Check quality. Current UI is functional but basic tables. Need data-dense, visually polished dashboard.

## Reference

- Hutber Stats: stats.hutber.com (screenshots saved)
- Stat Check: public.tableau.com Stat Check dashboard (screenshots saved)

## Pre-Implementation Checks

Before writing code:
1. **Verify weekly meta_top rows exist:** `SELECT COUNT(*) FROM meta_top mt JOIN meta_for mf ON mt.meta_for_id = mf.id WHERE mf.type_id = 2` — if 0, movers panel is blocked until cube builder generates weekly frames
2. **Verify unique player count is queryable:** `SELECT COUNT(DISTINCT player_id) FROM fact_game_results` for KPI accuracy

## Views to Build

### 1. Dashboard (main page)

**Top KPI cards row:**
- Total Games | Player Entries | Best WR Faction | Most Played Faction | Active Events

Note: "Player Entries" not "Active Players" — a player using two factions counts twice. Honest label. "Player of the Week" cut — no data source exists for weekly individual performance.

**Faction table (center):**
- Rank | Faction (with allegiance dot) | Win Rate (color gradient bar, not just text) | Players | Games | Over Rep (multiplier badge) | Event Wins | Top 4 | 4-0 Starts %
- Sortable by clicking column headers
- Click row → faction detail

**Balance quadrant chart (right sidebar):**
- X axis: Over Rep (multiplier, midpoint = 1.0 = average representation)
- Y axis: Win Rate (midpoint = 0.5 = 50%)
- Quadrant dividers at x=1.0, y=0.5
- Linear scale, X axis clamped to 0-5.0 (Space Marines at ~4.9x is the outlier)
- Labels: tooltip-only on hover to avoid collision. Dots always visible, colored by allegiance.
- Quadrants labeled: "OP" (top-right), "Overplayed" (bottom-right), "Sleeper" (top-left), "Weak" (bottom-left)

**Movers panel (right sidebar):**
- Top 5 factions with biggest WR increase this week
- Top 5 factions with biggest WR decrease
- Arrow icons + delta percentage
- **Dependency:** Requires weekly (type_id=2) meta_top rows. If not available, show "Weekly data not yet available" placeholder.

### 2. Faction Detail (click from dashboard)

**Stat cards:** Win Rate, Games, Players, Event Wins, Top 4, Over Rep, Draw Rate

**Frame parameter:** Thread the selected frame from Dashboard through to FactionDetail. When user picks a time window on Dashboard and clicks a faction, the detail page shows data for that same frame — not the default.

**Detachment table:** Detachment name, WR, Games, Players — same style as faction table

**Timeline chart:** Win rate over time (weekly bars, color-coded green/amber/red)

**Top lists:** Card display with player name, event, placement, W-L-D, expandable list text

### 3. Source Data (events list)

**Event table:** Name, Date, Format (badge), Location, Players, Rounds, Winner Faction
- Format badges: Super Major (gold), Major (purple), GT (gray)
- Click → event detail

### 4. Event Detail

**Header:** Event name, date, format badge, location, player count, rounds, winner

**Win distribution histogram:** Bar chart showing X-win player counts

**Player results table:** Rank, Player Name, Faction, Detachment, W-L-D, expandable list

## Components to Build/Update

1. `WinRateBar` — gradient colored bar (green→amber→red), not just text
2. `BalanceQuadrant` — SVG scatter plot with tooltip labels, quadrant dividers at 1.0/0.5
3. `MoversPanel` — weekly delta display with up/down arrows, graceful empty state
4. `KPISummary` — row of large number cards
5. `SortableTable` — generic sortable table component
6. Update `FactionTable`, `MetaWindowSelector`, `FactionDetail`, `SourceData`, `TournamentDetail`

## Testing

- `BalanceQuadrant.test.tsx` — renders dots, handles empty data, handles single faction, tooltip content
- `MoversPanel.test.tsx` — up/down arrows correct, handles no prior week, handles empty data
- `SortableTable.test.tsx` — sort by column, sort direction toggle, stable sort
- `KPISummary.test.tsx` — renders all cards, handles zero values
- `WinRateBar.test.tsx` — color thresholds correct (green >55%, red <45%, amber between)

## Data Requirements

All data already available from meta_top and fact_game_results. Need one new query:
- `meta.movers` — compare current week's meta_top to previous week's meta_top, return deltas. Falls back gracefully if weekly frames don't exist.

## Estimated effort

8-10 hours including tests. Implementation: 5-6 hours. Tests: 3-4 hours.

## Needs Review

Micah should review each view after implementation for design feedback.
