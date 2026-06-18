# apps/versus/client/src/lib/useGameData.ts

> Thin wrapper hooks over `@tabletop-tools/game-data-store` for the versus app.

## Prompt

Write a set of React hooks that wrap the raw hooks from `@tabletop-tools/game-data-store` with null-safety and versus-specific filtering logic. Each hook follows the same pattern: if the required parameter is null/undefined, return `{ data: [], isLoading: false }` immediately instead of calling the underlying hook with an empty string.

### Hooks to implement

1. **`useUnits(query, showLegends?)`** — Wraps `usePrimaryUnitSearch(query)`. If no faction is selected, return empty. If `showLegends` is false (default), filter out any unit whose ID appears in the `useLegendsUnitIds()` Set. Use `useMemo` for the filtering.

2. **`useGameFactions()`** — Delegates to `usePrimaryFactions()`.

3. **`useGameUnit(id)`** — Wraps `usePrimaryUnit(id)`. Null-safe: if `id` is null, return `{ data: null, isLoading: false }`.

4. **`useGameLeaderAttachments(leaderId)`** — Wraps `useLeaderAttachments`. Null-safe.

5. **`useGameLeadersForUnit(unitId)`** — Wraps `useLeadersForUnit`. Null-safe.

6. **`useGameUnitAbilities(datasheetId)`** — Wraps `useUnitAbilities`. Null-safe.

7. **`useGameUnitCompositions(datasheetId)`** — Wraps `useUnitCompositions`. Null-safe.

8. **`useGameUnitCosts(datasheetId)`** — Wraps `useUnitCosts`. Null-safe. Type the empty array as `UnitCost[]`.

9. **`useGameUnitKeywords(datasheetId)`** — Wraps `useUnitKeywords`. Null-safe.

10. **`useGameWargearOptions(datasheetId)`** — Wraps `useWargearOptions`. Null-safe.

11. **`useGameDatasheetWeapons(datasheetId)`** — Delegates to `useWargearAsWeapons(datasheetId)`.

12. **`useGameDatasheetModels(datasheetId)`** — Wraps `useDatasheetModels`. Null-safe. Type empty as `DatasheetModel[]`.

13. **`useGameDetachments(factionName)`** — Wraps `useDetachments`. Null-safe.

14. **`useGameDetachmentAbilities(detachmentId)`** — Wraps `useDetachmentAbilities`. Null-safe.

15. **`useGameEnhancements(detachmentId)`** — Wraps `useEnhancements`. Null-safe.

16. **`useGameStratagems(factionId, detachmentId)`** — Wraps `useStratagems({ factionId, detachmentId })`. Null-safe on factionId.

17. **`useUnitRoles()`** — Calls `useAllDatasheets()` and returns a `Map<string, string>` of unit ID → role string. Use `useMemo` to only rebuild when datasheets change.

### Why this wrapper exists

The raw game-data-store hooks accept non-null strings and always query IndexedDB. These wrappers add null-guards so components can pass `selectedUnitId` (which is `string | null`) without conditional hook calls (which violate React's rules of hooks).

## Dependencies

- `react` — `useMemo`
- `@tabletop-tools/game-data-store` — all hooks listed above + types `DatasheetModel`, `Detachment`, `DetachmentAbility`, `Enhancement`, `Stratagem`, `UnitCost`
