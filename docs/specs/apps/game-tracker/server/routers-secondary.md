# apps/game-tracker/server/src/routers/secondary.ts

> Secondary objective tracking — set, score, list, remove.

## Prompt

Write a tRPC router `secondaryRouter` with four protected endpoints for managing secondary objectives during a match.

**`set` (mutation):** Accept `{ matchId, player: 'YOUR'|'THEIRS', secondaryName }`. Verify match ownership. Insert into `matchSecondaries` with `vpPerRound: '[]'` (empty JSON array — no points scored yet). Return the created row.

**`score` (mutation):** Accept `{ secondaryId, roundNumber: 1-5, vp: int >= 0 }`. Look up the secondary, verify match ownership (secondary → match → userId check). Parse `vpPerRound` from JSON, extend array to 5 elements (pad with 0), set `vpArr[roundNumber - 1] = vp`, write back as JSON. Return updated row.

**`list` (query):** Accept `{ matchId }`. Verify match ownership. Return all `matchSecondaries` for the match.

**`remove` (mutation):** Accept `{ secondaryId }`. Look up secondary, verify match ownership, delete the row.

### Key pattern

Every endpoint verifies match ownership: look up the secondary's `matchId`, then check `matches.userId === ctx.user.id`. This two-step pattern prevents users from accessing other users' data.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `and`, `eq`
- `zod` — `z`
- `@tabletop-tools/db` — `matches`, `matchSecondaries`
- `../trpc` — `protectedProcedure`, `router`
