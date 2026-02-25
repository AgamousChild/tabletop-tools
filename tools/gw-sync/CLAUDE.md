# CLAUDE.md -- tools/gw-sync

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

A local CLI tool that scrapes the GW Warhammer Community downloads page for 40K PDFs
(core rules, balance dataslates, faction packs), downloads them, extracts text via `unpdf`,
and converts each to markdown. Runs on-demand, stores everything under `.local/gw/`.
No connection to the deployed platform -- purely a local reference tool.

---

## What It Does

1. Launches headless Chromium (via Playwright) to scrape PDF links from the GW downloads page
2. Classifies each PDF as `core-rules` or `faction-pack` based on title keywords
3. Downloads each PDF, computing SHA-256 hashes for change detection
4. Skips unchanged PDFs (hash matches stored metadata)
5. Extracts text from new/changed PDFs using `unpdf` (pdf.js wrapper)
6. Converts extracted text to markdown with formatting heuristics (ALL CAPS → headings, bullet points, page number stripping)
7. Generates `INDEX.md` organized by category (Core Rules, Faction Packs)
8. Saves metadata (per-PDF hashes, download timestamps)

---

## Architecture

```
tools/gw-sync/
  src/
    index.ts              <- CLI entry point, orchestrates scrape → download → parse → markdown
    types.ts              <- PdfEntry, PdfMetadata, SyncMetadata, SELECTORS, category keywords
    scraper.ts            <- Playwright-based GW page scraping, title cleaning, URL normalization
    scraper.test.ts
    downloader.ts         <- PDF download with SHA-256 change detection
    downloader.test.ts
    parser.ts             <- PDF text extraction (unpdf) + text-to-markdown conversion
    parser.test.ts
    metadata.ts           <- load/save metadata.json, needsUpdate hash comparison
    metadata.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

### Output Structure

```
.local/gw/
  pdfs/                   <- downloaded PDF files (safe filenames)
  markdown/
    INDEX.md              <- categorized links (Core Rules / Faction Packs)
    core-rules.md
    balance-dataslate.md
    space-marines.md
    ...
  metadata.json           <- per-PDF SHA-256 hashes, download timestamps
```

---

## Data Flow

```
GW Downloads Page (dynamic JS, Next.js)
  → scraper.ts (headless Chromium, extract PDF links + titles)
  → downloader.ts (fetch PDFs, SHA-256 change detection)
  → parser.ts (unpdf text extraction → markdown heuristics)
  → INDEX.md (categorized by core-rules / faction-pack)
```

### Key Design Decisions

- **Headless browser required**: GW's downloads page is a Next.js SPA with dynamic hydration. Simple HTTP fetches don't work -- Playwright renders the JS first.
- **SHA-256 change detection**: PDFs are re-downloaded but only re-parsed if the hash changes. Avoids unnecessary work on repeat syncs.
- **Category classification**: Titles containing keywords like "core rules", "balance dataslate", "munitorum field manual" are classified as `core-rules`; everything else is `faction-pack`.
- **Text-to-markdown heuristics**: ALL CAPS lines become `##` headings, bullet symbols become `- ` lists, standalone numbers (page numbers) are stripped. Good enough for reference, not pixel-perfect.
- **CSS selectors isolated**: `SELECTORS` const in `types.ts` makes it easy to update when GW redesigns their page.

---

## Dependencies

| Package | Purpose |
|---|---|
| playwright | Headless Chromium for scraping the GW downloads page |
| unpdf | PDF text extraction (pdf.js wrapper, no native deps) |
| tsx | TypeScript execution |

---

## Running

```bash
# From repo root
pnpm sync:gw

# Or directly
cd tools/gw-sync && pnpm start
```

Note: First run may need `npx playwright install chromium` to download the browser binary.

---

## Testing

**42 tests** across 4 test files, all passing:

| File | Tests | What it covers |
|---|---|---|
| `scraper.test.ts` | 11 | Document classification, URL normalization, title cleaning |
| `downloader.test.ts` | 11 | SHA-256 hashing, safe filenames, download with change detection, skip unchanged |
| `parser.test.ts` | 11 | Text-to-markdown conversion, ALL CAPS headings, bullet points, page numbers, INDEX generation |
| `metadata.test.ts` | 9 | Load/save metadata, needsUpdate hash comparison, updatePdfEntry |

```bash
cd tools/gw-sync && pnpm test
```
