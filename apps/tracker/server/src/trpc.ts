import { initTRPC, TRPCError } from '@trpc/server'
import type { Db } from '@tabletop-tools/db'

export type User = {
  id: string
  email: string
  name: string
}

export type Context = {
  user: User | null
  req: Request
  db: Db
}

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
