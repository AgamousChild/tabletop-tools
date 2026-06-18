# apps/list-builder/server/src/routers/rating.ts

> Unit rating lookup — read-only access to precomputed meta ratings.

## Prompt

Write a tRPC router `ratingRouter` with two protected endpoints:

**`get({ unitId: string })`** — Query the `unitRatings` table for a single unit by `unitContentId`. Order by `computedAt` descending, limit 1 (get latest rating). Return the row or null.

**`alternatives({ metaWindow?: string })`** — Query all unit ratings, optionally filtered by `metaWindow`. Order by `winContrib` descending (best units first). If `metaWindow` is provided, add `eq(unitRatings.metaWindow, input.metaWindow)` to the where clause. Use `and(...conditions)` only if conditions array is non-empty, otherwise pass `undefined`.

Both endpoints use `protectedProcedure` from server-core. Use drizzle-orm `eq`, `desc`, `and` for queries.

## Dependencies

- `drizzle-orm` — `eq`, `desc`, `and`
- `zod` — `z`
- `@tabletop-tools/db` — `unitRatings`
- `@tabletop-tools/server-core` — `protectedProcedure`, `router`

## Turso table

`unit_ratings` — see docs/schema-turso.md
