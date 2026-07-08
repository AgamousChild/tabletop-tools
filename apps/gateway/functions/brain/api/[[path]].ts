import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({ envKey: 'BRAIN_API', stripPrefix: '/brain/api' })
