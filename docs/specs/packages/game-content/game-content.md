# packages/game-content/src/ — Game Content Package

> Adapters for loading game data from multiple sources at runtime.

## types.ts
`WeaponProfile`: range, attacks, skill, strength, AP, damage + abilities[]. `UnitProfile`: name, faction, stats, weapons[], keywords[]. `GameContentAdapter` interface: load(), getUnit(), searchUnits(), listFactions(). Tournament import types: `TournamentPlayer`, `TournamentRecord`, `TournamentImportFormat`.

## adapters/bsdata/parser.ts
`parseBSDataXml(xml, faction)` — stack-based XML parser for BSData `.cat` catalog files. Extracts depth-0 `<selectionEntry>` elements. `stripNestedSelectionEntries()` removes nested blocks before weapon extraction. Top-level `type="model"` entries kept (standalone characters). Flat elements (`<profile>`, `<characteristic>`) use regex. Returns `{ units, errors }`. Exports `PARSER_VERSION` constant for client cache invalidation.

## adapters/bsdata/loader.ts
`BSDataAdapter` class — reads `.cat`/`.gst` files from disk. `load()` parses all files via `parseBSDataXml`, builds in-memory unitIndex Map. getUnit/searchUnits/listFactions query this index.

## adapters/null/index.ts
`NullAdapter` — no-op implementation returning empty results. Used when BSDATA_DIR not set.

## adapters/tournament-import/
`TournamentImportAdapter.parse(raw, format)` — delegates to format-specific parsers:
- `bcp-csv/parser.ts` — BCP CSV (flexible column order, placement-based mapping)
- `generic-csv/parser.ts` — platform-defined CSV (multiple events, per-unit data)
- `tabletop-admiral-csv/parser.ts` — Tabletop Admiral CSV (rank-based)

## index.ts
Barrel export. Note: data-import client imports `parseBSDataXml` directly from parser.ts (not barrel) to avoid pulling Node APIs into browser builds.
