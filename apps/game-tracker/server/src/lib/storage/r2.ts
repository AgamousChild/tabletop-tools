export type R2Storage = {
  /**
   * Upload a photo data URL to storage.
   * Returns the stored URL (R2 public URL or similar), or null if no storage is configured.
   */
  upload(key: string, dataUrl: string): Promise<string | null>
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

/**
 * Create R2 storage from environment variables.
 * Falls back to NullR2Storage if R2 is not configured.
 *
 * In production, configure:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */
export function createR2StorageFromEnv(): R2Storage {
  // R2 upload requires @aws-sdk/client-s3 with Cloudflare R2 endpoint.
  // That dependency is added when the deployment is configured (Phase 9).
  // For now, fall back to null storage in all environments.
  return createNullR2Storage()
}
