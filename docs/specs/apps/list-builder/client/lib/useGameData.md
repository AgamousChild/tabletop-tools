# apps/list-builder/client/src/lib/useGameData.ts

> Game data hooks for list-builder — similar to versus but with list-specific additions.

## Prompt

Write wrapper hooks over `@tabletop-tools/game-data-store` for the list-builder app. Same null-guard pattern as versus, but with different hooks needed for army construction.

### Hooks

1. **`useUnits(query, enabled)`** — Wraps `usePrimaryUnitSearch(query)`. If `enabled` is false, return empty. No Legends filtering here (handled elsewhere).

2. **`useGameFactions()`** — Delegates to `usePrimaryFactions()`.

3. **`useGameDetachments(factionId)`** — Wraps `useDetachments`. Null-safe.

4. **`useGameDetachment(detachmentId)`** — Wraps `useDetachment`. Returns `{ data: null }` if empty string.

5. **`useGameDetachmentAbilities(detachmentId)`** — Wraps `useDetachmentAbilities`. Null-safe.

6. **`useGameEnhancements(detachmentId)`** — Wraps `useEnhancements`. Null-safe.

7. **`useGameUnitKeywords(datasheetId)`** — Wraps `useUnitKeywords`. Null-safe.

8. **`useUnitModelOptions(datasheetId)`** — Combines `useUnitCompositions` + `useUnitCosts`, feeds both into `parseModelOptions()` from `./modelOptions`. Returns `ModelOption[]` directly (not a hook-shaped object). Empty array if no datasheetId.

9. **`useUnitRoles()`** — Same as versus: Map of unit ID → role from `useAllDatasheets`.

10. **`useIsCharacter(unitId)`** — Returns boolean: checks if unit has the `CHARACTER` keyword (case-insensitive) via `useUnitKeywords`. Uses `useMemo`.

Also re-export `useLegendsUnitIds` from `@tabletop-tools/game-data-store`.

## Dependencies

- `react` — `useMemo`
- `@tabletop-tools/game-data-store` — all listed hooks + types
- `./modelOptions` — `parseModelOptions`
