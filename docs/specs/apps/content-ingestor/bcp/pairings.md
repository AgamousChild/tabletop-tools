# apps/content-ingestor/src/bcp/pairings.ts

> Parse and scrape BCP pairings data from event pages.

## Prompt

Exports: `BCPPairing`, `parsePairingsFromText()`, `scrapeAllPairings()`, `calculateRecords()`.

`parsePairingsFromText()` — pure parser scans text for "Win/Loss/Draw: XX" patterns, backtracks for player name/faction/table.

`scrapeAllPairings(eventUrl, page, maxRounds)` — navigates each round URL, scrolls to stabilize, calls parser.

`calculateRecords(pairings)` — tallies W/L/D per player from pairing results.

## Dependencies

- `playwright` — `Page`
