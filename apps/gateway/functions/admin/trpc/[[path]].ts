import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({ envKey: 'ADMIN_API', stripPrefix: '/admin' })
