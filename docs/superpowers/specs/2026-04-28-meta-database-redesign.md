# Meta Database Redesign

## Problem

Tournament data is stored as JSON blobs in a single `imported_tournament_results` table. Every query does `SELECT *`, pulls megabytes of text, parses JSON in JS, and aggregates in memory. This times out on Cloudflare Workers.

## Design Overview

Two layers:
1. **3NF tables** — normalized source of truth for all tournament data
2. **Cube tables** — pre-aggregated rollup (`meta_top`) + fact table + dimensions for instant dashboard queries

`meta_top` holds pre-computed stats for every faction × every frame of reference. Dashboard reads are a single indexed SELECT. Cube is rebuilt when new events are imported.

---

## Reference / Lookup Tables

```sql
-- Faction hierarchy: faction → subfaction → detachment
CREATE TABLE dim_faction (
  id              TEXT PRIMARY KEY,            -- slug: 'space-marines'
  name            TEXT NOT NULL,               -- 'Space Marines (Astartes)'
  allegiance      TEXT NOT NULL                -- 'imperium' / 'chaos' / 'xenos'
);

CREATE TABLE dim_subfaction (
  id              TEXT PRIMARY KEY,            -- slug: 'blood-angels'
  name            TEXT NOT NULL,               -- 'Blood Angels'
  faction_id      TEXT NOT NULL REFERENCES dim_faction(id)
);
CREATE INDEX idx_dim_subfaction_faction ON dim_subfaction(faction_id);

CREATE TABLE dim_detachment (
  id              TEXT PRIMARY KEY,            -- slug: 'sons-of-sanguinius'
  name            TEXT NOT NULL,               -- 'Sons of Sanguinius'
  faction_id      TEXT NOT NULL REFERENCES dim_faction(id),
  subfaction_id   TEXT REFERENCES dim_subfaction(id)  -- nullable: faction-level detachments
);
CREATE INDEX idx_dim_detachment_faction ON dim_detachment(faction_id);
CREATE INDEX idx_dim_detachment_subfaction ON dim_detachment(subfaction_id);

-- Frame of reference type (temporal periods)
CREATE TABLE dim_for_type (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE         -- 'Event' / 'Weekend' / 'Month' / 'Quarter' / 'Year' / 'DataSlate' / 'TournamentPack' / 'Edition'
);
-- Seed: INSERT INTO dim_for_type VALUES
--   (1,'Event'),(2,'Weekend'),(3,'Month'),(4,'Quarter'),
--   (5,'Year'),(6,'DataSlate'),(7,'TournamentPack'),(8,'Edition');

-- Entity granularity level (what level meta_top row represents)
CREATE TABLE dim_granularity (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE         -- 'Faction' / 'SubFaction' / 'Detachment'
);
-- Seed: INSERT INTO dim_granularity VALUES
--   (1,'Faction'),(2,'SubFaction'),(3,'Detachment');

-- Game rule periods
CREATE TABLE dim_dataslate (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,               -- 'April 2025 Balance Dataslate'
  effective_date  INTEGER NOT NULL,            -- unix ms
  end_date        INTEGER                      -- null = current
);

CREATE TABLE dim_tournament_pack (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,               -- 'Chapter Approved 2025'
  effective_date  INTEGER NOT NULL,
  end_date        INTEGER
);

CREATE TABLE dim_edition (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,               -- '10th Edition'
  start_date      INTEGER NOT NULL,
  end_date        INTEGER
);

CREATE TABLE dim_region (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,               -- 'North America' / 'Europe' / 'Oceania' / etc.
  country         TEXT                         -- optional subdivision
);
```

---

## 3NF Schema (Source of Truth)

