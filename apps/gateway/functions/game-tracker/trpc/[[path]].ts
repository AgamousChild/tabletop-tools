import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({
  envKey: 'GAME_TRACKER_API',
  stripPrefix: '/game-tracker',
})
