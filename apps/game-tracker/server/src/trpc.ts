import { initTRPC, TRPCError } from '@trpc/server'
import type { Db } from '@tabletop-tools/db'
import type { R2Storage } from './lib/storage/r2'

export type User = {
  id: string
  email: string
  name: string
}

export type Context = {
  user: User | null
  req: Request
  db: Db
  storage: R2Storage
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
