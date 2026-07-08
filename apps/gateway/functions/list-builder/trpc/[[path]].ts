import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({
  envKey: 'LIST_BUILDER_API',
  stripPrefix: '/list-builder',
})
