import {
  type BaseContext,
  type User,
  router,
  publicProcedure,
  protectedProcedure,
  createCallerFactory,
} from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { initTRPC } from '@trpc/server'

export type Context = BaseContext & {
  adminEmails: string[]
}

const t = initTRPC.context<Context>().create()

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  if (!ctx.adminEmails.includes(ctx.user.email)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export { type User, router, publicProcedure, protectedProcedure, createCallerFactory }
