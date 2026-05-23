# apps/new-meta/server/src/lib/detachment.ts

> Best-effort detachment extraction from pasted army list text.

## Prompt

Write a function that tries to extract the detachment name from free-text army lists. Lists are pasted by users in various formats (BattleScribe, New Recruit, hand-typed).

### Patterns (tried in order)

1. `+ DETACHMENT: <name>` or `DETACHMENT: <name>` (BattleScribe header)
2. `Detachment: <name>` (New Recruit format)
3. `-- <name> Detachment --` (some BattleScribe variants)

### Function

**`extractDetachment(listText: string): string | null`** — Match each regex pattern against the list text (case-insensitive, multiline). Return the trimmed capture group from the first match. Return null if no pattern matches.

## Dependencies

None — pure regex.
