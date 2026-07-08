import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({ envKey: 'VERSUS_API', stripPrefix: '/versus' })
