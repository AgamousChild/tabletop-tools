# apps/data-import/server/src/lib/sources/wahapedia.ts

> Fetches all Wahapedia CSV files, transforms to JSON with column renames and joins.

## Prompt

Wahapedia publishes game data as pipe-delimited CSVs. This module fetches 20 CSV files, parses them, and transforms into the JSON format that matches the old export-wahapedia.ts SQL query output.

**CSV file list** (constant array): Last_update, Factions, Datasheets, Datasheets_models, Datasheets_wargear, Datasheets_keywords, Datasheets_abilities, Datasheets_unit_composition, Datasheets_models_cost, Datasheets_options, Datasheets_leader, Detachments, Detachment_abilities, Stratagems, Enhancements, Abilities, Source, Datasheets_stratagems, Datasheets_enhancements, Datasheets_detachment_abilities.

**`fetchAndProcessWahapedia(previousLastUpdate?): Promise<WahapediaResult>`**:
1. Fetch `Last_update.csv` first. If its value matches `previousLastUpdate`, return `{ skipped: true }`.
2. Fetch remaining 19 CSVs in parallel using `Promise.all`.
3. Parse each with `parsePipeCsv()`.
4. Build lookup maps for joins: `sourceById` (from Source), `abilityById` (from Abilities), `firstModelByDatasheet` (first model row per datasheet, for primary stats).
5. Transform each CSV into a named JSON array with camelCase keys:
   - `factions`: `{ id, name }`
   - `detachments`: `{ id, factionId, name, legend, type }`
   - `detachment_abilities`, `stratagems`, `enhancements`, `abilities`, `unit_abilities`, `datasheet_wargear`: pass through `convertDescriptions()` to convert HTML→markdown in description fields
   - `datasheets`: JOIN to Source table for `isLegends` flag (source name contains "Warhammer Legends"), JOIN to first model for primary stats (M, T, Sv, W, Ld, OC, inv_sv)
   - `unit_abilities`: JOIN to Abilities table to resolve Core/Faction ability names and descriptions when the datasheet record has empty values
   - `datasheet_wargear`: synthesize composite ID from `datasheetId-line-lineInWargear`
   - `datasheet_models`: synthesize composite ID from `datasheetId-line`
   - Junction tables (`datasheet_stratagems`, `datasheet_enhancements`, `datasheet_detachment_abilities`): synthesize composite IDs

## Dependencies

- `../parsers/wahapedia-csv` — `parsePipeCsv`, `htmlToMarkdown`, `convertDescriptions`

## Contracts

- Base URL: `https://wahapedia.ru/wh40k10ed`
- Returns `WahapediaResult`: `{ skipped: boolean, lastUpdate: string, data: Record<string, unknown[]> }`
- Column renames: snake_case CSV headers → camelCase JSON keys
- HTML in description fields is converted to markdown via `convertDescriptions()`
