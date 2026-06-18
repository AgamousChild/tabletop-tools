import type { Manifest } from '../../types'

/**
 * Missions are sourced from Wahapedia's mission data.
 * The Wahapedia CSV export includes mission information in its data.
 *
 * For Chapter Approved / GW PDF missions, these need to be processed
 * locally and uploaded to R2 manually (PDFs change only quarterly and
 * cross-origin fetch is blocked by CORS).
 *
 * This stub returns skipped=true since missions come through the
 * Wahapedia pipeline. It can be extended later for PDF processing.
 */
export interface MissionsResult {
  skipped: boolean
  missions: Array<{ id: string; name: string; type: string; description: string }>
}

export async function fetchAndProcessMissions(_existing: Manifest | null): Promise<MissionsResult> {
  // Missions currently come through Wahapedia data pipeline.
  // PDF extraction for Chapter Approved can be added later.
  return { skipped: true, missions: [] }
}
