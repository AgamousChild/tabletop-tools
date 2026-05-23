# packages/game-data-store/src/ — Game Data Store Package

> IndexedDB store with React hooks for client-side game data and army lists.

## store.ts
IndexedDB "tabletop-tools-game-data" DB version 9 with 22 object stores: units, lists, list_units, detachments, detachment_abilities, stratagems, enhancements, leader_attachments, unit_compositions, unit_costs, wargear_options, unit_keywords, unit_abilities, datasheets, datasheet_wargear, datasheet_models, missions, abilities, datasheet_stratagems, datasheet_enhancements, datasheet_detachment_abilities, meta, settings.

CRUD exports: `saveUnits`, `getUnit`, `searchUnits`, `listFactions`, `clearAll`, `clearFaction`, `setImportMeta`, `getImportMeta` + 20+ save/get/list functions for rules stores + list CRUD (`createList`, `getLists`, `updateList`, `deleteList`, `addListUnit`, etc.) + settings (`getIncludeLegends`, `setIncludeLegends`).

Types: `ImportMeta` (lastImport, factions, totalUnits, commitSha, parserVersion), `RulesImportMeta` (lastImport, per-category counts), `LocalList`, `LocalListUnit`.

## hooks.ts
React hooks wrapping store functions. `useStoreQuery` helper manages `{ data, error, isLoading }` state. 25+ hooks: `useUnit`, `useUnitSearch`, `useFactions`, `useGameDataAvailable`, `useLists`, `useList`, `useDetachments`, `useStratagems`, `useEnhancements`, etc. + `convertWargearToWeapons()`. All safe — no throw, returns default on IndexedDB failure.

## index.ts
Barrel export of store + hooks + types.
