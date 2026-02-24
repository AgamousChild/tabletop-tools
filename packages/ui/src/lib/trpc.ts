import { httpBatchLink } from '@trpc/client'

export function createTRPCLinks(url = '/trpc') {
  return [
    httpBatchLink({
      url,
      fetch(input, opts) {
        return fetch(input, { ...opts, credentials: 'include' })
      },
    }),
  ]
}
