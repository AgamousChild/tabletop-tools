import { beforeEach, describe, expect, it, vi } from 'vitest'

import { brainFetch, parseAvailableEditions, withEdition } from './api'

describe('lib/api', () => {
  describe('withEdition', () => {
    it('appends edition to a bare path', () => {
      expect(withEdition('/search', '11th')).toBe('/search?edition=11th')
    })

    it('merges into an existing query string', () => {
      const result = withEdition('/browse/nodes?layer=core&page=2', '10th')
      expect(result).toContain('layer=core')
      expect(result).toContain('page=2')
      expect(result).toContain('edition=10th')
    })

    it('overwrites a pre-existing edition param', () => {
      const result = withEdition('/foo?edition=9th', '11th')
      expect(result).toContain('edition=11th')
      expect(result).not.toContain('edition=9th')
    })

    it('returns the path unchanged when edition is undefined', () => {
      expect(withEdition('/version', undefined)).toBe('/version')
    })
  })

  describe('parseAvailableEditions', () => {
    it('returns empty for null', () => {
      expect(parseAvailableEditions(null)).toEqual([])
    })

    it('parses a single edition', () => {
      expect(parseAvailableEditions('10th')).toEqual(['10th'])
    })

    it('parses comma-separated editions and strips whitespace', () => {
      expect(parseAvailableEditions('11th, 10th, 9th')).toEqual(['11th', '10th', '9th'])
    })

    it('filters out garbage values', () => {
      expect(parseAvailableEditions('10th,garbage,11th')).toEqual(['10th', '11th'])
    })
  })

  describe('brainFetch', () => {
    beforeEach(() => {
      // @ts-expect-error stub global
      global.fetch = vi.fn().mockResolvedValue({ ok: true })
    })

    it('appends ?edition= to relative paths', async () => {
      await brainFetch('/search', { edition: '11th' })
      // @ts-expect-error mock
      const calledWith = (global.fetch as any).mock.calls[0][0]
      expect(calledWith).toContain('/search')
      expect(calledWith).toContain('edition=11th')
    })

    it('uses a single-arg fetch call when init is empty (back-compat)', async () => {
      await brainFetch('/browse/layers')
      // @ts-expect-error mock
      expect((global.fetch as any).mock.calls[0]).toHaveLength(1)
    })

    it('forwards init when non-empty', async () => {
      await brainFetch('/ask', {
        method: 'POST',
        body: JSON.stringify({ q: 'hi' }),
        edition: '11th',
      })
      // @ts-expect-error mock
      const init = (global.fetch as any).mock.calls[0][1]
      expect(init.method).toBe('POST')
      // edition is stripped before being passed as fetch init.
      expect(init.edition).toBeUndefined()
    })
  })
})
