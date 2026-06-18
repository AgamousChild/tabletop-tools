# apps/bcp-scraper/server/src/lib/ttt-types.ts

> Type definitions for the Tabletop Tools structured list format (TTTPackage).

## Prompt

Two exported interfaces:

**`TTTPackage`** — the canonical parsed army list format:
- `version: 1` — schema version (literal)
- `parsedWith: string` — parser identifier (e.g. "gw-app-v1", "battlescribe-v1")
- `parseStatus: 'ok' | 'partial' | 'failed'`
- `parseError?: string`
- `meta`: name, totalPoints, edition ('10th'|'11th'), battleSize (5 options + 'unknown'), source ('bcp-import')
- `list`: factionId (slug), factionName, optional subfactionId/Name and detachmentId/Name, units array
- `exports?`: rawSource (original text)

**`TTTUnit`** — individual unit in a list:
- `name`, `role` (8 options including 'unknown'), `models` (count), `points`
- `wargear: string[]` — list of equipped items
- `enhancement?: string` — enhancement name if equipped
- `isWarlord?: boolean`

## Dependencies

None (pure types).
