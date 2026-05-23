# apps/content-ingestor/src/bcp/event-list.ts

> Scrape BCP event listings with date-windowed pagination.

## Prompt

Exports: `BCPEvent`, `BCPSearchConfig`, `BCP_SEARCH_URL`, `buildSearchUrl()`, `generateMonthlyWindows()`, `scrapeEventListWindowed()`, `scrapeEventList()`, `saveEventList()`, `loadEventList()`.

`scrapeEventListWindowed()` splits date range into monthly windows to bypass BCP's result cap, scrapes each independently, deduplicates by event ID. Handles "Load More" button pagination within each window.

`scrapeEventList()` is the simpler single-page scraper (no windowing).

`saveEventList/loadEventList` — JSON file persistence.

## Dependencies

- `playwright` — `Browser`, `Page`
- `fs`, `path`
