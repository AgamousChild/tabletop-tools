import type { Db } from '@tabletop-tools/db'
import { initTRPC, TRPCError } from '@trpc/server'

export type User = {
  id: string
  email: string
  name: string
}

export type BaseContext = {
  user: User | null
  req: Request
  db: Db
}

const t = initTRPC.context<BaseContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})