```sql
CREATE TABLE meta_events (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  date            INTEGER NOT NULL,            -- unix ms
  location        TEXT,
  gps_coords      TEXT,                        -- 'lat,long'
  region_id       INTEGER REFERENCES dim_region(id),
  format          TEXT NOT NULL,               -- 'GT' / 'Major' / 'Super Major'
  rounds          INTEGER,
  player_count    INTEGER NOT NULL,
  source          TEXT NOT NULL,               -- 'bcp' / 'manual'
  source_id       TEXT,                        -- BCP event ID (null for manual)
  imported_at     INTEGER NOT NULL,
  -- Event winner (denormalized from placements for quick access)
  win_faction_id      TEXT REFERENCES dim_faction(id),
  win_subfaction_id   TEXT REFERENCES dim_subfaction(id),
  win_detachment_id   TEXT REFERENCES dim_detachment(id),
  UNIQUE(source, source_id)
);
CREATE INDEX idx_meta_events_date ON meta_events(date);
CREATE INDEX idx_meta_events_format ON meta_events(format);
CREATE INDEX idx_meta_events_region ON meta_events(region_id);

-- Import uses: INSERT OR IGNORE INTO meta_events ... ON CONFLICT(source, source_id) DO NOTHING

CREATE TABLE meta_event_players (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL,
  source_player_id TEXT,                       -- BCP internal player ID (null for manual)
  faction_id      TEXT NOT NULL REFERENCES dim_faction(id),
  subfaction_id   TEXT REFERENCES dim_subfaction(id),
  detachment_id   TEXT REFERENCES dim_detachment(id),
  placement       INTEGER NOT NULL,
  list_text       TEXT,                        -- army list (nullable)
  -- Denormalized W/L/D (derived from meta_pairings, materialized for query speed)
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  -- Glicko-2 rating snapshot at this event
  gl2_rating_start  REAL,
  gl2_rd_start      REAL,
  gl2_vol_start     REAL,
  gl2_rating_end    REAL,
  gl2_rd_end        REAL,
  gl2_vol_end       REAL,
  UNIQUE(event_id, source_player_id)           -- dedup by BCP ID when available
);
CREATE INDEX idx_meta_event_players_event ON meta_event_players(event_id);
CREATE INDEX idx_meta_event_players_faction ON meta_event_players(faction_id);
CREATE INDEX idx_meta_event_players_subfaction ON meta_event_players(subfaction_id);
CREATE INDEX idx_meta_event_players_detachment ON meta_event_players(detachment_id);

-- Note: For manual imports without source_player_id, dedup by (event_id, player_name)
-- at import time. The UNIQUE constraint only fires when source_player_id is non-null
-- (SQLite treats NULL as distinct in UNIQUE).

CREATE TABLE meta_pairings (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  player1_id      TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
  player2_id      TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
  player1_score   INTEGER,
  player2_score   INTEGER,
  player1_gl2     REAL,                        -- rating at time of game
  player2_gl2     REAL,
  result          TEXT NOT NULL,               -- 'p1' / 'p2' / 'draw'
  UNIQUE(event_id, round, player1_id, player2_id)
);
CREATE INDEX idx_meta_pairings_event_round ON meta_pairings(event_id, round);
CREATE INDEX idx_meta_pairings_player1 ON meta_pairings(player1_id);
CREATE INDEX idx_meta_pairings_player2 ON meta_pairings(player2_id);

-- Win distribution per event (no fixed cap on rounds)
CREATE TABLE meta_event_win_distribution (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  wins            INTEGER NOT NULL,            -- 0, 1, 2, ... up to event rounds
  player_count    INTEGER NOT NULL,
  player_pct      REAL NOT NULL                -- 0.0–1.0
);
CREATE INDEX idx_event_win_dist_event ON meta_event_win_distribution(event_id);
CREATE UNIQUE INDEX idx_event_win_dist_unique ON meta_event_win_distribution(event_id, wins);

-- Top placements per event by faction
CREATE TABLE meta_event_placements (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL,               -- 'winner' / 'finalist' / 'top4' / 'top8' / 'top16'
  faction_id      TEXT NOT NULL REFERENCES dim_faction(id),
  subfaction_id   TEXT REFERENCES dim_subfaction(id),
  detachment_id   TEXT REFERENCES dim_detachment(id),
  player_name     TEXT NOT NULL,
  placement       INTEGER NOT NULL
);
CREATE INDEX idx_event_placements_event ON meta_event_placements(event_id);
CREATE INDEX idx_event_placements_faction ON meta_event_placements(faction_id);
```

