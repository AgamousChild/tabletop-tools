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
  type LeaderAttachmentRecord,
  produceAbilities,
  produceCanLead,
  produceCanSupport,
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
import {
  buildIdMapping,
  buildMfmUnitIdMapping,
  mfmUnitMapKey,
  rekeyAllWahapediaFiles,
  validateContentIds,
} from './id-mapping'
import { fetchAndProcessBSData } from './sources/bsdata'
import { fetchAndProcessMFM } from './sources/mfm'
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
  /** Per-stage wall-clock milliseconds for the stages that actually ran. */
  stageTimings: Record<string, number>
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

export interface RunSyncOptions {
  /**
   * Skip the canonical-content producer chain (writes per-type R2 docs and,
   * when DB is configured, upserts content_entity). The producer chain runs
   * 9 stages over ~17K entities with sequential JSON serialization — heavy
   * enough that on the Workers Paid plan /sync was hitting CF error 1102
   * during the producer phase. Brain ingest reads the rekeyed Wahapedia
   * files directly, not content/{type}.json, so this is safe to skip when
   * the goal is refreshing the raw R2 outputs.
   */
  skipProducers?: boolean
  /**
   * Restrict to a subset of sources. When set, sources not in the set are
   * skipped entirely. Used by the CI workflow to chunk a long sync into
   * smaller per-source invocations that each stay under the Worker CPU cap.
   */
  sources?: Set<'wahapedia' | 'bsdata' | 'mfm' | 'missions'>
}

