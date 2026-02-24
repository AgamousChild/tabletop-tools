export type R2Storage = {
  /**
   * Upload a photo data URL to storage.
   * Returns the stored URL (R2 public URL or similar), or null if no storage is configured.
   */
  upload(key: string, dataUrl: string): Promise<string | null>
}

/**
 * Create R2 storage backed by a Workers R2 bucket binding.
 * The bucket is provided by the Worker environment (`env.PHOTOS_BUCKET`).
 */
export function createR2Storage(
  bucket: { put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown> },
  publicUrl: string,
): R2Storage {
  return {
    async upload(key: string, dataUrl: string): Promise<string> {
      // Extract base64 data from data URL
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      await bucket.put(key, bytes.buffer, {
        httpMetadata: { contentType: 'image/jpeg' },
      })
      return `${publicUrl}/${key}`
    },
  }
}

/**
 * No-op storage — used in development and tests when R2 is not configured.
 * Photos are accepted but discarded; photo_url is stored as null.
 */
export function createNullR2Storage(): R2Storage {
  return {
    async upload(_key: string, _dataUrl: string): Promise<null> {
      return null
    },
  }
}
