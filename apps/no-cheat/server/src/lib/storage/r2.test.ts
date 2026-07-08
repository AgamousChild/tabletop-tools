import { describe, expect, it, vi } from 'vitest'

import { createNullR2Storage, createR2Storage, keyFromUrl } from './r2'

describe('createR2Storage', () => {
  it('calls bucket.put with the correct key and content type', async () => {
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    const data = new TextEncoder().encode('fake-image-data').buffer
    await storage.upload('evidence/session-1.jpg', data, 'image/jpeg')

    expect(mockBucket.put).toHaveBeenCalledWith('evidence/session-1.jpg', data, {
      httpMetadata: { contentType: 'image/jpeg' },
    })
  })

  it('returns the public URL for the uploaded object', async () => {
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    const url = await storage.upload('evidence/session-1.jpg', new ArrayBuffer(0), 'image/jpeg')
    expect(url).toBe('https://cdn.example.com/evidence/session-1.jpg')
  })

  it('throws if bucket.put fails', async () => {
    const mockBucket = {
      put: vi.fn().mockRejectedValue(new Error('Network error')),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    await expect(storage.upload('key', new ArrayBuffer(0), 'image/jpeg')).rejects.toThrow(
      'Network error',
    )
  })
})

describe('createNullR2Storage', () => {
  it('returns a discarded URL', async () => {
    const storage = createNullR2Storage()
    const url = await storage.upload('test-key', new ArrayBuffer(0), 'image/jpeg')
    expect(url).toContain('null://discarded/test-key')
  })

  it('delete is a no-op that does not throw', async () => {
    const storage = createNullR2Storage()
    await expect(storage.delete('test-key')).resolves.toBeUndefined()
  })
})

describe('createR2Storage delete', () => {
  it('calls bucket.delete with the correct key', async () => {
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    await storage.delete('evidence/session-1.jpg')

    expect(mockBucket.delete).toHaveBeenCalledWith('evidence/session-1.jpg')
  })

  it('propagates errors from bucket.delete (fail loud)', async () => {
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockRejectedValue(new Error('R2 delete failed')),
    }
    const storage = createR2Storage(mockBucket, 'https://cdn.example.com')

    await expect(storage.delete('evidence/session-1.jpg')).rejects.toThrow('R2 delete failed')
  })
})

describe('keyFromUrl', () => {
  it('extracts the object key from a public R2 URL', () => {
    const key = keyFromUrl('https://cdn.example.com/evidence/session-1.jpg')
    expect(key).toBe('evidence/session-1.jpg')
  })

  it('extracts the object key from a null-storage discarded URL', () => {
    const key = keyFromUrl('null://discarded/training/set-1/abc.png')
    expect(key).toBe('training/set-1/abc.png')
  })

  it('extracts a multi-segment key regardless of host', () => {
    const key = keyFromUrl('https://unrelated.example.com/training-frames/set-1/frame.png')
    expect(key).toBe('training-frames/set-1/frame.png')
  })

  it('returns null for a bare host with no path', () => {
    expect(keyFromUrl('https://cdn.example.com')).toBeNull()
  })

  it('returns null for null/empty input', () => {
    expect(keyFromUrl(null)).toBeNull()
    expect(keyFromUrl('')).toBeNull()
  })
})
