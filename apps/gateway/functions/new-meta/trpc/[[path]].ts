import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({ envKey: 'NEW_META_API', stripPrefix: '/new-meta' })
