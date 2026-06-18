# apps/list-builder/server/src/index.ts

> Dev server entry point on port 3003. Same pattern as versus.

## Prompt

Load `dotenv/config`. Create DB with fallback to `file:./dev.db`. Call `startDevServer` on port 3003 with `createServer(db, secret)`.
