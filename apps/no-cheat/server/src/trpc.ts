import { type BaseContext, type User } from '@tabletop-tools/server-core'
import { initTRPC, TRPCError } from '@trpc/server'
import type { R2Storage } from './lib/storage/r2'

export type Context = BaseContext & {
  storage: R2Storage
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export type { User }
