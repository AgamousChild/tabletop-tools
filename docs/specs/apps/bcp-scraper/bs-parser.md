# apps/bcp-scraper/server/src/lib/bs-parser.ts

> BattleScribe format army list parser — structured text with +++ delimiters.

## Prompt

Export `parseBattleScribe(text: string): TTTPackage`. Parses BattleScribe's text export format which uses structured markers like `FACTION KEYWORD:`, `+ DETACHMENT:`, `TOTAL ARMY POINTS:`, etc.

### Parsing strategy

**Faction**: Extract from `FACTION KEYWORD: Name` line. Strip "Chaos - " or similar prefixes (split on " - ", take last). Slugify via `normalizeFaction()`.

**Detachment**: Extract from `+ DETACHMENT: Name` line (strip trailing `+` and parentheticals).

**Total points**: Extract from `TOTAL ARMY POINTS: NNN pts`. Infer battle size from points (≤500=CP, ≤1000=Incursion, ≤2000=Strike Force, else Onslaught).

**Warlord**: Extract from `WARLORD: Name` line (strip optional `Char#:` prefix).

**Enhancements**: Parse all `ENHANCEMENT: Name (on UnitName)` occurrences into a map.

**Units**: Regex-based extraction: `[Char#:] Nx UnitName (NNN pts)[: gear1, gear2, ...]`. For each unit:
- Parse models count, name, points, wargear list (comma-separated after colon)
- Check if unit is warlord (from wargear "Warlord" flag or name match)
- Apply enhancement from the header-level map, removing it from wargear if duplicated
- Role: warlord → Character, others → unknown

Auto-generate list name as `{FactionName} {TotalPoints}pts`.

## Dependencies

- `./ttt-types` — `TTTPackage`, `TTTUnit`
- `./faction-map` — `normalizeFaction`

## Contracts

- Returns `failed` if no FACTION KEYWORD found or no units parsed
- BattleScribe format has newlines (unlike GW App) — line-based parsing