---

## Cube / Analytics Schema

### Frame of Reference

Every frame is a window through which you can view the meta: a single event, a weekend, a month, a quarter, a dataslate period, etc.

```sql
CREATE TABLE meta_for (
  -- Deterministic ID: e.g. 'quarter:2025:2' or 'dataslate:april-2025' or 'event:sgFuKOPZi83a'
  id              TEXT PRIMARY KEY,
  type_id         INTEGER NOT NULL REFERENCES dim_for_type(id),
  date            INTEGER NOT NULL,            -- unix ms, start of period
  end_date        INTEGER,                     -- null for single-day frames
  day             INTEGER,                     -- day of month (1-31), null for non-day frames
  month           INTEGER,                     -- 1-12, null for quarter/year frames
  quarter         INTEGER,                     -- 1-4, null for month/day frames
  year            INTEGER NOT NULL,
  dataslate_id    TEXT REFERENCES dim_dataslate(id),
  tourney_pack_id TEXT REFERENCES dim_tournament_pack(id),
  edition_id      TEXT REFERENCES dim_edition(id)
);
CREATE INDEX idx_meta_for_type ON meta_for(type_id);
CREATE INDEX idx_meta_for_type_date ON meta_for(type_id, date);
CREATE INDEX idx_meta_for_dataslate ON meta_for(dataslate_id);
CREATE INDEX idx_meta_for_tourney_pack ON meta_for(tourney_pack_id);
CREATE INDEX idx_meta_for_edition ON meta_for(edition_id);

-- Deterministic ID examples:
--   'event:sgFuKOPZi83a'          type=Event
--   'weekend:2025-04-26'          type=Weekend
--   'month:2025-04'               type=Month
--   'quarter:2025:2'              type=Quarter
--   'year:2025'                   type=Year
--   'dataslate:april-2025'        type=DataSlate
--   'pack:chapter-approved-2025'  type=TournamentPack
--   'edition:10th'                type=Edition
--
-- Using deterministic IDs means INSERT OR REPLACE handles idempotent rebuilds.
-- No separate UNIQUE constraint needed — PK is the natural key.
```

### Pre-Aggregated Rollup

One row per faction/subfaction/detachment per frame of reference. This is what the dashboard reads.

`meta_top` uses a deterministic composite primary key to avoid SQLite NULL uniqueness issues and guarantee idempotent rebuilds.

```sql
CREATE TABLE meta_top (
  -- Deterministic PK: 'faction:space-marines:quarter:2025:2'
  -- or 'detachment:sons-of-sanguinius:dataslate:april-2025'
  id              TEXT PRIMARY KEY,
  -- What level this row represents
  granularity_id  INTEGER NOT NULL REFERENCES dim_granularity(id),
  -- Faction hierarchy (populated based on granularity)
  faction_id      TEXT NOT NULL REFERENCES dim_faction(id),
  subfaction_id   TEXT REFERENCES dim_subfaction(id),             -- null for faction-level rows
  detachment_id   TEXT REFERENCES dim_detachment(id),             -- null for faction/subfaction-level rows
  -- Frame of reference
  meta_for_id     TEXT NOT NULL REFERENCES meta_for(id) ON DELETE CASCADE,
  -- Rates
  win_rate        REAL NOT NULL,
  draw_rate       REAL NOT NULL,
  over_rep        REAL NOT NULL,               -- representation vs expected (1.0 = average)
  four_oh_start   REAL NOT NULL,               -- % of 4-0 event starts
  -- Event placement counts
  event_wins      INTEGER NOT NULL DEFAULT 0,
  event_finals    INTEGER NOT NULL DEFAULT 0,
  event_top4      INTEGER NOT NULL DEFAULT 0,
  event_top8      INTEGER NOT NULL DEFAULT 0,
  event_top16     INTEGER NOT NULL DEFAULT 0,
  -- Population
  player_pop_pct  REAL NOT NULL,               -- % of total player population
  -- Raw counts
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  games           INTEGER NOT NULL DEFAULT 0,
  players         INTEGER NOT NULL DEFAULT 0,
  CHECK(win_rate >= 0.0 AND win_rate <= 1.0),
  CHECK(draw_rate >= 0.0 AND draw_rate <= 1.0),
  CHECK(win_rate + draw_rate <= 1.0)
);
CREATE INDEX idx_meta_top_faction ON meta_top(faction_id);
CREATE INDEX idx_meta_top_subfaction ON meta_top(subfaction_id);
CREATE INDEX idx_meta_top_detachment ON meta_top(detachment_id);
CREATE INDEX idx_meta_top_for ON meta_top(meta_for_id);
CREATE INDEX idx_meta_top_for_granularity ON meta_top(meta_for_id, granularity_id);
CREATE INDEX idx_meta_top_faction_for ON meta_top(faction_id, meta_for_id);
```

