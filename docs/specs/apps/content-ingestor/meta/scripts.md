# apps/content-ingestor/src/meta/ — Meta Analytics Scripts

> CLI scripts for building the meta analytics data warehouse from BCP tournament data.

## Scripts

### seed-dimensions.ts
Seed all dimension tables: `dim_faction` (28 factions with allegiances), `dim_subfaction` (chapters, warbands), `dim_detachment` (loaded from Wahapedia JSON), `dim_for_type` (8 frame types), `dim_granularity`, `dim_dataslate`, `dim_tournament_pack`, `dim_edition`, `dim_region`. Exports `BCP_FACTION_TO_SLUG` and `SUBFACTION_PARENT` maps.

### import-3nf.ts
Import BCP tournament pairings JSON into 3NF meta tables. Reads `.local/ingest/bcp/*.json`, maps BCP faction names to slugs, extracts detachments from list text, sorts players by W/L/D for placement, inserts events/players/pairings in batches. Creates win distributions and top-16 placement tiers.

### extract-detachments.ts
Extract detachment information from army list text via two-phase matching: (1) structured patterns (`Detachment:` lines), (2) substring match against Wahapedia detachment names (longest-first). Outputs JSON map with match metadata and confidence stats.

### build-cube.ts
Build analytics cube from 3NF data. Creates `meta_for` (8 frame types: event/weekend/month/quarter/year/dataslate/pack/edition), `fact_game_results` (symmetric player perspective rows), `meta_top` (aggregated faction stats: win rate, representation %, top finishes per faction per frame).

## Dependencies

All scripts use: `@libsql/client`, `@tabletop-tools/db`, `drizzle-orm`, `fs`, `path`.
