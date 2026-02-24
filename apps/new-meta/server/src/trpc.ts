import {
  type BaseContext,
  type User,
  router,
  publicProcedure,
  createCallerFactory,
} from '@tabletop-tools/server-core'
import { initTRPC, TRPCError } from '@trpc/server'

export type Context = BaseContext & {
  adminEmails: string[]
}

const t = initTRPC.context<Context>().create()

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.adminEmails.includes(ctx.user.email)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return next({ ctx })
})

export { type User, router, publicProcedure, createCallerFactory }
