# apps/versus/server/src/routers/index.ts

> Root tRPC router for the versus app — aggregates all sub-routers.

## Prompt

Write the root tRPC router for the versus app. Import `publicProcedure` and `router` from `@tabletop-tools/server-core` (not from a local trpc.ts — versus uses server-core directly since it has no extended context).

Create and export an `appRouter` that has:
1. A `health` endpoint: a public query that returns `{ status: 'ok' as const }`
2. A `simulate` namespace: import and mount `simulateRouter` from `./simulate`

Also export the `AppRouter` type (`typeof appRouter`) — this is used by the client for end-to-end type inference.

## Dependencies

- `@tabletop-tools/server-core` — `publicProcedure`, `router`
- `./simulate` — `simulateRouter`

## Contracts

- Exports: `appRouter` (tRPC router instance), `AppRouter` (type)
- Endpoints: `health` (public), `simulate.*` (protected)