export async function runSync(
  bucket: R2Bucket,
  githubToken?: string,
  force = false,
  db?: Db,
  options: RunSyncOptions = {},
): Promise<SyncResult> {
  const skipProducers = options.skipProducers === true
  const wantSource = (s: 'wahapedia' | 'bsdata' | 'mfm' | 'missions') =>
    !options.sources || options.sources.has(s)
  const stageTimings: Record<string, number> = {}
  const timeStage = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now()
    try {
      return await fn()
    } finally {
      stageTimings[label] = Date.now() - t
    }
  }
  const errors: string[] = []
  const skipped: string[] = []
  const producer: SyncResult['producer'] = {}
  let contentIdValidation: SyncResult['contentIdValidation']
  const existing = await readManifest(bucket)
  const files = new Set<string>(existing?.files ?? [])

  // 1. Wahapedia
  let wahapediaData: Record<string, unknown[]> | null = null
  let wahapediaMeta: Manifest['wahapedia'] = existing?.wahapedia
  if (!wantSource('wahapedia')) {
    skipped.push('wahapedia (filtered)')
  } else
    try {
      const result = await timeStage('wahapedia', () =>
        fetchAndProcessWahapedia(force ? undefined : existing?.wahapedia?.lastUpdate),
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
  if (!wantSource('bsdata')) {
    skipped.push('bsdata (filtered)')
  } else
    try {
      const result = await timeStage('bsdata', () =>
        fetchAndProcessBSData(
          force ? undefined : existing?.bsdata?.commitSha,
          undefined,
          undefined,
          githubToken,
        ),
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
        // Short-circuit when the caller opted out of the producer chain so
        // the heavy JSON serialization across ~17K entities is skipped.
        if (skipProducers) return
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

      // content_can_lead — leader → bodyguard datasheet relationships from
      // Wahapedia's leader_attachments. Already rekeyed by the rekey step, so
      // leaderId and attachedId resolve to canonical content_entity ids. Skip
      // when DB isn't available — and when the caller opted out of the
      // producer chain entirely.
      try {
        const leaderAttachments =
          (rekeyed['leader_attachments'] as LeaderAttachmentRecord[] | undefined) ?? []
        if (!skipProducers && leaderAttachments.length > 0 && db) {
          const r = await produceCanLead(db, leaderAttachments, canonicalDatasheetIdsFiltered)
          producer[r.type] = { r2DocsWritten: 0, contentEntityUpserts: r.rowsWritten }
          if (r.dropped > 0) {
            console.warn(
              `[can_lead] dropped ${r.dropped} attachments referencing unknown datasheets`,
            )
          }
        }
      } catch (err) {
        errors.push(
          `Content producer (can_lead): ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // content_can_support — 11th-ed Support ability attachment relationships.
      // DATA GAP (2026-06-01): no per-codex 11th-ed source yet provides Support
      // attachment lists. This scaffold runs and produces 0 rows. When a source
      // lands, pass supportAttachments here — rows write with role='support' and
      // are immediately queryable by role-aware endpoints (no code change needed).
      try {
        if (!skipProducers) {
          const supportAttachments: LeaderAttachmentRecord[] = []
          const r = await produceCanSupport(db, supportAttachments, canonicalDatasheetIdsFiltered)
          if (r.rowsWritten > 0) {
            producer['can_support'] = { r2DocsWritten: 0, contentEntityUpserts: r.rowsWritten }
          }
        }
      } catch (err) {
        errors.push(
          `Content producer (can_support): ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } catch (err) {
      errors.push(`ID mapping: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 4. MFM (Munitorum Field Manual) — tiered costing + detachment DP / objective
  // / unique-restriction / leader-granting enhancements. Joined to BSData
  // datasheet ids by (factionSlug, name) so consumers can look up costing
  // without a name search. Costing re-publishes ~monthly; this whole block
  // is overwrite-clean so a re-run just rewrites the MFM files.
  let mfmMeta: Manifest['mfm'] = existing?.mfm
  if (!wantSource('mfm')) {
    skipped.push('mfm (filtered)')
  } else
    try {
      const mfmResult = await timeStage('mfm', () =>
        fetchAndProcessMFM(
          force ? undefined : existing?.mfm?.commitSha,
          undefined,
          undefined,
          githubToken,
        ),
      )
      if (mfmResult.skipped) {
        skipped.push('mfm (unchanged)')
      } else {
        // Need BSData units to build the id mapping. Reuse fresh result or load
        // from R2 (mirrors the Wahapedia/BSData reload-from-R2 pattern above).
        let unitsForMfm = bsdataUnits
        if (unitsForMfm.length === 0) {
          const obj = await bucket.get('data/bsdata-units.json')
          if (obj) {
            unitsForMfm = (await obj.json()) as Array<{
              id: string
              name: string
              faction: string
            }>
          }
        }

        const bsdataWithSlug = unitsForMfm.map((u) => ({
          id: u.id,
          name: u.name,
          factionSlug: bsdataFactionToMfmSlug(u.faction),
        }))
        const mfmMap = buildMfmUnitIdMapping(mfmResult.factions, bsdataWithSlug)

        const mfmUnitRows: Array<{
          datasheetId: string | null
          factionSlug: string
          name: string
          costing: unknown
          role?: 'leader' | 'support'
          attachTo?: string[]
          wargear?: unknown
          legends?: true
        }> = []
        let detachmentCount = 0
        const mfmDetachmentRows: Array<{
          factionSlug: string
          name: string
          dp: number | null
          objective: string | null
          unique?: string
          enhancements: unknown
        }> = []
        for (const f of mfmResult.factions) {
          for (const unit of f.units) {
            const key = mfmUnitMapKey(f.slug, unit.name)
            mfmUnitRows.push({
              datasheetId: mfmMap.map.get(key) ?? null,
              factionSlug: f.slug,
              name: unit.name,
              costing: unit.costing,
              ...(unit.role ? { role: unit.role } : {}),
              ...(unit.attachTo ? { attachTo: unit.attachTo } : {}),
              ...(unit.wargear ? { wargear: unit.wargear } : {}),
              ...(unit.legends ? { legends: unit.legends as true } : {}),
            })
          }
          for (const d of f.detachments) {
            detachmentCount++
            mfmDetachmentRows.push({
              factionSlug: f.slug,
              name: d.name,
              dp: d.dp,
              objective: d.objective,
              ...(d.unique ? { unique: d.unique } : {}),
              enhancements: d.enhancements,
            })
          }
        }

        await writeDataFile(bucket, 'mfm-unit-costing.json', mfmUnitRows)
        await writeDataFile(bucket, 'mfm-detachments.json', mfmDetachmentRows)
        files.add('mfm-unit-costing.json')
        files.add('mfm-detachments.json')

        mfmMeta = {
          commitSha: mfmResult.commitSha,
          factionCount: mfmResult.factions.length,
          unitCount: mfmUnitRows.length,
          detachmentCount,
          unmappedUnitCount: mfmMap.unmatched,
        }
        console.log(
          `[mfm] factions=${mfmResult.factions.length} units=${mfmUnitRows.length} detachments=${detachmentCount} mapped=${mfmMap.matched} unmapped=${mfmMap.unmatched} ambiguous=${mfmMap.ambiguous}`,
        )
      }
    } catch (err) {
      errors.push(`MFM: ${err instanceof Error ? err.message : String(err)}`)
    }

  // 5. Missions
  let missionsMeta: Manifest['missions'] = existing?.missions
  if (!wantSource('missions')) {
    skipped.push('missions (filtered)')
  } else
    try {
      const result = await timeStage('missions', () => fetchAndProcessMissions(existing))
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

  // 6. Write manifest
  const manifest: Manifest = {
    version: (existing?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    wahapedia: wahapediaMeta,
    bsdata: bsdataMeta,
    missions: missionsMeta,
    mfm: mfmMeta,
    files: [...files],
  }
  await writeManifest(bucket, manifest)

  return {
    success: errors.length === 0,
    manifest,
    errors,
    skipped,
    stageTimings,
    ...(Object.keys(producer).length > 0 ? { producer } : {}),
    ...(contentIdValidation ? { contentIdValidation } : {}),
  }
}

/**
 * MFM faction slugs that exist in the upstream `BSData/wh40k-11e-mfm` repo as
 * standalone YAML files. Determines which SM chapter / sub-faction BSData
 * catalogs keep their own slug versus rolling up to the parent faction.
 *
 * Hardcoded from the actual MFM repo listing (data/*.yaml minus meta.yaml).
 * Update when MFM adds or removes a faction file. Source registry rule (Rule
 * 1) is upheld because this is presentation-only ID mapping logic — the data
 * still lives in MFM upstream.
 */
const MFM_FACTION_SLUGS: ReadonlySet<string> = new Set([
  'adepta-sororitas',
  'adeptus-custodes',
  'adeptus-mechanicus',
  'aeldari',
  'astra-militarum',
  'black-templars',
  'blood-angels',
  'chaos-daemons',
  'chaos-knights',
  'chaos-space-marines',
  'chaos-titan-legions',
  'dark-angels',
  'death-guard',
  'deathwatch',
  'drukhari',
  'emperors-children',
  'genestealer-cults',
  'grey-knights',
  'imperial-agents',
  'imperial-knights',
  'leagues-of-votann',
  'necrons',
  'orks',
  'space-marines',
  'space-wolves',
  'tau-empire',
  'thousand-sons',
  'titan-legions',
  'tyranids',
  'world-eaters',
])

/** SM chapters that have no dedicated MFM YAML — they roll up to `space-marines`. */
const SM_CHAPTERS_WITHOUT_MFM: ReadonlySet<string> = new Set([
  'imperial-fists',
  'iron-hands',
  'raven-guard',
  'salamanders',
  'ultramarines',
  'white-scars',
])

/**
 * String drift between BSData catalog naming and MFM faction slugs that the
 * generic suffix-strip + slugify can't bridge.
 */
const BSDATA_TO_MFM_NAME_ALIASES: Record<string, string> = {
  'agents of the imperium': 'imperial-agents',
}

/**
 * Map a BSData catalog faction string to the MFM faction slug.
 *
 * MFM uses canonical per-faction slugs (`space-marines`, `aeldari`,
 * `drukhari`, `chaos-knights`). BSData uses compound catalog names that mix
 * parent + sub-faction (`Aeldari - Craftworlds`, `Aeldari - Drukhari`,
 * `Imperium - Astra Militarum - Library`). The naive slugify (`aeldari-
 * craftworlds`) misses every MFM faction lookup.
 *
 * Resolution rules (first match wins):
 *   1. Strip `Library - ` prefix and ` Library` suffix — these are
 *      shared-definition wrapper catalogs whose units belong to the parent.
 *   2. Take the first segment of a ` - `-split compound name, so
 *      `Aeldari - Craftworlds` → `Aeldari`. Source-layer already strips
 *      `Imperium - ` / `Chaos - ` prefixes so the first segment is the
 *      MFM-facing faction.
 *   3. Apply explicit name aliases (`agents of the imperium` →
 *      `imperial-agents`).
 *   4. Slugify and check against the MFM faction set. If matched, return.
 *   5. SM-chapter rollup: chapters with no dedicated MFM YAML
 *      (`Ultramarines`, `Iron Hands`, etc.) roll up to `space-marines`.
 *      Chapters that DO have their own MFM file (`Black Templars`,
 *      `Blood Angels`, `Dark Angels`, `Deathwatch`, `Space Wolves`) keep
 *      their own slug — caught by rule 4 above before reaching this rule.
 *   6. Fall back to the slugified string (lets unknown factions still
 *      attempt a join; misses are counted as `unmatched`).
 *
 * Pure: string in, string out. No DB, no async.
 */
function bsdataFactionToMfmSlug(bsdataFaction: string): string {
  // 1. Strip Library wrapper-catalog markers — units in `Aeldari - Aeldari
  //    Library` belong to `Aeldari`, in `Chaos Daemons Library` to
  //    `Chaos Daemons`, and so on.
  let s = bsdataFaction.trim()
  s = s.replace(/^Library\s*-\s*/i, '')
  s = s.replace(/\s+Library$/i, '')

  // 2. Split on ` - ` to expose parent + optional sub-faction segments.
  //    Source layer already stripped the leading `Imperium - ` / `Chaos - `
  //    so segment[0] is the MFM-facing parent.
  const segments = s
    .split(/\s+-\s+/)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0)
  const parent = segments[0] ?? s
  const sub = segments[1]

  // 3. Sub-faction takes precedence ONLY when MFM has a dedicated file for it
  //    (`Aeldari - Drukhari` → `drukhari`). Sub-factions like
  //    `Aeldari - Craftworlds` / `Aeldari - Ynnari` have no MFM file and fall
  //    through to the parent so they map to `aeldari`.
  if (sub) {
    const subAliased = BSDATA_TO_MFM_NAME_ALIASES[sub.toLowerCase()]
    if (subAliased && MFM_FACTION_SLUGS.has(subAliased)) return subAliased
    const subSlug = contentEntitySlug(sub)
    if (MFM_FACTION_SLUGS.has(subSlug)) return subSlug
  }

  // 4. Parent: name aliases first, then direct slugify against the MFM set.
  const parentAliased = BSDATA_TO_MFM_NAME_ALIASES[parent.toLowerCase()]
  if (parentAliased) return parentAliased

  const parentSlug = contentEntitySlug(parent)
  if (MFM_FACTION_SLUGS.has(parentSlug)) return parentSlug

  // 5. SM-chapter rollup for chapters that have no dedicated MFM file. Chapters
  //    that DO have a dedicated MFM YAML (`Black Templars`, `Blood Angels`,
  //    `Dark Angels`, `Deathwatch`, `Space Wolves`) are already caught by rule
  //    4 and keep their own slug.
  if (SM_CHAPTERS_WITHOUT_MFM.has(parentSlug)) return 'space-marines'

  // 6. Fall through to the slugified parent — caller's `buildMfmUnitIdMapping`
  //    counts this as `unmatched` if the slug doesn't appear in any MFM
  //    faction.
  return parentSlug
}

export { bsdataFactionToMfmSlug }
