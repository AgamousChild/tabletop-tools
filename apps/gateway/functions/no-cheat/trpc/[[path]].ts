import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({ envKey: 'NO_CHEAT_API', stripPrefix: '/no-cheat' })
