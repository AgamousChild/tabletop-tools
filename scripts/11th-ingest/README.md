# 11th-edition ingest tooling

Tools for turning the 11th-edition source documents (Chapter Approved mission deck + core
rulebook) into a structured English reference, then into platform data.

**Data Boundary:** the source images and the translated `reference.json` live **outside the repo**
at `C:\R\sync-data\tools\11th-leak\` (leaked/unreleased GW material — local reference only). These
scripts read from / write to that folder; nothing GW-derived is committed here. Mechanics are
re-expressed in our own words.

## Pipeline

```
capture (curl)          per-page PNGs          C:\R\sync-data\tools\11th-leak\{core,mission}\
   → crop.mjs           per-card PNGs          .../crops2b/
   → translate (manual) structured English     .../reference.json   ← the single source of truth
   → emit:
        overlay.mjs           English-over-French copies of the screenshots
        ingest-*.mjs (TODO)   full-featured nodes in brain / versus / game-tracker
```

Capture isn't a script: fetch each viewer page with
`curl -sL "https://drive.google.com/viewer/img?id=<signed>&...&page=N&w=3000&webp=false" -o pNNN.png`
(`w=3000` is the max; the signed `id` is read from Playwright's network log per browsing session).

## Tools (importable modules + CLI)

| File | Exports | CLI |
|---|---|---|
| `crop.mjs` | `cropSheet({ input, cols, rows, outDir, varThreshold?, overlap? })` | `node scripts/11th-ingest/crop.mjs <png> <cols> <rows> <outDir> [varThreshold] [overlap]` |
| `overlay.mjs` | `overlayTranslation({ input, regions, output })` | `node scripts/11th-ingest/overlay.mjs <png> <regions.json> <output>` |

- **crop** slices a scanned multi-card sheet into per-card PNGs (trims the margin, divides into an
  even grid). 3×3 secondaries: `overlap 0.005`; 6-up primaries: `overlap -0.05` (expand to keep the
  right-hand VP column).
- **overlay** paints translated English panels over the French on a copy of an image.

## Planned (Workstream B — consume `reference.json`)

- `overlay-cards.mjs` / `overlay-rules.mjs` — generate the English-overlay copies for every page.
- `ingest-brain.mjs` — emit full-featured brain nodes (rules + cards) + `content_node_link` rows.
- `ingest-game-tracker.mjs` — emit `content_entity` (`type='mission'`) + `scoring_mission` rows.
- `ingest-versus.mjs` — emit combat-affecting weapon-ability / rule data for the simulator.

Each is re-runnable (idempotent): fix a translation in `reference.json`, re-run, the source updates.
