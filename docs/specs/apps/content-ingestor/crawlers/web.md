# apps/content-ingestor/src/crawlers/web.ts

> Crawl websites to discover articles and extract article content.

## Prompt

Two exports:

**`crawlSite(siteUrl)`** — fetch page, parse with cheerio, find all same-origin links with meaningful paths (not anchors, not assets), deduplicate by canonical URL. Return `Array<{ url, title }>`.

**`fetchArticle(url)`** — fetch page, extract title (prefer `<h1>`, fallback to `<title>`), remove boilerplate elements (nav, footer, aside, header, ads), extract text from `<article>` or `<main>` or `<body>` (priority order). Collapse whitespace. Return `{ title, content }`.

## Dependencies

- `cheerio` — HTML parsing
