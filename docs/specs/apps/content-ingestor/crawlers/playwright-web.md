# apps/content-ingestor/src/crawlers/playwright-web.ts

> Fetch JS-rendered pages using Playwright headless browser via subprocess.

## Prompt

**`fetchArticleWithBrowser(url, tempDir?)`** — dynamically creates a Playwright script, writes to temp dir, spawns `node` subprocess to run it. Extracts content from `<article>`/`<main>`/`<body>` with boilerplate removal. Handles networkidle waits. Graceful fallback if Playwright unavailable.

**`crawlSiteWithBrowser(siteUrl, tempDir?)`** — same subprocess pattern, discovers same-origin links. Returns `Array<{ url, title }>`.

## Dependencies

- `child_process`, `fs`, `path`
- Playwright (runtime dependency, not imported — spawned via node subprocess)
