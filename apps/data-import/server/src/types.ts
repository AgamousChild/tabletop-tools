export interface Env {
  GAME_DATA_BUCKET: R2Bucket
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
  GITHUB_TOKEN?: string
  // Optional — when present, sync also writes content_entity rows + canonical R2 docs
  TURSO_DB_URL?: string
  TURSO_AUTH_TOKEN?: string
}

export interface Manifest {
  version: number
  updatedAt: string
  wahapedia?: {
    lastUpdate: string
    recordCounts: Record<string, number>
  }
  bsdata?: {
    commitSha: string
    unitCount: number
    factionCount: number
  }
  missions?: {
    count: number
  }
  mfm?: {
    commitSha: string
    factionCount: number
    unitCount: number
    detachmentCount: number
    /**
     * MFM units (keyed by faction-slug + name) that did not resolve to a
     * BSData datasheet id. Non-zero is the smoke signal that name drift or a
     * new MFM faction landed between syncs.
     */
    unmappedUnitCount: number
  }
  files: string[]
}
