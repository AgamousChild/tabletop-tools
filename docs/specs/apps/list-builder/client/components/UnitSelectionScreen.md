# apps/list-builder/client/src/components/UnitSelectionScreen.tsx

> The main army building screen — search units, add to list, validate, export.

## Prompt

Write the core list building screen. This is the most complex component in list-builder (~400 lines). The user searches and adds units to their army list, with live validation and meta ratings.

### Props

`listId`, `faction`, `detachment` (strings), `battleSize: BattleSize`, `onDone()`, `onBack()`

### Data sources

- `useList(listId)` from game-data-store — the list + its units from IndexedDB
- `useUnits({ faction, name: searchQuery }, true)` — filtered unit search
- `useGameEnhancements(detachment)` — enhancements for this detachment
- `useGameDetachmentAbilities(detachment)` — for restriction parsing
- `useLegendsUnitIds()` — for legends filtering
- `useUnitRoles()` — Map<id, role> for duplicate validation
- `trpc.rating.get.useQuery({ unitId })` — meta rating for each unit (displayed as RatingBadge)

### Key features

1. **Unit search**: Text input filters units by name within the selected faction
2. **Model count picker**: When a unit has multiple size options (e.g., 5 or 10 models), show buttons for each option with `{modelCount}m/{points}pts`. Uses `useUnitModelOptions(unitId)`. Disables options that would exceed remaining points.
3. **Add unit**: Creates a `LocalListUnit` in IndexedDB via `addListUnitInDb()`, updates list totals via `updateListInDb()`, triggers `syncListToServer(listId)`.
4. **Remove unit**: Removes from IndexedDB via `removeListUnitInDb()`, updates totals, syncs.
5. **Warlord toggle**: Only available for CHARACTER units (checked via `useIsCharacter` or keyword lookup). Calls `updateListUnitInDb()`.
6. **Enhancement assignment**: Characters can receive enhancements from the detachment's enhancement list. Show enhancement picker, update unit.
7. **Inline editing**: List name and description are editable inline (click to toggle edit mode).
8. **Validation**: Run `validateArmy()` on every change, display errors prominently.
9. **Detachment restrictions**: Parse restrictions from detachment abilities via `parseDetachmentRestrictions()`, display them prominently.
10. **Export**: Generate a text format army list (faction, detachment, total points, then each unit with points), copy to clipboard, show confirmation.
11. **Rating badges**: Each unit in the list shows a `<RatingBadge>` with its meta rating from the server.
12. **Delete list**: Button to delete the entire list from IndexedDB and server.

### Sub-components defined inline

**`ModelCountPicker`** — Shows Add button for single-option units, or multiple buttons for multi-option units. Each button shows `{count}m/{pts}pts`.

**`UnitKeywordBadges`** — Shows CHARACTER/LEGEND badges for a unit.

### ID generation

Local `generateId()`: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

## Dependencies

- `react` — `useState`, `useMemo`, `useRef`, `useEffect`
- `@tabletop-tools/ui` — `htmlToText`, `CollapsibleSection`
- `@tabletop-tools/game-data-store` — `addListUnit`, `removeListUnit`, `updateListUnit`, `updateList`, `deleteList`, `useList`, `useUnit`, `LocalListUnit`, `Enhancement` (types)
- `../lib/detachmentRestrictions` — `parseDetachmentRestrictions`, `formatRestrictionText`, `DetachmentRestriction` (type)
- `../lib/trpc` — `trpc`, `trpcClient`
- `../lib/useGameData` — multiple hooks
- `../lib/armyRules` — `validateArmy`, `BattleSize`, `ValidationError` (types)
- `../lib/sync` — `syncListToServer`, `deleteListFromServer`
- `./RatingBadge` — `RatingBadge`
