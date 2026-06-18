# apps/admin/server/src/trpc.ts

> Local tRPC init with extended context — `adminProcedure` checks email allowlist.

## Prompt

Define `Context = BaseContext & { adminEmails: string[]; bcpScraper?; contentIngestor? }`. Create local `t = initTRPC.context<Context>().create()`.

Export `adminProcedure` — a single middleware that checks BOTH auth (user exists) AND admin access (email in allowlist). Unlike new-meta which chains `protectedProcedure → adminProcedure`, admin's `adminProcedure` does both checks in one middleware.

Re-export `router`, `publicProcedure`, `protectedProcedure`, `createCallerFactory` from server-core. Re-export `User` type.
