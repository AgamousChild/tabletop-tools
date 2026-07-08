import { createProxyHandler } from '../../_lib/proxy'

export const onRequest = createProxyHandler({
  envKey: 'DATA_IMPORT_API',
  stripPrefix: '/data-import/api',
})
