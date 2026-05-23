# apps/bcp-scraper/server/src/lib/faction-map.ts

> BCP faction name → slug mapping with subfaction parentage.

## Prompt

Two exports:

**`normalizeFaction(bcpFaction: string): string`** — lookup in `BCP_FACTION_TO_SLUG` constant map. Returns empty string if not found. The map covers ~60 entries: canonical names ("Adepta Sororitas" → "adepta-sororitas"), plus aliases for Space Marine chapters ("Ultramarines" → "space-marines"), CSM warbands ("Alpha Legion" → "chaos-space-marines"), Tyranid hive fleets, T'au septs, Ork klans, etc.

**`getSubfactionParent(slug: string): string | undefined`** — lookup in `SUBFACTION_PARENT` map. Returns the parent faction slug for subfactions that are actually parent factions in the data model (e.g. "blood-angels" → "space-marines").

## Dependencies

None (pure data + lookups).