### Fact Table (per-game grain)

For ad-hoc queries, matchup matrices, and anything meta_top doesn't cover.

The fact table does NOT carry `meta_for_id` — a single game belongs to multiple frames simultaneously (its event, its weekend, its month, its quarter, its dataslate, etc.). Frame membership is determined by joining on `meta_events.date` against `meta_for.date/end_date` ranges at aggregation time. `meta_top` is the pre-computed result of those aggregations.

```sql
CREATE TABLE fact_game_results (
  id                    TEXT PRIMARY KEY,
  event_id              TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
  player_id             TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
  opponent_id           TEXT REFERENCES meta_event_players(id) ON DELETE CASCADE,  -- null for byes
  round                 INTEGER NOT NULL,
  faction_id            TEXT NOT NULL REFERENCES dim_faction(id),
  subfaction_id         TEXT REFERENCES dim_subfaction(id),
  detachment_id         TEXT REFERENCES dim_detachment(id),
  opponent_faction_id   TEXT REFERENCES dim_faction(id),
  opponent_subfaction_id TEXT REFERENCES dim_subfaction(id),
  opponent_detachment_id TEXT REFERENCES dim_detachment(id),
  result                REAL NOT NULL,           -- 1.0 win, 0.0 loss, 0.5 draw
  player_score          INTEGER,                 -- VP scored by this player
  opponent_score        INTEGER                  -- VP scored by opponent
);
CREATE INDEX idx_fact_results_faction ON fact_game_results(faction_id);
CREATE INDEX idx_fact_results_subfaction ON fact_game_results(subfaction_id);
CREATE INDEX idx_fact_results_detachment ON fact_game_results(detachment_id);
CREATE INDEX idx_fact_results_event ON fact_game_results(event_id);
CREATE INDEX idx_fact_results_player ON fact_game_results(player_id);
CREATE INDEX idx_fact_results_matchup ON fact_game_results(faction_id, opponent_faction_id);
```

### Cube Rebuild Status

Tracks whether the cube is current. Dashboard can surface a warning if stale or failed.

```sql
CREATE TABLE meta_cube_status (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  last_started_at   INTEGER,
  last_completed_at INTEGER,
  last_event_id     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'  -- 'pending' / 'running' / 'complete' / 'failed'
);
```

---

## Data Flow

```
BCP scraper (local files)
  → .local/ingest/bcp/pairings-*.json
  → import script (INSERT OR IGNORE on source/source_id)
  → 3NF: meta_events + meta_event_players + meta_pairings
  → win distribution + placements (from 3NF)
  → cube builder:
      1. Set meta_cube_status = 'running'
      2. Populate dim_faction / dim_subfaction / dim_detachment (INSERT OR IGNORE)
      3. Populate fact_game_results (from meta_pairings)
      4. Generate meta_for rows for affected periods (INSERT OR REPLACE on deterministic ID)
      5. Rebuild meta_top for all affected meta_for periods (INSERT OR REPLACE on deterministic ID)
      6. Set meta_cube_status = 'complete'

Manual CSV import (admin UI)
  → same 3NF tables → same cube rebuild
```

