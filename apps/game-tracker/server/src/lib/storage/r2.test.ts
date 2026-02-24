import { describe, expect, it, vi } from 'vitest'

import { createR2Storage, createNullR2Storage } from './r2'

describe('createR2Storage', () => {
  it('calls bucket.put with the correct key and content type', async () => {
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) }
    const storage = createR2Storage(mockBucket, 'https://photos.example.com')

    await storage.upload(
      'game-tracker/match-1/turn-1.jpg',
      'data:image/jpeg;base64,dGVzdA==',
    )

    expect(mockBucket.put).toHaveBeenCalledWith(
      'game-tracker/match-1/turn-1.jpg',
      expect.any(ArrayBuffer),
      { httpMetadata: { contentType: 'image/jpeg' } },
    )
  })

  it('returns the public URL for the uploaded object', async () => {
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) }
    const storage = createR2Storage(mockBucket, 'https://photos.example.com')

    const url = await storage.upload(
      'game-tracker/match-1/turn-1.jpg',
      'data:image/jpeg;base64,dGVzdA==',
    )
    expect(url).toBe('https://photos.example.com/game-tracker/match-1/turn-1.jpg')
  })

  it('correctly decodes base64 data from data URL', async () => {
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) }
    const storage = createR2Storage(mockBucket, 'https://photos.example.com')

    // 'dGVzdA==' is base64 for 'test'
    await storage.upload('key.jpg', 'data:image/jpeg;base64,dGVzdA==')

    const putCall = mockBucket.put.mock.calls[0]
    const buffer = putCall[1] as ArrayBuffer
    const decoded = new TextDecoder().decode(buffer)
    expect(decoded).toBe('test')
  })

  it('throws if bucket.put fails', async () => {
    const mockBucket = { put: vi.fn().mockRejectedValue(new Error('Network error')) }
    const storage = createR2Storage(mockBucket, 'https://photos.example.com')

    await expect(
      storage.upload('key.jpg', 'data:image/jpeg;base64,dGVzdA=='),
    ).rejects.toThrow('Network error')
  })
})

describe('createNullR2Storage', () => {
  it('returns null (no R2 configured)', async () => {
    const storage = createNullR2Storage()
    const result = await storage.upload('match-1/turn-1.jpg', 'data:image/jpeg;base64,abc')
    expect(result).toBeNull()
  })

  it('does not throw', async () => {
    const storage = createNullR2Storage()
    await expect(storage.upload('any-key', 'any-data')).resolves.not.toThrow()
  })
})
