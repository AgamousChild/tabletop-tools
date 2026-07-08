import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({
  envKey: 'TOURNAMENT_API',
  stripPrefix: '/tournament',
})
