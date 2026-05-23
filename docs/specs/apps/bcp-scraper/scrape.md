# apps/bcp-scraper/server/src/lib/scrape.ts

> Core scraper — authenticates with BCP, fetches recent events, imports to Turso.

## Prompt

Export `runScrape(config: ScrapeConfig, triggeredBy?: string): Promise<{ jobId: string }>`.

**Flow:**
1. Create a `bcp_scrape_jobs` record with status `running`.
2. Authenticate with BCP via `authenticateBcp()` (OAuth2 flow).
3. Create `BcpApiClient` with the token.
4. Search for events in the last 7 days with `minPlayers: 20` and `minRounds: 5`.
5. Check which events are already in `meta_events` (by `sourceId` where `source = 'bcp'`).
6. For each new non-team event:
   a. Fetch full event details via `api.getEvent()`.
   b. Insert into `meta_events` (id, name, date, location, format='GT', rounds, playerCount, source='bcp', sourceId, importedAt).
   c. Fetch all round pairings via `api.getPairings()`.
   d. Accumulate player stats (wins/losses/draws) from pairings using `PlayerAccumulator` map.
   e. Sort players by wins descending (losses ascending for tiebreak) for placement.
   f. Insert each player into `meta_event_players` with `normalizeFaction()` for factionId. Skip players with unknown factions (log error).
   g. Insert all pairings into `meta_pairings` with player FK lookups.
7. Update job record as `completed` or `failed`.

Helper functions: `buildLocation(event)` — joins city/state/country. `mapResult(p1Result, p2Result)` — BCP uses `2` for win, maps to `'p1'|'p2'|'draw'`.

## Dependencies

- `./cognito` — `authenticateBcp`
- `./bcp-api` — `BcpApiClient`, `BcpEvent`, `BcpPairing`
- `./faction-map` — `normalizeFaction`
- `./detachment-map` — `extractDetachment`
- `@tabletop-tools/server-core` — `generateId`
- `@tabletop-tools/db` — `metaEvents`, `metaEventPlayers`, `metaPairings`, `bcpScrapeJobs`, `Db`
- `drizzle-orm` — `eq`

## Contracts

- Per-event try/catch — one event failure doesn't abort the batch
- Outer try/catch updates job status to `failed` on total failure
- ScrapeConfig accepts optional `fetch` for testability
