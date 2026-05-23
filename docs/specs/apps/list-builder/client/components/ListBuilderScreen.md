# apps/list-builder/client/src/components/ListBuilderScreen.tsx

> Top-level orchestrator — manages screen navigation through the list building wizard.

## Prompt

Write a multi-screen navigation component that manages the list building flow. Uses a discriminated union `Screen` type to track which screen is active.

### Screen states

```typescript
type Screen =
  | { type: 'my-lists' }
  | { type: 'battle-size' }
  | { type: 'faction-detachment'; battleSize: BattleSize }
  | { type: 'unit-selection'; listId: string; faction: string; detachment: string; battleSize: BattleSize }
```

### Props

`onSignOut: () => void`

### Flow

1. **My Lists** → shows all existing lists, "New List" button
2. **Battle Size** → pick from 500/1000/2000/3000
3. **Faction + Detachment** → pick faction then detachment
4. **Unit Selection** → add/remove units from the list

On "New List": go to battle-size screen. On existing list tap: reconstruct the `BattleSize` from the stored `list.battleSize` (or default to 2000pts) using a lookup map, go straight to unit-selection.

On faction+detachment select: create the list in IndexedDB via `createListInDb()` with auto-generated name like "{faction} {points}pts", sync to server via `syncListToServer(id)`, navigate to unit-selection.

### Header

App title "List Builder" with home link, plus three action buttons:
- **Sync** — calls `syncAllToServer()`, shows "Synced!" for 2 seconds
- **Restore** — calls `restoreFromServer()`, shows "Restored N lists" for 3 seconds
- **Sign out** — calls `authClient.signOut()` then `onSignOut()`

Each sync/restore button has a `HelpTip` tooltip explaining what it does.

### ID generation

Local `generateId()`: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

## Dependencies

- `react` — `useState`, `useCallback`
- `@tabletop-tools/ui` — `HelpTip`
- `@tabletop-tools/game-data-store` — `createList`, `useLists`, `LocalList` (type)
- `./MyListsScreen`, `./BattleSizeScreen`, `./FactionDetachmentScreen`, `./UnitSelectionScreen`
- `../lib/armyRules` — `BattleSize` (type)
- `../lib/sync` — `syncListToServer`, `syncAllToServer`, `restoreFromServer`
- `../lib/auth` — `authClient`
