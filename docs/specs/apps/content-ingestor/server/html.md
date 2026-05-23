# apps/content-ingestor/server/src/lib/html.ts

> Article text extraction — fetch URL, strip HTML to plain text.

## Prompt

Export `fetchArticleText(url, fetchFn?)`. Fetches URL, strips boilerplate HTML (script, style, nav, header, footer blocks), removes remaining tags, decodes HTML entities (hex, decimal, named), collapses whitespace. Throws if extracted text is empty.

## Dependencies

None (uses global `fetch`).
