# apps/bcp-scraper/server/src/lib/bcp-api.ts

> BCP REST API client — events, pairings, and player data.

## Prompt

Export `BcpApiClient` class and types `BcpEvent`, `BcpPairing`.

### Types

`BcpEvent`: clean interface — id, name, startDate, endDate, city/state/country, latitude/longitude, rounds, playerCount, isTeamEvent.

`BcpPairing`: round, table, player1/player2 (each with name, faction, optional listId), player1Game/player2Game (result number + points, nullable for incomplete rounds).

Raw BCP API types (`BcpEventRaw`, `BcpPairingRaw`) are private — mapped via `mapEvent()` and `mapPairing()`.

### `BcpApiClient`

Constructor takes auth token and optional fetch function (for testing). All requests include headers: `client-id: web-app`, `env: bcp`, `content-type: application/json`, plus `authorization: Bearer {token}` for authenticated endpoints.

**`searchEvents(params)`** — `GET /v2/events` with query params: limit=40, sortKey=eventDate desc, date range, gameSystemId (WGMSzfKFYA = 40K), minRounds, minPlayers.

**`getEvent(eventId)`** — `GET /v2/events/{id}`.

**`getPairings(eventId, round)`** — `GET /v1/events/{id}/pairings` with round and pairingType=Pairing. Filters null pairings (BYEs).

### Mapping

`mapEvent` flattens nested BCP structure: `dates.start` → `startDate`, `location.city` → `city`, `status.numberOfRounds` → `rounds`, `playerCounts.total` → `playerCount`, `format.teamEvent` → `isTeamEvent`.

`mapPairing` concatenates `firstName`/`lastName`, maps null games to null (incomplete rounds).

## Dependencies

None (uses global `fetch`).

## Contracts

- Base URL: `https://newprod-api.bestcoastpairings.com`
- Game system ID: `WGMSzfKFYA` (Warhammer 40K)
- BYE pairings (no player2) are filtered out by `mapPairing` returning null
