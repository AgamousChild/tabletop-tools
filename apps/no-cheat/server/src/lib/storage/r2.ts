/**
 * R2 storage interface for evidence photos.
 * In production, uses Cloudflare Workers R2 bucket binding.
 * In dev/test, uses null storage (photos discarded with warning).
 */
export interface R2Storage {
  upload(key: string, data: ArrayBuffer, contentType: string): Promise<string>
  delete(key: string): Promise<void>
}

/**
 * Create R2 storage backed by a Workers R2 bucket binding.
 * The bucket is provided by the Worker environment (`env.EVIDENCE_BUCKET`).
 */
export function createR2Storage(
  bucket: {
    put(
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType: string } },
    ): Promise<unknown>
    delete(key: string): Promise<unknown>
  },
  publicUrl: string,
): R2Storage {
  return {
    async upload(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } })
      return `${publicUrl}/${key}`
    },
    async delete(key) {
      // Fail loud: let bucket.delete() errors propagate to the caller so a
      // failed R2 delete is surfaced, not swallowed.
      await bucket.delete(key)
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
    async delete(key) {
      console.warn(`[R2 null] Evidence photo delete no-op: ${key}`)
    },
  }
}

/**
 * Recover the R2 object key from a URL previously returned by `R2Storage#upload`.
 * Upload returns `${publicUrl}/${key}` (real storage) or `null://discarded/${key}`
 * (null storage) -- both are `<scheme>://<host>/<key>`, so the key is always
 * everything after the third `/`. This reverses that mapping so delete paths
 * can pass the key straight to `R2Storage#delete` without a separate key
 * column, and without callers needing to know which `publicUrl` was used to
 * construct it (dev/prod use different hosts).
 * Returns null for input that isn't a `scheme://host/key`-shaped URL (e.g.
 * null/empty, or something unrelated) so callers can skip deletion safely.
 */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+\/(.+)$/.exec(url)
  return match ? match[1]! : null
}
