# apps/game-tracker/server/src/routers/turn.ts

> Turn tracking — per-round data with V3 per-player fields, photos, and stratagem log.

## Prompt

Write a tRPC router `turnRouter` with two endpoints. Both protected.

### Zod schemas

`unitLostSchema`: `{ contentId: string, name: string }`

### `add` (mutation)

Large input schema with `matchId` and `turnNumber` required, plus:
- Legacy fields: `yourUnitsLost`, `theirUnitsLost` (arrays of unitLostSchema), `primaryScored`, `secondaryScored`, `cpSpent` (integers)
- V3 per-player fields (all optional): `yourCpStart`, `yourCpGained`, `yourCpSpent`, `theirCpStart`, `theirCpGained`, `theirCpSpent`, `yourPrimary`, `theirPrimary`, `yourSecondary`, `theirSecondary`
- Photos: `photoDataUrl`, `yourPhotoDataUrl`, `theirPhotoDataUrl` (optional base64 data URLs)
- `yourUnitsDestroyed`, `theirUnitsDestroyed` (optional JSON strings)
- `stratagems` (optional array of `{ player: 'YOUR'|'THEIRS', stratagemName, cpCost }`)
- `notes` (optional string)

Processing:
1. Verify match belongs to user
2. Upload photos via `ctx.storage.upload(key, dataUrl)` — key format: `{matchId}/turn-{turnNumber}-{timestamp}.jpg`. NullR2Storage returns null, which is fine.
3. Insert turn row with all fields. JSON-serialize `yourUnitsLost` and `theirUnitsLost`. Default V3 fields to sensible values (cpGained defaults to 1, others to 0).
4. If `stratagems` provided, insert each into `stratagemLog` table.
5. Return the created turn row.

### `update` (mutation)

Accept `turnId` plus optional overrides for any turn field (notes, primary/secondary scores, CP, units destroyed). Verify the turn's match belongs to the user (two-step lookup: turn → match → userId check). Build a partial update object only including provided fields. Return the updated turn.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `and`, `eq`
- `zod` — `z`
- `@tabletop-tools/db` — `matches`, `turns`, `stratagemLog`
- `../trpc` — `protectedProcedure`, `router`
