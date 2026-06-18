# apps/list-builder/client/src/lib/detachmentRestrictions.ts

> Parse detachment-specific army construction restrictions from ability text.

## Prompt

Write a module that parses restriction rules embedded in detachment ability descriptions. In 40K, some detachments restrict which units can be included (e.g., chapter-locked units, points caps on specific unit types).

### Types

**`DetachmentRestriction`**: `abilityName` (string), `text` (raw restriction text), `chapterName` (string | null), `type` ('chapter' | 'points_cap' | 'keyword' | 'other').

### Internal functions

**`extractRestrictionText(description: string): string | null`** — Look for the word "restriction" (case-insensitive) in the description. If found, extract everything after the header line (skip to next newline, take the rest). Return null if not found or empty.

**`parseChapterName(text: string): string | null`** — Try two patterns:
1. Bold markers: `can include **X** **Y** units` → chapter name is "X Y"
2. Plain text: `can include X units, but` → chapter name is "X"

**`classifyRestriction(text: string): type`** — Regex classification:
- Contains "cannot include" + "chapter" or "drawn from" → `'chapter'`
- Contains "combined points cost" → `'points_cap'`
- Contains "cannot select.*keyword" or "can only.*if both units share" → `'keyword'`
- Otherwise → `'other'`

### Exported functions

**`parseDetachmentRestrictions(abilities: Array<{ id, name, description }>): DetachmentRestriction[]`** — For each ability, extract restriction text, classify it, parse chapter name if applicable. Return all found restrictions.

**`formatRestrictionText(text: string): string`** — Strip markdown bold markers (`**`).

## Dependencies

None — pure string parsing.
