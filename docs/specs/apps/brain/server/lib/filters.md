# apps/brain/server/src/lib/filters.ts

> Shared filtering rules — boarding actions, legends, chapter detection, ability scope, HTML stripping.

## Prompt

`isBoardingAction(text)`, `isLegends(text)` — boolean heuristics.
`detectChapterFromText(text)` — chapter detection by rule-context patterns (not flavor text).
`detectScope(text)` — bearer/unit/army/stratagem/aura.
`detectWeaponTypes(text)`, `classifyGrants(text)` — sustained hits/lethal hits/devastating wounds and re-roll extraction.
`truncate(text, len)`, `stripHtml(text)`.
