export interface Env {
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
  ANTHROPIC_API_KEY?: string
  GEMINI_API_KEY?: string
  BUILD_VERSION?: string
  /**
   * Default edition filter when a caller doesn't pass ?edition=.
   * Accepted: '11th' | '10th' | '9th' | 'any'. Unset → 'any' (preserves
   * historical behaviour; flip to '11th' once 11e coverage is good enough).
   */
  BRAIN_DEFAULT_EDITION?: string
}

export interface BrainManifest {
  version: number
  updatedAt: string
  files: Record<string, string> // filename -> sha256 hash
}
