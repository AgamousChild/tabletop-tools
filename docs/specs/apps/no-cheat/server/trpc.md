# apps/no-cheat/server/src/trpc.ts

> Local tRPC init with extended context — identical to game-tracker's trpc.ts.

## Prompt

Define `Context = BaseContext & { storage: R2Storage }`. Create local `t = initTRPC.context<Context>().create()`. Export `router`, `publicProcedure`, `createCallerFactory`, `protectedProcedure` (with UNAUTHORIZED guard). Re-export `User` type.
