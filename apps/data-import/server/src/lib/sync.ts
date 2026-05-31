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
import { buildIdMapping, rekeyAllWahapediaFiles, validateContentIds } from './id-mapping'
import { fetchAndProcessBSData } from './sources/bsdata'
import { fetchAndProcessMissions } from './sources/missions'
import { fetchAndProcessWahapedia } from './sources/wahapedia'

/**
 * Slug-of-name canonical id — must match the brain's build slug rule + the
 * `produceFactions` slug rule in content-producer.ts. Strips apostrophes /
 * smart quotes BEFORE replacing non-alnum so "Emperor's Children" yields
 * "emperors-children" (matching brain) instead of "emperor-s-children".
 */
function contentEntitySlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’ʼ'‘"”“]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Resolve a BSData catalog faction string to a canonical faction id that
 * exists in the Wahapedia faction list. Returns null if no match — the
 * caller drops the subfaction with a warning.
 *
 * Resolution rules (ordered, first match wins):
 *   1. Explicit alias for catalog names whose slug does not match any
 *      canonical id (e.g. all SM chapter catalogs roll up to `space-marines`,
 *      `Agents of the Imperium` → `imperial-agents`).
 *   2. slug(catalog) direct match.
 *   3. slug(catalog with ` Library` suffix stripped) — shared-definitions
 *      catalog (e.g. `Chaos Daemons Library` → `chaos-daemons`).
 *   4. slug(catalog with `Library - ` prefix stripped) — cross-faction shared
 *      catalog (e.g. `Library - Tyranids` → `tyranids`).
 *   5. slug(catalog up to first dash/paren) — fallback for compound names.
 *
 * The alias table is grounded in actual repo enumeration (BSData/wh40k-10e
 * main branch): 11 SM chapter catalogs + Agents of the Imperium are the
 * concrete names that don't slug to a Wahapedia id. Three further catalogs
 * (Chaos Titanicus Traitoris, Library Astartes Heresy Legends, Library
 * Titans) intentionally have no Wahapedia canonical id and stay unresolved.
 */
const CATALOG_FACTION_ALIASES: Record<string, string> = {
  // Space Marines chapters — each catalog is a subfaction of `space-marines`
  'black templars': 'space-marines',
  'blood angels': 'space-marines',
  'dark angels': 'space-marines',
  deathwatch: 'space-marines',
  'imperial fists': 'space-marines',
  'iron hands': 'space-marines',
  'raven guard': 'space-marines',
  salamanders: 'space-marines',
  'space wolves': 'space-marines',
  ultramarines: 'space-marines',
  'white scars': 'space-marines',
  // String drift: Wahapedia calls this `imperial-agents`, BSData says
  // `Agents of the Imperium`.
  'agents of the imperium': 'imperial-agents',
}

