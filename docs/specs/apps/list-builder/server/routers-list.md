# apps/list-builder/server/src/routers/list.ts

> Server-side backup of army lists stored primarily in client IndexedDB.

## Prompt

Write a tRPC router `listRouter` for syncing army lists from client to server. The client's IndexedDB is the primary store — this server table is a backup. All endpoints are protected.

### Zod schemas

**`unitSchema`**: `id`, `unitContentId`, `unitName` (strings), `unitPoints`, `count` (numbers), optional `modelCount` (number), `isWarlord` (boolean), `enhancementId`, `enhancementName` (strings), `enhancementCost` (number).

**`listSyncSchema`**: `id`, `faction`, `name` (strings), optional `description`, `detachment` (strings), `battleSize` (number), `totalPts` (number), `units` (array of unitSchema).

### Endpoints

**`sync` (mutation):** Upsert a single list. Use Drizzle's `.onConflictDoUpdate({ target: lists.id, set: {...} })` to handle both create and update. After upserting the list, delete all existing `listUnits` for that list ID, then bulk-insert the new units. Convert `isWarlord` boolean to integer (0/1) for SQLite. Use `generateId()` from server-core if `unit.id` is falsy. Set `syncedAt`, `createdAt`, `updatedAt` to `Date.now()` — only `createdAt` is set on conflict insert, not on update.

**`syncAll` (mutation):** Same as `sync` but accepts `{ lists: listSyncSchema[] }` and loops over each list. Same upsert + delete-and-reinsert pattern per list.

**`getAll` (query):** Select all lists for the current user. For each list, select its units from `listUnits`. Convert `isWarlord` integer back to boolean (`u.isWarlord === 1`). Return array of lists with nested `units` arrays.

**`delete` (mutation):** Delete a list by ID, but only if `userId` matches the current user (use `and(eq(lists.id, input.id), eq(lists.userId, ctx.user.id))`). Cascade deletes `listUnits` automatically via DB FK. Return `{ success: true }`.

### Key patterns

- `null` coercion: optional fields use `?? null` when inserting to SQLite
- Boolean → integer: `isWarlord ? 1 : 0` on write, `=== 1` on read
- Delete-and-reinsert for units: simpler than diffing, and lists are small

## Dependencies

- `drizzle-orm` — `eq`, `and`
- `zod` — `z`
- `@tabletop-tools/db` — `lists`, `listUnits`
- `@tabletop-tools/server-core` — `protectedProcedure`, `router`, `generateId`
