/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-game-data.md — IndexedDB game data schema
 */
import type { Db } from '@tabletop-tools/db'

import type { Manifest } from '../types'
import {
  canonicalDetachmentId,
  type DatasheetRecord,
  type DetachmentAbilityRecord,
  type DetachmentRecord,
  type FactionRecord,
  produceAbilities,
  produceDatasheets,
  produceDetachmentAbilities,
  produceDetachments,
  produceEnhancements,
  produceFactions,
  produceStratagems,
  produceSubfactions,
  produceWeapons,
  type SubfactionRecord,
  type WeaponRecord,
} from './content-producer'
import { buildIdMapping, rekeyAllWahapediaFiles } from './id-mapping'
import { fetchAndProcessBSData } from './sources/bsdata'
import { fetchAndProcessMissions } from './sources/missions'
import { fetchAndProcessWahapedia } from './sources/wahapedia'

export interface SyncResult {
  success: boolean
  manifest: Manifest
  errors: string[]
  skipped: string[]
  /** Canonical content production counts (per type). Empty when no producer ran. */
  producer?: Record<string, { r2DocsWritten: number; contentEntityUpserts: number }>
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

export async function runSync(
  bucket: R2Bucket,
  githubToken?: string,
  force = false,
  db?: Db,
): Promise<SyncResult> {
  const errors: string[] = []
  const skipped: string[] = []
  const producer: SyncResult['producer'] = {}
  const existing = await readManifest(bucket)
  const files = new Set<string>(existing?.files ?? [])

  // 1. Wahapedia
  let wahapediaData: Record<string, unknown[]> | null = null
  let wahapediaMeta: Manifest['wahapedia'] = existing?.wahapedia
  try {
    const result = await fetchAndProcessWahapedia(
      force ? undefined : existing?.wahapedia?.lastUpdate,
    )
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
  let bsdataSubfactions: SubfactionRecord[] = []
  let bsdataMeta: Manifest['bsdata'] = existing?.bsdata
  try {
    const result = await fetchAndProcessBSData(
      force ? undefined : existing?.bsdata?.commitSha,
      undefined,
      undefined,
      githubToken,
    )
    if (result.skipped) {
      skipped.push('bsdata (unchanged)')
    } else {
      // Extract only the fields needed for ID mapping
      bsdataUnits = result.units.map((u) => ({ id: u.id, name: u.name, faction: u.faction }))
      bsdataSubfactions = result.subfactions.map((s) => ({
        id: s.id,
        name: s.name,
        faction: s.faction,
      }))
      bsdataMeta = {
        commitSha: result.commitSha,
        unitCount: result.units.length,
        factionCount: new Set(result.units.map((u) => u.faction)).size,
      }
      await writeDataFile(bucket, 'bsdata-units.json', result.units)
      await writeDataFile(bucket, 'bsdata-subfactions.json', result.subfactions)
      files.add('bsdata-units.json')
      files.add('bsdata-subfactions.json')
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
          const stored = (await obj.json()) as Array<{ id: string; name: string; faction: string }>
          bsdataUnits = stored
        }
      }
      if (bsdataSubfactions.length === 0) {
        const obj = await bucket.get('data/bsdata-subfactions.json')
        if (obj) {
          const stored = (await obj.json()) as Array<{
            id: string
            name: string
            faction: string
            groupName: string
          }>
          bsdataSubfactions = stored.map((s) => ({ id: s.id, name: s.name, faction: s.faction }))
        }
      }

      const factions = (wahapediaData['factions'] ?? []) as Array<{ id: string; name: string }>
      const datasheets = (wahapediaData['datasheets'] ?? []) as Array<{
        id: string
        name: string
        factionId: string
      }>

      const { map: idMap, factionCodeToName } = buildIdMapping(datasheets, factions, bsdataUnits)
      const rekeyed = rekeyAllWahapediaFiles(wahapediaData, idMap, factionCodeToName)

      for (const [name, records] of Object.entries(rekeyed)) {
        await writeDataFile(bucket, `${name}.json`, records)
        files.add(`${name}.json`)
      }

      // Canonical content-doc producer (Phase 1.4 steps 7–9).
      // Always writes per-entity R2 docs; content_entity rows only when db is
      // configured. Additive — existing data/*.json output above is untouched.
      // Order matters for FK integrity: factions → subfactions → detachments →
      // datasheets → weapons → detachment_abilities → abilities/stratagems/enhancements.
      //
      // NOTE: this populates the content_entity registry only. It does NOT
      // touch the brain build's faction-node graph (buildFactionNodes,
      // `n.subfaction` from the faction-pack parser) — that system stays as-is.
      try {
        const factionRecords = (rekeyed['factions'] as FactionRecord[] | undefined) ?? []
        if (factionRecords.length > 0) {
          const r = await produceFactions(bucket, db, factionRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        if (bsdataSubfactions.length > 0) {
          const r = await produceSubfactions(bucket, db, bsdataSubfactions)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const detachmentRecords = (rekeyed['detachments'] as DetachmentRecord[] | undefined) ?? []
        // Build a wahapedia detachment id → canonical detachment id map for
        // detachment_abilities' parent_id FK resolution.
        const detachmentIdMap = new Map<string, string>()
        for (const d of detachmentRecords) {
          detachmentIdMap.set(d.id, canonicalDetachmentId(d.factionId, d.name))
        }
        if (detachmentRecords.length > 0) {
          const r = await produceDetachments(bucket, db, detachmentRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const datasheetRecords = (rekeyed['datasheets'] as DatasheetRecord[] | undefined) ?? []
        if (datasheetRecords.length > 0) {
          const r = await produceDatasheets(bucket, db, datasheetRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const weaponRecords = (rekeyed['datasheet_wargear'] as WeaponRecord[] | undefined) ?? []
        if (weaponRecords.length > 0) {
          const r = await produceWeapons(bucket, db, weaponRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const detachmentAbilityRecords =
          (rekeyed['detachment_abilities'] as DetachmentAbilityRecord[] | undefined) ?? []
        if (detachmentAbilityRecords.length > 0) {
          const r = await produceDetachmentAbilities(
            bucket,
            db,
            detachmentAbilityRecords,
            detachmentIdMap,
          )
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        type Namespaced = { id: string; canonicalId: string; name: string; factionId?: string }
        const abilityRecords = (rekeyed['abilities'] as Namespaced[] | undefined) ?? []
        if (abilityRecords.length > 0) {
          const r = await produceAbilities(bucket, db, abilityRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const stratagemRecords = (rekeyed['stratagems'] as Namespaced[] | undefined) ?? []
        if (stratagemRecords.length > 0) {
          const r = await produceStratagems(bucket, db, stratagemRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
        const enhancementRecords = (rekeyed['enhancements'] as Namespaced[] | undefined) ?? []
        if (enhancementRecords.length > 0) {
          const r = await produceEnhancements(bucket, db, enhancementRecords)
          producer[r.type] = {
            r2DocsWritten: r.r2DocsWritten,
            contentEntityUpserts: r.contentEntityUpserts,
          }
        }
      } catch (err) {
        errors.push(`Content producer: ${err instanceof Error ? err.message : String(err)}`)
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

  return {
    success: errors.length === 0,
    manifest,
    errors,
    skipped,
    ...(Object.keys(producer).length > 0 ? { producer } : {}),
  }
}