## Dashboard Query Examples

```sql
-- Faction win rates for a quarter (reads meta_top, instant)
SELECT mt.*, df.name AS faction_name
FROM meta_top mt
JOIN dim_faction df ON mt.faction_id = df.id
WHERE mt.meta_for_id = 'quarter:2025:2'
  AND mt.granularity_id = 1   -- Faction level
ORDER BY mt.win_rate DESC;

-- Faction win rate trend over 12 weeks (reads meta_top)
SELECT df.name AS faction, mf.date, mt.win_rate, mt.games
FROM meta_top mt
JOIN dim_faction df ON mt.faction_id = df.id
JOIN meta_for mf ON mt.meta_for_id = mf.id
WHERE mt.faction_id = ?
  AND mt.granularity_id = 1
  AND mf.type_id = 2          -- Weekend
  AND mf.date >= ?             -- 12 weeks ago
ORDER BY mf.date;

-- Matchup matrix (reads fact table)
SELECT df1.name AS faction_a, df2.name AS faction_b,
       SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS a_wins,
       SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS b_wins,
       SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws,
       COUNT(*) AS total,
       AVG(f.result) AS a_win_rate
FROM fact_game_results f
JOIN dim_faction df1 ON f.faction_id = df1.id
JOIN dim_faction df2 ON f.opponent_faction_id = df2.id
JOIN meta_events me ON f.event_id = me.id
WHERE f.faction_id < f.opponent_faction_id   -- dedup on IDs
  AND f.opponent_faction_id IS NOT NULL       -- exclude byes
  AND me.date BETWEEN ? AND ?                 -- date range filter
GROUP BY f.faction_id, f.opponent_faction_id
HAVING total >= ?;

-- Top lists for a faction
SELECT ep.player_name, ep.placement, ep.list_text,
       ep.wins, ep.losses, ep.draws,
       me.name AS event_name, me.date
FROM meta_event_players ep
JOIN meta_events me ON ep.event_id = me.id
WHERE ep.faction_id = ?
ORDER BY ep.placement ASC
LIMIT 20;

-- VP spread analysis for a faction matchup
SELECT AVG(f.player_score - f.opponent_score) AS avg_vp_spread,
       COUNT(*) AS games
FROM fact_game_results f
WHERE f.faction_id = ? AND f.opponent_faction_id = ?
  AND f.player_score IS NOT NULL;
```

## Migration Path

1. Add all new tables to `packages/db/src/schema.ts` (Drizzle ORM definitions)
2. Seed `dim_for_type` and `dim_granularity` lookup tables
3. Seed `dim_dataslate`, `dim_tournament_pack`, `dim_edition` with known 40K periods
4. Seed `dim_faction` / `dim_subfaction` / `dim_detachment` from known 40K factions
5. Generate migration via `drizzle-kit generate`
6. Write 3NF import script (reads pairings JSON → meta_events/players/pairings)
7. Write cube builder (reads 3NF → facts + meta_for + meta_top)
8. Update `meta.ts` router to query meta_top and fact_game_results
9. Remove `aggregate.ts` JS-side computation
10. Apply migration to Turso, run import + cube build
11. Verify dashboard loads instantly
12. Keep `imported_tournament_results` temporarily for rollback
13. Drop old table once verified

### Drizzle Translation Notes

- Expression-based unique indexes (e.g. COALESCE for NULL-safe dedup) require `sql` template literals
- FK references use `.references(() => table.col)` lambda syntax
- `ON DELETE CASCADE` uses `{ onDelete: 'cascade' }` option
- CHECK constraints use `.check()` method on table definition
- Deterministic PKs eliminate the need for separate UNIQUE constraints
