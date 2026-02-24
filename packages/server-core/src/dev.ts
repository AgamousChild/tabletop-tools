import { serve } from '@hono/node-server'
import type { Hono } from 'hono'

export function startDevServer(opts: {
  port: number
  createApp: () => Promise<Hono>
}): void {
  opts.createApp().then((app) => {
    serve({ fetch: app.fetch, port: opts.port }, (info) => {
      console.log(`Server running on http://localhost:${info.port}`)
    })
  })
}
