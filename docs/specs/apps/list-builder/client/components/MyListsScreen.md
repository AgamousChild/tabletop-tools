# apps/list-builder/client/src/components/MyListsScreen.tsx

> Shows all saved army lists with delete and tournament-select actions.

## Prompt

Write a component that displays the user's saved army lists from IndexedDB.

### Props

`onCreateNew: () => void`, `onSelectList: (list: LocalList) => void`

### Data

Use `useLists()` from game-data-store to get all lists and a `refetch` function.

### Tournament list feature

Track which list is the "tournament list" in `localStorage` under key `'tournament-list'`. Store `{ listId, name, faction, detachment, totalPts }`. Read on mount with `useState` lazy initializer. A `setTournamentList(list)` helper writes to localStorage.

### Layout

1. Header "My Army Lists" with instructional text
2. Empty state: "No lists yet" message
3. List of cards, each showing:
   - List name (bold), faction + detachment subtitle, description (truncated to 2 lines)
   - Points total
   - "Use in Tournament" button — sets this list as the active tournament list, highlights the card border in amber
   - Delete button — calls `deleteList(id)` from game-data-store + `deleteListFromServer(id)`, then `refetch()`
   - Click anywhere else on the card → `onSelectList(list)`
4. "+ New List" button at the bottom → `onCreateNew()`

Active tournament list card gets `border-amber-400/50` instead of `border-slate-800`.

## Dependencies

- `react` — `useState`
- `@tabletop-tools/game-data-store` — `useLists`, `deleteList`, `LocalList` (type)
- `../lib/sync` — `deleteListFromServer`
