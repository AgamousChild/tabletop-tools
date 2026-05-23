# apps/bcp-scraper/server/src/lib/gw-parser.ts

> GW App format army list parser — extracts faction, detachment, units, wargear.

## Prompt

Export `parseGwApp(text: string): TTTPackage`. Parses the GW (Games Workshop) official app's list export format.

### Parsing strategy

GW App exports have NO newlines — everything is concatenated. The structure is:
`[ListName](TotalPoints)[Faction][Detachment?][BattleSize(Points)][ROLE_HEADER][Unit(Points)•wargear...][Unit(Points)...]`

**Step 1 — Name/points**: Find first `(NNN)` or `(NNN Points)` pattern. Text before it is the list name.

**Step 2 — Preamble**: Text between name and first role header. Parse in order:
- Faction: match against `FACTION_NAMES` array (longest names first to avoid partial matches)
- Battle size: match `Strike Force (2000 Points)` etc. with regex
- Subfaction: match against `SUBFACTION_NAMES` (Space Marine chapters, CSM warbands, etc.)
- Detachment: whatever remains after stripping the above

**Step 3 — Units**: Split at role headers (`CHARACTERS`, `OTHER DATASHEETS`, `BATTLELINE`, `DEDICATED TRANSPORTS`, `FORTIFICATIONS`, `ALLIED UNITS`). Within each section, find all `(NNN Points)` anchors. For each anchor, scan backwards to find the unit name start using `findNameStart()`.

**`findNameStart(beforeParen)`**: The key insight is that without newlines, wargear text runs directly into unit names (e.g. `"bolterGrand Master"`). The boundary is a lowercase-to-uppercase transition without a space. Find the LAST such transition.

**`parseUnitBody(name, points, role, body)`**: Split body on bullet chars (• and ◦). Extract: wargear items (`Nx GearName` patterns), enhancement (`Enhancements: Name`), warlord flag.

### Faction and subfaction handling

`FACTION_NAMES`: 28 canonical faction names. `SUBFACTION_NAMES`: 22 subfaction names (chapters, warbands). `ROLE_HEADERS` with `ROLE_MAP` mapping to `TTTUnit['role']`.

`factionToSlug()` uses `normalizeFaction()` from faction-map with fallback to simple slugification.

## Dependencies

- `./ttt-types` — `TTTPackage`, `TTTUnit`
- `./faction-map` — `normalizeFaction`

## Contracts

- Returns `parseStatus: 'ok'` if units found and detachment identified
- Returns `parseStatus: 'partial'` if units found but no detachment
- Returns `parseStatus: 'failed'` if no name/points or no units found
- `rawSource` preserved in `exports`
