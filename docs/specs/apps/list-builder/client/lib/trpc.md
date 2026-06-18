# apps/list-builder/client/src/lib/trpc.ts

> tRPC client — same as versus, plus a vanilla client for imperative (non-hook) calls.

## Prompt

Write the tRPC client module. Same as versus (`createTRPCReact<AppRouter>()` + `createTRPCClient()` factory), but also export a **vanilla tRPC client** for imperative calls from event handlers (not hooks):

```typescript
export const trpcClient = createVanillaClient<AppRouter>({
  links: createTRPCLinks(`${import.meta.env.BASE_URL}trpc`),
})
```

Import `createTRPCClient as createVanillaClient` from `@trpc/client` (renamed to avoid collision with the local factory function).

The vanilla client is used by `sync.ts` for fire-and-forget background syncs that happen outside React component lifecycle.

## Dependencies

- `@trpc/react-query` — `createTRPCReact`
- `@trpc/client` — `createTRPCClient` (as `createVanillaClient`)
- `@tabletop-tools/ui` — `createTRPCLinks`
- `../../../server/src/routers` — `AppRouter` (type)
