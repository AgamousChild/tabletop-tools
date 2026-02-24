/**
 * R2 storage interface for evidence photos.
 * In production, uses Cloudflare Workers R2 bucket binding.
 * In dev/test, uses null storage (photos discarded with warning).
 */
export interface R2Storage {
  upload(key: string, data: ArrayBuffer, contentType: string): Promise<string>
}

/**
 * Create R2 storage backed by a Workers R2 bucket binding.
 * The bucket is provided by the Worker environment (`env.EVIDENCE_BUCKET`).
 */
export function createR2Storage(
  bucket: { put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown> },
  publicUrl: string,
): R2Storage {
  return {
    async upload(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } })
      return `${publicUrl}/${key}`
    },
  }
}

/**
 * No-op storage for dev/test when R2 is not configured.
 */
export function createNullR2Storage(): R2Storage {
  return {
    async upload(key) {
      console.warn(`[R2 null] Evidence photo discarded: ${key}`)
      return `null://discarded/${key}`
    },
  }
}
