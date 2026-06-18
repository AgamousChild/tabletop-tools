# apps/content-ingestor/src/bcp/standings.ts

> Parse and scrape BCP standings/placings from event pages.

## Prompt

Exports: `BCPStanding`, `RawStandingRow`, `parseRecord()`, `parseStandingsFromRows()`, `parseStandingsFromText()`, `scrapeStandings()`.

Pure parsers extract placement/name/faction/W-L-D from raw table rows or text lines. `scrapeStandings(url, page)` navigates to Placings tab, scrolls extensively to stabilize lazy-loaded content (100+ scroll iterations for 200+ player events), then parses full page text.

## Dependencies

- `playwright` — `Page`