function resolveCatalogToCanonicalFactionId(
  catalog: string,
  canonicalIds: Set<string>,
): string | null {
  // Alias lookup is case-insensitive on the bare catalog string (after the
  // source-layer `Imperium - ` / `Chaos - ` prefix has already been stripped).
  const aliased = CATALOG_FACTION_ALIASES[catalog.toLowerCase().trim()]
  if (aliased) return aliased

  const candidates = [
    catalog,
    catalog.replace(/\s+Library$/i, ''),
    catalog.replace(/^Library\s*-\s*/i, ''),
    catalog.replace(/\s*[-–(].*$/, ''),
  ]
  for (const c of candidates) {
    const id = contentEntitySlug(c)
    if (canonicalIds.has(id)) return id
  }
  return null
}

export interface SyncResult {
  success: boolean
  manifest: Manifest
  errors: string[]
  skipped: string[]
  /** Canonical content production counts (per type). Empty when no producer ran. */
  producer?: Record<string, { r2DocsWritten: number; contentEntityUpserts: number }>
  /**
   * Phase 1.1 reference-resolution validation against the rekeyed import.
   * matched / unmatched / ambiguous so a regression in key consistency
   * surfaces as a flagged number on every live import. (Worklist step 5.)
   */
  contentIdValidation?: {
    matched: number
    unmatched: number
    byType: Record<string, { matched: number; unmatched: number }>
  }
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
  let contentIdValidation: SyncResult['contentIdValidation']
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

  // 2. BSData — keep raw subfactions (catalog faction string) here; the
  // catalog→canonical resolution happens once below, against the Wahapedia
  // faction list, so what reaches the producer is already-correct factionIds.
  let bsdataUnits: Array<{ id: string; name: string; faction: string }> = []
  let rawBsdataSubfactions: Array<{
    id: string
    name: string
    faction: string
    groupName: string
  }> = []
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
      bsdataUnits = result.units.map((u) => ({ id: u.id, name: u.name, faction: u.faction }))
      rawBsdataSubfactions = result.subfactions
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
      if (rawBsdataSubfactions.length === 0) {
        const obj = await bucket.get('data/bsdata-subfactions.json')
        if (obj) {
          rawBsdataSubfactions = (await obj.json()) as Array<{
            id: string
            name: string
            faction: string
            groupName: string
          }>
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

      // Worklist step 5: validate that every junction reference in the rekeyed
      // data resolves to a known content entity. Counts (matched / unmatched /
      // by type) are surfaced in the SyncResult so a key-consistency regression
      // shows up as a number on every live import instead of going silent.
      contentIdValidation = validateContentIds(rekeyed)
      console.log(
        `[validate] content-id refs: matched=${contentIdValidation.matched} unmatched=${contentIdValidation.unmatched}`,
      )
      if (contentIdValidation.unmatched > 0) {
        for (const [type, c] of Object.entries(contentIdValidation.byType)) {
          if (c.unmatched > 0)
            console.warn(`[validate]   ${type}: ${c.unmatched} unresolved references`)
        }
      }

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
      // Per-producer try-catch so a single FK / constraint failure surfaces
      // in `errors` but doesn't abort the rest of the chain.
      const runProducer = async (
        label: string,
        fn: () => Promise<{
          type: string
          r2DocsWritten: number
          contentEntityUpserts: number
        } | null>,
      ) => {
        try {
          const r = await fn()
          if (r)
            producer[r.type] = {
              r2DocsWritten: r.r2DocsWritten,
              contentEntityUpserts: r.contentEntityUpserts,
            }
        } catch (err) {
          errors.push(
            `Content producer (${label}): ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      const factionRecords = (rekeyed['factions'] as FactionRecord[] | undefined) ?? []
      const detachmentRecords = (rekeyed['detachments'] as DetachmentRecord[] | undefined) ?? []
      const detachmentIdMap = new Map<string, string>()
      for (const d of detachmentRecords) {
        detachmentIdMap.set(d.id, canonicalDetachmentId(d.factionId, d.name))
      }
      const datasheetRecords = (rekeyed['datasheets'] as DatasheetRecord[] | undefined) ?? []
      const weaponRecords = (rekeyed['datasheet_wargear'] as WeaponRecord[] | undefined) ?? []
      const detachmentAbilityRecords =
        (rekeyed['detachment_abilities'] as DetachmentAbilityRecord[] | undefined) ?? []
      type Namespaced = { id: string; canonicalId: string; name: string; factionId?: string }
      const abilityRecords = (rekeyed['abilities'] as Namespaced[] | undefined) ?? []
      const stratagemRecords = (rekeyed['stratagems'] as Namespaced[] | undefined) ?? []
      const enhancementRecords = (rekeyed['enhancements'] as Namespaced[] | undefined) ?? []

      // Resolve raw BSData catalog faction strings to canonical faction ids
      // ONCE here, against the authoritative Wahapedia faction list. The
      // producer takes already-correct factionIds and does no FK fishing.
      // Catalog string normalization:
      //   - "Imperium - X" / "Chaos - X" prefixes already stripped by source
      //   - "X Library" → "X" (shared-definitions catalog; subfactions belong
      //     to the parent faction, e.g. "Chaos Daemons Library" → "Chaos Daemons")
      // Anything that doesn't match a known canonical faction is dropped with
      // a logged warning — better than a silent FK violation that aborts the chain.
      const canonicalFactionIds = new Set(factionRecords.map((f) => contentEntitySlug(f.name)))
      const bsdataSubfactions: SubfactionRecord[] = []
      const unresolvedCatalogs = new Set<string>()
      for (const s of rawBsdataSubfactions) {
        const factionId = resolveCatalogToCanonicalFactionId(s.faction, canonicalFactionIds)
        if (factionId) {
          bsdataSubfactions.push({ id: s.id, name: s.name, factionId })
        } else {
          unresolvedCatalogs.add(s.faction)
        }
      }
      if (unresolvedCatalogs.size > 0) {
        console.warn(
          `[subfactions] dropped ${rawBsdataSubfactions.length - bsdataSubfactions.length} subfactions; unresolved catalogs: ${[...unresolvedCatalogs].join(', ')}`,
        )
      }

      // Filter records whose FK targets won't exist in content_entity — same
      // resolve-at-boundary principle as subfactions. Drop with a logged
      // count instead of FK-violating mid-batch.
      const canonicalDatasheetIds = new Set(datasheetRecords.map((d) => d.id))
      const weaponsValid = weaponRecords.filter((w) => canonicalDatasheetIds.has(w.datasheetId))
      if (weaponsValid.length < weaponRecords.length) {
        console.warn(
          `[weapons] dropped ${weaponRecords.length - weaponsValid.length} weapons referencing unknown datasheets`,
        )
      }

      // Stratagems / enhancements / abilities reference a faction. After
      // rekey, the factionId on these is the canonical faction NAME (or the
      // wahapedia code if rekey missed it); slug it and check against the
      // canonical id set. Rows with no factionId stay (the FK is nullable).
      const filterByFaction = <T extends { factionId?: string }>(rows: T[], label: string): T[] => {
        const valid: T[] = []
        let dropped = 0
        const droppedFactionIds = new Set<string>()
        for (const r of rows) {
          if (!r.factionId) {
            valid.push(r)
            continue
          }
          const slugged = contentEntitySlug(r.factionId)
          if (canonicalFactionIds.has(slugged)) {
            valid.push({ ...r, factionId: slugged } as T)
          } else {
            dropped++
            droppedFactionIds.add(r.factionId)
          }
        }
        if (dropped > 0) {
          console.warn(
            `[${label}] dropped ${dropped} rows with unknown factionIds: ${[...droppedFactionIds].slice(0, 10).join(', ')}${droppedFactionIds.size > 10 ? `, +${droppedFactionIds.size - 10} more` : ''}`,
          )
        }
        return valid
      }
      const stratagemsValid = filterByFaction(stratagemRecords, 'stratagems')
      const enhancementsValid = filterByFaction(enhancementRecords, 'enhancements')
      const abilitiesValid = filterByFaction(abilityRecords, 'abilities')
      const datasheetsValid = filterByFaction(datasheetRecords, 'datasheets')
      // Wahapedia tags Boarding Actions detachments with type='Boarding Actions'.
      // Those are a separate game mode (small-scale boarding combat), not main
      // 10th-ed detachments. Filtering them yields ~202 main detachments,
      // consistent with community tracking (~195 across 23 factions).
      const detachmentsMainGame = detachmentRecords.filter((d) => d.type !== 'Boarding Actions')
      const boardingActionsDropped = detachmentRecords.length - detachmentsMainGame.length
      if (boardingActionsDropped > 0) {
        console.warn(`[detachments] dropped ${boardingActionsDropped} Boarding Actions detachments`)
      }
      const detachmentsValid = filterByFaction(detachmentsMainGame, 'detachments')
      // Re-derive canonicalDatasheetIds from the filtered set so weapons can't
      // reference a datasheet that didn't make it through the FK filter.
      const canonicalDatasheetIdsFiltered = new Set(datasheetsValid.map((d) => d.id))
      const weaponsValidStrict = weaponsValid.filter((w) =>
        canonicalDatasheetIdsFiltered.has(w.datasheetId),
      )
      if (weaponsValidStrict.length < weaponsValid.length) {
        console.warn(
          `[weapons] additional ${weaponsValid.length - weaponsValidStrict.length} dropped due to filtered-out datasheets`,
        )
      }
      // detachment_abilities reference detachments via detachmentIdMap → parent_id.
      // If the parent detachment was filtered (e.g. Boarding Actions), the
      // detachment_ability FK will violate. Drop those abilities.
      const validDetachmentWahapediaIds = new Set(detachmentsValid.map((d) => d.id))
      const detachmentAbilityRecordsValid = detachmentAbilityRecords.filter((da) =>
        validDetachmentWahapediaIds.has(da.detachmentId),
      )
      if (detachmentAbilityRecordsValid.length < detachmentAbilityRecords.length) {
        console.warn(
          `[detachment_abilities] dropped ${detachmentAbilityRecords.length - detachmentAbilityRecordsValid.length} referencing filtered-out detachments`,
        )
      }

      await runProducer('factions', () =>
        factionRecords.length > 0
          ? produceFactions(bucket, db, factionRecords)
          : Promise.resolve(null),
      )
      await runProducer('subfactions', () =>
        bsdataSubfactions.length > 0
          ? produceSubfactions(bucket, db, bsdataSubfactions)
          : Promise.resolve(null),
      )
      await runProducer('detachments', () =>
        detachmentsValid.length > 0
          ? produceDetachments(bucket, db, detachmentsValid)
          : Promise.resolve(null),
      )
      await runProducer('datasheets', () =>
        datasheetsValid.length > 0
          ? produceDatasheets(bucket, db, datasheetsValid)
          : Promise.resolve(null),
      )
      await runProducer('weapons', () =>
        weaponsValidStrict.length > 0
          ? produceWeapons(bucket, db, weaponsValidStrict)
          : Promise.resolve(null),
      )
      await runProducer('detachment_abilities', () =>
        detachmentAbilityRecordsValid.length > 0
          ? produceDetachmentAbilities(bucket, db, detachmentAbilityRecordsValid, detachmentIdMap)
          : Promise.resolve(null),
      )
      await runProducer('abilities', () =>
        abilitiesValid.length > 0
          ? produceAbilities(bucket, db, abilitiesValid)
          : Promise.resolve(null),
      )
      await runProducer('stratagems', () =>
        stratagemsValid.length > 0
          ? produceStratagems(bucket, db, stratagemsValid)
          : Promise.resolve(null),
      )
      await runProducer('enhancements', () =>
        enhancementsValid.length > 0
          ? produceEnhancements(bucket, db, enhancementsValid)
          : Promise.resolve(null),
      )
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
    ...(contentIdValidation ? { contentIdValidation } : {}),
  }
}
