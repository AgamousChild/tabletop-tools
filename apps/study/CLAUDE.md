# CLAUDE.md — study

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

Personal-use slide-search interface. Takes a folder of `.pptx` decks, indexes the text on
every slide, and serves a single-page app where the user types a search query and sees
matching slides with a highlight box drawn over the matched text region.

Not auth-gated. Lives at `/study/` on the gateway origin.

---

## Architecture

```
+---------------------------+
|  Tier 1: React Client     |
|  - Search box             |
|  - MiniSearch over text   |
|  - Results list           |
|  - Slide viewer w/ box    |
|  - Loads /data/slides.json|
+---------------------------+
```

No server, no Turso, no Vectorize, no R2. All data lives as static assets in the SPA's
`dist/` (`/study/data/slides.json` + `/study/data/pages/<deck>/slide-<N>.png`).

---

## Build pipeline

`apps/study/client/scripts/build-slides.mjs` runs locally (needs LibreOffice installed):

1. Walks `$STUDY_SRC_DIR` (default `C:/Users/micah/OneDrive/Documents/Psy`) for `*.pptx`
2. Converts each via `soffice --headless --convert-to pdf` to a temp dir
3. Extracts per-block `{ text, leftPct, topPct, widthPct, heightPct }` from the PDF via
   `unpdf` (pdf.js text content + transform matrices)
4. Renders each page to PNG at 2x scale via `pdf-to-img`
5. Emits `public/data/slides.json` + `public/data/pages/<deck>/slide-<N>.png`

Run via `pnpm slides:build`. Re-run any time the source `.pptx` files change.
Output bundles into the SPA dist via Vite's normal public/ handling.

---

## SPA

Vite + React + minisearch. Single `App.tsx` with three pieces:

- `SearchBar` — typed query
- `ResultsList` — top hits grouped by slide (first matched block per slide)
- `SlideViewer` — full slide image with absolutely-positioned `<div class="highlight">`
  drawn at the matched block's percentage coordinates

`base: '/study/'` so all asset URLs resolve correctly on the gateway origin.

---

## Deploy

Same flow as every other gateway-hosted SPA:

```bash
cd apps/study/client && pnpm slides:build   # only when source decks change
bash apps/gateway/build.sh                   # builds + validates all 10 apps
bash scripts/deploy-gateway.sh               # full deploy
```

Live at `https://tabletop-tools.net/study/`.

---

## No tests

Single-screen personal-use app. Build script is exploratory by design. If the data shape
solidifies, add unit tests for `lib/search.ts` and a snapshot test for the slide viewer.
