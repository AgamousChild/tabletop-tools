# apps/new-meta/server/src/server.ts

> Factory with extended context — injects `adminEmails` array.

## Prompt

Export `createServer(db, adminEmails, secret)` calling `createBaseServer<Context>({ router: appRouter, db, secret, extendContext: (ctx) => ({ ...ctx, adminEmails }) })`.
