export interface Env {
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
  ANTHROPIC_API_KEY?: string
  BUILD_VERSION?: string
}

export interface BrainManifest {
  version: number
  updatedAt: string
  files: Record<string, string>  // filename -> sha256 hash
}
