import { describe, expect, it, vi } from 'vitest'

import { createR2Storage, createNullR2Storage } from './r2'

describe('createR2Storage', () => {
  it('calls bucket.put with the correct key and content type', async () => {
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    const data = new TextEncoder().encode('fake-image-data').buffer
    await storage.upload('evidence/session-1.jpg', data, 'image/jpeg')

    expect(mockBucket.put).toHaveBeenCalledWith(
      'evidence/session-1.jpg',
      data,
      { httpMetadata: { contentType: 'image/jpeg' } },
    )
  })

  it('returns the public URL for the uploaded object', async () => {
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    const url = await storage.upload(
      'evidence/session-1.jpg',
      new ArrayBuffer(0),
      'image/jpeg',
    )
    expect(url).toBe('https://cdn.example.com/evidence/session-1.jpg')
  })

  it('throws if bucket.put fails', async () => {
    const mockBucket = { put: vi.fn().mockRejectedValue(new Error('Network error')) }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    await expect(
      storage.upload('key', new ArrayBuffer(0), 'image/jpeg'),
    ).rejects.toThrow('Network error')
  })
})

describe('createNullR2Storage', () => {
  it('returns a discarded URL', async () => {
    const storage = createNullR2Storage()
    const url = await storage.upload('test-key', new ArrayBuffer(0), 'image/jpeg')
    expect(url).toContain('null://discarded/test-key')
  })
})
