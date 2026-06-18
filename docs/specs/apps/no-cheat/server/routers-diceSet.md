# apps/no-cheat/server/src/routers/diceSet.ts

> CRUD for named dice sets — users create/name/delete their dice sets.

## Prompt

Write a tRPC router `diceSetRouter` with three protected endpoints.

**`create`:** Accept `{ name: string (1-100 chars) }`. Generate UUID. Insert into `diceSets` with userId + name + createdAt. Return the created row.

**`list`:** Select all dice sets for the current user, ordered by createdAt descending.

**`delete`:** Accept `{ id: string }`. Verify the dice set belongs to the user (AND condition). Throw NOT_FOUND if not found. Delete the row. Cascade will handle sessions and rolls.

## Dependencies

- `@trpc/server` — `TRPCError`
- `@tabletop-tools/db` — `diceSets`
- `drizzle-orm` — `and`, `desc`, `eq`
- `zod` — `z`
- `../trpc` — `protectedProcedure`, `router`
