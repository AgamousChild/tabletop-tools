# apps/versus/server/src/routers/simulate.ts

> tRPC router for saving and retrieving combat simulation results.

## Prompt

Write a tRPC router called `simulateRouter` for the versus combat simulator. The simulation itself runs client-side — this router only handles persistence of results. All endpoints are protected (require authenticated user).

Import `protectedProcedure` and `router` from `@tabletop-tools/server-core`. Import the `simulations` table from `@tabletop-tools/db`. Use Zod for input validation and drizzle-orm query helpers (`eq`, `and`, `desc`).

### Zod schemas

Define a `simResultSchema` inline (not exported) with these fields:
- `expectedWounds: z.number()`
- `expectedModelsRemoved: z.number()`
- `survivors: z.number()`
- `worstCase: z.object({ wounds: z.number(), modelsRemoved: z.number() })`
- `bestCase: z.object({ wounds: z.number(), modelsRemoved: z.number() })`

### Endpoints

**`save` (mutation):** Accept `attackerId`, `attackerName`, `defenderId`, `defenderName` (all strings), `result` (simResultSchema), and optional `weaponConfig` and `configHash` strings. Generate an ID with `crypto.randomUUID()`. Insert into the `simulations` table with `userId` from `ctx.user.id`, the result serialized as JSON, and `createdAt` as `Date.now()`. Return `{ id }`.

**`history` (query):** Select all simulations where `userId` matches the current user, ordered by `createdAt` descending.

**`delete` (mutation):** Accept `{ id: string }`. First verify the simulation exists AND belongs to the current user (use `and(eq(id), eq(userId))`). If not found, throw `TRPCError` with code `NOT_FOUND`. Otherwise delete it and return `{ success: true }`.

**`lookup` (query):** Accept `{ configHash: string }`. Look up a cached simulation by its config hash (limit 1, using `.get()`). If not found return `null`. If found, return `{ id, result: JSON.parse(cached.result), weaponConfig, createdAt }`. Cast the parsed result using `z.infer<typeof simResultSchema>`.

### Key patterns

- The `simulations` table stores `result` and `weaponConfig` as JSON strings — serialize on write, parse on read.
- `configHash` enables cache lookup — same weapon + rules configuration returns a cached result.
- Content IDs (`attackerContentId`, `defenderContentId`) are references to game data in IndexedDB, NOT foreign keys in the database.
- User ownership is enforced on delete — users can only delete their own simulations.

## Dependencies

- `@trpc/server` — `TRPCError`
- `@tabletop-tools/db` — `simulations`
- `drizzle-orm` — `and`, `desc`, `eq`
- `zod` — `z`
- `@tabletop-tools/server-core` — `protectedProcedure`, `router`

## Contracts

- All endpoints require authentication (protectedProcedure)
- `ctx.db` is a Drizzle database instance
- `ctx.user.id` is the authenticated user's ID
- Turso table: `simulations` (see docs/schema-turso.md)
