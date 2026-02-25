import type { Hono } from 'hono'

export interface BaseEnv {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  AUTH_SECRET: string
}

export function createWorkerHandler<TEnv extends BaseEnv>(opts: {
  createApp: (env: TEnv) => Promise<Hono>
}): { fetch(request: Request, env: TEnv, ctx?: unknown): Promise<Response> } {
  let cachedApp: Hono | null = null

  return {
    async fetch(request: Request, env: TEnv): Promise<Response> {
      if (!cachedApp) {
        cachedApp = await opts.createApp(env)
      }
      return cachedApp.fetch(request)
    },
  }
}
