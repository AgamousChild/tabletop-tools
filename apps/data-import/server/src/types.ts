export interface Env {
  GAME_DATA_BUCKET: R2Bucket
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
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
  files: string[]
}
