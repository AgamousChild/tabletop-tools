# apps/content-ingestor/src/bcp/army-list.ts

> Scrape army list text from BCP player detail pages.

## Prompt

**`parseArmyListFromText(raw)`** — pure normalizer: strips extra whitespace.

**`scrapeArmyList(playerUrl, page)`** — tries 3 DOM strategies to find list text: container by class, textarea, or "Army List" label sibling. Returns null if not found.

## Dependencies

- `playwright` — `Page`
