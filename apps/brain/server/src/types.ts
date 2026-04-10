export interface Env {
  BRAIN_BUCKET: R2Bucket
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
}

export interface BrainManifest {
  version: number
  updatedAt: string
  files: Record<string, string>  // filename -> sha256 hash
}
