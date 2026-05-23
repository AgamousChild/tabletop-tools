# apps/new-meta/server/src/trpc.ts

> Local tRPC init with extended context + `adminProcedure`.

## Prompt

Define `Context = BaseContext & { adminEmails: string[] }`. Create local `t = initTRPC.context<Context>().create()`.

Export three procedure levels:
1. **`publicProcedure`** — no auth required (meta queries are public)
2. **`protectedProcedure`** — requires authenticated user (auth guard middleware)
3. **`adminProcedure`** — extends `protectedProcedure` with a middleware that checks `ctx.adminEmails.includes(ctx.user.email)`. Throws FORBIDDEN if not admin.

Re-export `router`, `publicProcedure`, `createCallerFactory` from `t`. Re-export `User` type from server-core.

### Key difference from tournament/versus

new-meta needs `adminProcedure` for import endpoints, but also serves public meta queries without auth. So it exports all three procedure levels.
