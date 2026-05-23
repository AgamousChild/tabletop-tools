# apps/no-cheat/server/src/routers/session.ts

> Dice rolling session lifecycle — start, addRoll, undoLastRoll, close, list, get, savePhoto, delete.

## Prompt

Write a tRPC router `sessionRouter` with 8 protected endpoints. This is the core of no-cheat's server logic.

**`start`:** Accept `{ diceSetId, opponentName? }`. Verify the dice set belongs to the user. Generate UUID. Insert into `diceRollingSessions`. Return created row.

**`addRoll`:** Accept `{ sessionId, pipValues: number[] (1-6, min 1 element) }`. Verify session belongs to user. Reject if session already closed (`closedAt !== null`). Insert pip values as JSON string into `rolls`. Then fetch ALL rolls for the session, flatten pip values, run `analyze(rollData)` to get running z-score. Return `{ rollCount, zScore }`.

**`undoLastRoll`:** Accept `{ sessionId }`. Verify ownership + not closed. Find the most recent roll using `ORDER BY rowid DESC LIMIT 1` (not createdAt — avoids ties). Delete it. Recompute stats from remaining rolls. Return `{ rollCount, zScore, removedPips }`.

**`close`:** Accept `{ sessionId }`. Verify ownership. Fetch all rolls, run `analyze()` for final verdict. Update session with `zScore`, `isLoaded` (boolean → integer), `closedAt`. Return `{ zScore, isLoaded, outlierFace, observedRate, rollCount }`.

**`list`:** Accept optional `{ diceSetId }`. Query sessions for user, optionally filtered by dice set. Order by createdAt desc.

**`get`:** Accept `{ sessionId }`. Verify ownership. Return session + all rolls ordered by createdAt.

**`savePhoto`:** Accept `{ sessionId, imageData (base64) }`. Verify session is closed AND `isLoaded === true` (evidence photos only for loaded dice). Decode base64 to Buffer, upload to R2 via `ctx.storage.upload(key, buffer, 'image/jpeg')`. Update session photoUrl.

**`delete`:** Accept `{ sessionId }`. Verify ownership. Delete session (FK cascade handles rolls).

### Key patterns

- Running statistics: `analyze()` is called on every `addRoll` to give the user real-time Z-score feedback
- Photo evidence: only saved for confirmed loaded dice — prevents storage abuse
- `rowid DESC` for undo: SQLite rowid is monotonically increasing, more reliable than createdAt for ordering when timestamps could tie

## Dependencies

- `@tabletop-tools/db` — `diceRollingSessions`, `diceSets`, `rolls`
- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `and`, `desc`, `eq`, `sql`
- `zod` — `z`
- `../lib/stats/analyze` — `analyze`
- `../lib/storage/r2` — `R2Storage` (type)
- `../trpc` — `protectedProcedure`, `router`
