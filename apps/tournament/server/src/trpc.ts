import { type BaseContext, type User } from '@tabletop-tools/server-core'
import { initTRPC, TRPCError } from '@trpc/server'

/**
 * `environment` is 'production' only when the Worker's ENVIRONMENT var is
 * explicitly set to 'production' (see worker.ts). Defaults to 'development'
 * everywhere else (local dev, tests) so dev/test tooling keeps working.
 */
export type Context = BaseContext & { environment: string }

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export { type User }
