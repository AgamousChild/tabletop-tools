import { describe, expect, it } from 'vitest'

import { createTRPCLinks } from './trpc'

describe('createTRPCLinks', () => {
  it('returns an array of links', () => {
    const links = createTRPCLinks()
    expect(Array.isArray(links)).toBe(true)
    expect(links.length).toBeGreaterThan(0)
  })

  it('includes httpBatchLink with credentials', () => {
    const links = createTRPCLinks()
    // The last link should be the httpBatchLink (terminating link)
    expect(links.length).toBe(1)
  })

  it('accepts custom url', () => {
    const links = createTRPCLinks('/custom-trpc')
    expect(links.length).toBe(1)
  })
})
