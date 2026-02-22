import { S3Client } from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadToR2 } from './r2'

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...original,
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({}),
    })),
  }
})

const fakeClient = new S3Client({})

beforeEach(() => {
  process.env['R2_BUCKET_NAME'] = 'test-bucket'
  process.env['R2_PUBLIC_URL'] = 'https://cdn.example.com'
  vi.mocked(fakeClient.send).mockResolvedValue({} as never)
})

describe('uploadToR2', () => {
  it('sends a PutObjectCommand with the correct bucket, key, and content type', async () => {
    const data = Buffer.from('fake-image-data')
    await uploadToR2(fakeClient, 'evidence/session-1.jpg', data, 'image/jpeg')

    expect(fakeClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'evidence/session-1.jpg',
          ContentType: 'image/jpeg',
        }),
      }),
    )
  })

  it('returns the public URL for the uploaded object', async () => {
    const url = await uploadToR2(
      fakeClient,
      'evidence/session-1.jpg',
      Buffer.from('data'),
      'image/jpeg',
    )
    expect(url).toBe('https://cdn.example.com/evidence/session-1.jpg')
  })

  it('throws if the S3 send fails', async () => {
    vi.mocked(fakeClient.send).mockRejectedValueOnce(new Error('Network error'))
    await expect(uploadToR2(fakeClient, 'key', Buffer.from('data'), 'image/jpeg')).rejects.toThrow(
      'Network error',
    )
  })
})
