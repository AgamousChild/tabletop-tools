# apps/content-ingestor/src/cults3d/ — Cults3D Scraper Scripts

> Playwright-based scripts for scraping 3D model data from Cults3D and Warhammer Community.

## Scripts

### login.ts
Interactive login session. Launches persistent headless=false browser, navigates to home, waits 10 minutes for manual login, saves session to `.local/cults3d/browser-state2`.

### scrape-downloads.ts
Scrape all downloaded 3D models from orders pages with pagination (up to 100 pages). Extracts order number, date, name, price, designer links. Deduplicates by URL, outputs JSON with free/paid summary.

### scrape-models.ts
Two-phase scraper: Phase 1 collects all model URLs from orders pagination (cached to `urls.json`). Phase 2 scrapes each model page (name, thumbnail, description, designer, status). `guessGWUnit()` matches against 145+ faction/unit keyword aliases. Resumable via `models.json`. Exports `guessGWUnit`, `UrlEntry`, `ModelEntry`.

### scrape-tags.ts
Augment `models.json` with tags and categories from model pages. Extracts TAGS and CATEGORIES sections via regex. Saves updated models after each scrape.

### check-csv.ts / check-page.ts / download-csvs.ts / explore.ts
Diagnostic/exploration scripts for understanding Cults3D page structure: inspect form elements, extract table rows, download monthly CSV exports, explore navigation links.

### scrape-whc.ts
Search Warhammer Community for 11th edition / terrain / 40K articles. Runs 4 searches, collects article links with title/date/snippet, deduplicates, filters for relevance, saves to `articles.json`.

### scrape-whc-articles.ts
Download full text and images from curated Warhammer Community article URLs. Extracts title/date/body text (first 10K chars), downloads images (>200px, non-logo), takes full-page screenshots.

## batch-goonhammer.ts (parent directory)
Batch process Goonhammer 40K articles into brain-ready drafts. Loads filtered article list, fetches with Playwright, extracts via content-ingestor pipeline, deduplicates against existing brain nodes.

## Dependencies

All scripts use: `playwright` (persistent browser context), `fs`, `path`.
