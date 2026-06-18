# apps/bcp-scraper/server/src/lib/detachment-map.ts

> Extract detachment name from army list text — BattleScribe and GW App formats.

## Prompt

Export `extractDetachment(listText: string, factionSlug: string): string | null`.

Two extraction strategies:

**Strategy 1 — BattleScribe**: Match `DETACHMENT:\s*(.+)` regex. Strip trailing `+`. Slugify.

**Strategy 2 — GW App**: No explicit marker. The detachment appears on line 2 or 3 of the text (before the battle size line). Check if lines[2] or lines[3] starts with a battle size keyword ("incursion", "strike force", "onslaught", "combat patrol"). If so, the line before it is the detachment.

Helper: `toSlug(name)` — strip parentheticals, lowercase, spaces to hyphens. `isBattleSizeLine(line)` — checks against `BATTLE_SIZE_KEYWORDS`.

## Dependencies

None (pure function).
