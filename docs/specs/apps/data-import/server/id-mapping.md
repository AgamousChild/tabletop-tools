# apps/data-import/server/src/lib/id-mapping.ts

> Server-side ID mapping between Wahapedia and BSData unit identifiers.

## Prompt

Wahapedia and BSData use different ID schemes for the same units. This module maps Wahapedia's numeric datasheet IDs to BSData's stable hex GUIDs using fuzzy name matching. Ported from the client-side version but adapted to accept BSData units directly (not from IndexedDB).

**`normalizeName(name: string): string`** — lowercase, normalize curly/prime apostrophes to straight quotes, strip non-word chars except spaces/hyphens/apostrophes, collapse whitespace, trim.

**`buildIdMapping(datasheets, factions, bsdataUnits): IdMappingResult`** — takes Wahapedia datasheets (with `id`, `name`, `factionId`), Wahapedia factions (with `id`, `name`), and BSData units (with `id`, `name`, `faction`). Builds a `Map<wahapediaId, bsdataId>` by normalized name matching. For ambiguous matches (same name in multiple factions), disambiguate by comparing the Wahapedia faction name (looked up via factionId) against BSData faction name. Falls back to first candidate if no faction match. Also returns `factionCodeToName` map (Wahapedia faction code → full name) and match stats.

**`rekeyRecords(records, idMap, field='datasheetId')`** — generic re-keyer: for each record, if the specified field has a mapping in idMap, replace it. Records without mappings are kept unchanged.

**`rekeyFactionIds(records, factionCodeToName)`** — replace `factionId` field from Wahapedia short codes ("AC") to full BSData names ("Adeptus Custodes").

**`rekeyLeaderAttachments(records, idMap)`** — special case: re-key both `leaderId` and `attachedId` fields (both are datasheet IDs).

**`rekeyAllWahapediaFiles(data, idMap, factionCodeToName)`** — orchestrator that applies the right re-keying to each file type. Three categories:
1. `factionIdFiles` (factions, detachments, stratagems, etc.) — get faction code re-keying
2. `datasheetIdFiles` (unit_compositions, unit_costs, etc.) — get datasheetId re-keying
3. `leader_attachments` — special handler for dual-field re-keying
4. `datasheets` — gets both: the `id` field itself is re-keyed, plus factionId

## Dependencies

None (pure functions).

## Contracts

- All functions are exported (used by sync.ts and tested directly)
- `IdMappingResult`: `{ map, factionCodeToName, matched, unmatched }`
- Records without mappings pass through unchanged (no data loss)
- normalizeName handles Unicode apostrophe variants (U+2018, U+2019, U+2032)
