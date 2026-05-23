# apps/list-builder/client/src/lib/sync.ts

> Background sync — fire-and-forget server backup of IndexedDB lists.

## Prompt

Write a module with four functions for syncing army lists between client IndexedDB and the server. All server calls use the vanilla `trpcClient` (not React hooks) because these run outside the component lifecycle.

### Functions

**`syncListToServer(listId: string): void`** — Fire-and-forget. Wrap the async logic in `void (async () => { ... })()`. Load the list and its units from IndexedDB via `getList()` and `getListUnits()`. Call `trpcClient.list.sync.mutate(...)` with the full list + units payload. Catch and swallow errors — the UI must never block on server sync failures.

**`syncAllToServer(): void`** — Fire-and-forget. Load all lists via `getLists()`, load units for each, batch them into a single `trpcClient.list.syncAll.mutate({ lists: [...] })` call. Only call if there's at least one list.

**`deleteListFromServer(listId: string): void`** — Fire-and-forget. Call `trpcClient.list.delete.mutate({ id: listId })`.

**`restoreFromServer(): Promise<number>`** — NOT fire-and-forget (awaitable). Call `trpcClient.list.getAll.query()` to get all server-side lists. For each, write to IndexedDB via `createList()` and `addListUnit()` from game-data-store. Convert nullable fields (`?? undefined`) for the IndexedDB types. Return the count of lists restored.

### Key pattern

The fire-and-forget pattern is `void (async () => { try { ... } catch { /* swallow */ } })()`. The outer `void` discards the Promise. The inner try/catch prevents unhandled rejections.

## Dependencies

- `@tabletop-tools/game-data-store` — `getList`, `getListUnits`, `getLists`, `createList`, `addListUnit`
- `./trpc` — `trpcClient` (vanilla client)
