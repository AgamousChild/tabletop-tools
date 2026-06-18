# apps/data-import/client/src/lib/wahapedia.ts

> Client-side Wahapedia rules import — fetches local JSON files and saves to IndexedDB with ID re-keying.

## Prompt

Legacy client-side import path that fetches pre-exported Wahapedia JSON from the app's static `public/wahapedia/` directory and saves to IndexedDB. Performs ID mapping against BSData units already in IndexedDB. This was the original import path before the server-side sync pipeline; kept as an alternative for local development.

### ID Mapping (private functions)

**`normalizeName(name)`** — same algorithm as server-side: lowercase, normalize apostrophes, strip special chars, collapse whitespace.

**`buildIdMapping(datasheets, factions)`** — async because it loads BSData units from IndexedDB via `searchUnits({})`. Builds normalized name lookup, matches Wahapedia datasheets to BSData units, disambiguates by faction when multiple matches exist.

**`rekeyRecords(records, idMap)`** — re-key `datasheetId` field using the ID map.

**`rekeyFactionIds(records, factionCodeToName)`** — replace Wahapedia faction short codes with full BSData faction names.

**`rekeyLeaderAttachments(records, idMap)`** — re-key both `leaderId` and `attachedId`.

### `importWahapediaRules(onProgress): Promise<RulesImportResult>`

20-step sequential import process:
1. Fetch `factions.json` from static directory
2. Fetch `datasheets.json`
3. Build ID mapping against IndexedDB BSData units
4-13. Import 10 data files (detachments through unit_abilities) — each fetched, re-keyed (faction IDs for faction-scoped files, datasheet IDs for unit-scoped files, special handling for leader attachments), and saved to IndexedDB
14-15. Weapon profiles and model stats
16-17. Missions and global abilities
18-20. Junction tables (datasheet_stratagems, datasheet_enhancements, datasheet_detachment_abilities)

After all steps, writes `RulesImportMeta` with per-category counts.

Reports progress via callback at each step with step number, total, and label.

### `isWahapediaAvailable(): Promise<boolean>`

HEAD request to `factions.json` to check if static Wahapedia data exists.

## Dependencies

- `@tabletop-tools/game-data-store` — 17 save functions + searchUnits + setRulesImportMeta + types

## Contracts

- Base URL: `${import.meta.env.BASE_URL}wahapedia` (Vite static serving)
- `RulesImportResult`: `{ counts, errors, idMappingStats? }`
- `RulesImportProgress`: `{ current, total, currentStep }`
- All 20 steps individually try/caught — partial import succeeds
- TOTAL_STEPS constant = 20
