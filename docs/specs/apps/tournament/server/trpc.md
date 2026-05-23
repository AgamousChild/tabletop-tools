# apps/tournament/server/src/trpc.ts

> Pure re-export from server-core — tournament has no extended context.

## Prompt

Re-export `User` (type), `BaseContext as Context` (type alias), `router`, `publicProcedure`, `protectedProcedure`, `createCallerFactory` from `@tabletop-tools/server-core`.

This is a passthrough file. Tournament doesn't need extended context (no R2 storage, no admin emails). But it still has a local trpc.ts for consistency and so routers import from `../trpc` uniformly.
