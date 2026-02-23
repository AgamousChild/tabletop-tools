import { describe, expect, it } from 'vitest'

import { createNullR2Storage } from './r2'

describe('NullR2Storage', () => {
  it('upload returns null (no R2 configured)', async () => {
    const storage = createNullR2Storage()
    const result = await storage.upload('match-1/turn-1.jpg', 'data:image/jpeg;base64,abc')
    expect(result).toBeNull()
  })

  it('upload does not throw', async () => {
    const storage = createNullR2Storage()
    await expect(storage.upload('any-key', 'any-data')).resolves.not.toThrow()
  })
})
