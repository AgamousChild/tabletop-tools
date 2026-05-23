# apps/content-ingestor/src/drafts/manifest.ts

> Track crawl entry processing state and avoid reprocessing URLs.

## Prompt

**`loadManifest(dir)`** — read `manifest.json` from directory, return `CrawlManifest` or null.

**`saveManifest(manifest, dir)`** — write `manifest.json` to directory.

**`getUnprocessedEntries(manifest)`** — filter entries where `processedAt` is undefined.

**`markEntryProcessed(manifest, url, relevant, nodeCount)`** — find entry by URL, set processedAt, relevant flag, and nodeCount.

## Dependencies

- `fs`, `path`
- `../types` — `CrawlManifest`
