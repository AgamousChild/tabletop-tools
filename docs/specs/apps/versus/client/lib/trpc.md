# apps/versus/client/src/lib/trpc.ts

> tRPC React client for the versus app — type-safe API calls.

## Prompt

Write a tRPC client module for a React app. Add `/// <reference types="vite/client" />` at the top.

1. Import `createTRPCReact` from `@trpc/react-query` and `createTRPCLinks` from `@tabletop-tools/ui`.
2. Import the `AppRouter` type from the server: `../../../server/src/routers` (relative path — monorepo type inference, no runtime dependency).
3. Create and export `trpc = createTRPCReact<AppRouter>()`.
4. Export a `createTRPCClient()` function that returns `trpc.createClient({ links: createTRPCLinks(...) })`.

The tRPC endpoint URL is `${import.meta.env.BASE_URL}trpc` — this resolves to `/versus/trpc` in production (Vite sets `base: '/versus/'` in the config) and `/trpc` in dev.

`createTRPCLinks` from packages/ui creates an `httpBatchLink` with `credentials: 'include'` so auth cookies are sent cross-origin.

## Dependencies

- `@trpc/react-query` — `createTRPCReact`
- `@tabletop-tools/ui` — `createTRPCLinks`
- `../../../server/src/routers` — `AppRouter` (type only)

## Pattern

This exact structure is used across all 8 client apps. Only the server router import path differs.
