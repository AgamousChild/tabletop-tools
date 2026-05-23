# apps/game-tracker/server/src/index.ts

> Dev server entry point on port 3004. Uses NullR2Storage since R2 isn't available locally.

## Prompt

Same as versus dev entry. Load `dotenv/config`, create DB, call `startDevServer` on port 3004. Pass `createNullR2Storage()` as the storage argument to `createServer`.
