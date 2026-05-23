/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-game-data.md — IndexedDB game data schema
 */
import type { Manifest } from '../types'
import { fetchAndProcessWahapedia } from './sources/wahapedia'
import { fetchAndProcessBSData } from './sources/bsdata'
import { buildIdMapping, rekeyAllWahapediaFiles } from './id-mapping'
import { fetchAndProcessMissions } from './sources/missions'

export interface SyncResult {
  success: boolean
  manifest: Manifest
  errors: string[]
  skipped: string[]
}

async function readManifest(bucket: R2Bucket): Promise<Manifest | null> {
  const obj = await bucket.get('manifest.json')
  if (!obj) return null
  return obj.json() as Promise<Manifest>
}

async function writeManifest(bucket: R2Bucket, manifest: Manifest): Promise<void> {
  await bucket.put('manifest.json', JSON.stringify(manifest))
}

async function writeDataFile(bucket: R2Bucket, filename: string, data: unknown): Promise<void> {
  await bucket.put(`data/${filename}`, JSON.stringify(data))
}

export async function runSync(bucket: R2Bucket, githubToken?: string, force = false): Promise<SyncResult> {
  const errors: string[] = []
  const skipped: string[] = []
  const existing = await readManifest(bucket)
  const files = new Set<string>(existing?.files ?? [])

  // 1. Wahapedia
  let wahapediaData: Record<string, unknown[]> | null = null
  let wahapediaMeta: Manifest['wahapedia'] = existing?.wahapedia
  try {
    const result = await fetchAndProcessWahapedia(force ? undefined : existing?.wahapedia?.lastUpdate)
    if (result.skipped) {
      skipped.push('wahapedia (unchanged)')
    } else {
      wahapediaData = result.data
      wahapediaMeta = {
        lastUpdate: result.lastUpdate,
        recordCounts: {},
      }
      for (const [name, records] of Object.entries(result.data)) {
        wahapediaMeta.recordCounts[name] = records.length
      }
    }
  } catch (err) {
    errors.push(`Wahapedia: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. BSData
  let bsdataUnits: Array<{ id: string; name: string; faction: string }> = []
  let bsdataMeta: Manifest['bsdata'] = existing?.bsdata
  try {
    const result = await fetchAndProcessBSData(force ? undefined : existing?.bsdata?.commitSha, undefined, undefined, githubToken)
    if (result.skipped) {
      skipped.push('bsdata (unchanged)')
    } else {
      // Extract only the fields needed for ID mapping
      bsdataUnits = result.units.map(u => ({ id: u.id, name: u.name, faction: u.faction }))
      bsdataMeta = {
        commitSha: result.commitSha,
        unitCount: result.units.length,
        factionCount: new Set(result.units.map(u => u.faction)).size,
      }
      await writeDataFile(bucket, 'bsdata-units.json', result.units)
      files.add('bsdata-units.json')
    }
  } catch (err) {
    errors.push(`BSData: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. ID mapping + write Wahapedia files (if either source changed)
  if (wahapediaData) {
    try {
      // If we don't have fresh BSData, load from R2
      if (bsdataUnits.length === 0) {
        const obj = await bucket.get('data/bsdata-units.json')
        if (obj) {
          const stored = await obj.json() as Array<{ id: string; name: string; faction: string }>
          bsdataUnits = stored
        }
      }

      const factions = (wahapediaData['factions'] ?? []) as Array<{ id: string; name: string }>
      const datasheets = (wahapediaData['datasheets'] ?? []) as Array<{ id: string; name: string; factionId: string }>

      const { map: idMap, factionCodeToName } = buildIdMapping(datasheets, factions, bsdataUnits)
      const rekeyed = rekeyAllWahapediaFiles(wahapediaData, idMap, factionCodeToName)

      for (const [name, records] of Object.entries(rekeyed)) {
        await writeDataFile(bucket, `${name}.json`, records)
        files.add(`${name}.json`)
      }
    } catch (err) {
      errors.push(`ID mapping: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 4. Missions
  let missionsMeta: Manifest['missions'] = existing?.missions
  try {
    const result = await fetchAndProcessMissions(existing)
    if (result.skipped) {
      skipped.push('missions (unchanged)')
    } else {
      await writeDataFile(bucket, 'missions.json', result.missions)
      files.add('missions.json')
      missionsMeta = { count: result.missions.length }
    }
  } catch (err) {
    errors.push(`Missions: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 5. Write manifest
  const manifest: Manifest = {
    version: (existing?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    wahapedia: wahapediaMeta,
    bsdata: bsdataMeta,
    missions: missionsMeta,
    files: [...files],
  }
  await writeManifest(bucket, manifest)

  return { success: errors.length === 0, manifest, errors, skipped }
}
