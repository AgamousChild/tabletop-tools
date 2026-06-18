/**
 * Server-side ID mapping between Wahapedia and BSData.
 *
 * Ported from apps/data-import/client/src/lib/wahapedia.ts
 * Adapted to accept BSData units directly (instead of loading from IndexedDB).
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 */

/**
 * Normalizes a unit name for fuzzy matching between BSData and Wahapedia.
 * Strips special characters, collapses whitespace, lowercases.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface IdMappingResult {
  map: Map<string, string>
  factionCodeToName: Map<string, string>
  matched: number
  unmatched: number
  /**
   * Count of matches where multiple BSData units shared the name and faction
   * disambiguation failed, so the first candidate was taken. These are the
   * uncertain mappings that can silently bind the wrong unit — surfaced as a
   * number so a bad key shows up instead of producing the wrong card downstream.
   */
  ambiguous: number
}

/**
 * Builds a mapping from Wahapedia datasheet IDs to BSData unit IDs.
 * Matches by normalized unit name. For ambiguous matches, prefers same faction.
 */
export function buildIdMapping(
  datasheets: Array<{ id: string; name: string; factionId: string }>,
  factions: Array<{ id: string; name: string }>,
  bsdataUnits: Array<{ id: string; name: string; faction: string }>,
): IdMappingResult {
  // Build faction ID → faction name mapping from Wahapedia factions
  const factionCodeToName = new Map<string, string>()
  for (const f of factions) {
    factionCodeToName.set(f.id, f.name)
  }

  // Build BSData lookup: normalizedName → array of { id, faction }
  const bsdataByName = new Map<string, Array<{ id: string; faction: string }>>()
  for (const unit of bsdataUnits) {
    const key = normalizeName(unit.name)
    const arr = bsdataByName.get(key) || []
    arr.push({ id: unit.id, faction: unit.faction })
    bsdataByName.set(key, arr)
  }

  const map = new Map<string, string>()
  let matched = 0
  let unmatched = 0
  let ambiguous = 0

  for (const ds of datasheets) {
    const key = normalizeName(ds.name)
    const candidates = bsdataByName.get(key)

    if (!candidates || candidates.length === 0) {
      unmatched++
      continue
    }

    if (candidates.length === 1) {
      map.set(ds.id, candidates[0]!.id)
      matched++
      continue
    }

    // Multiple matches — try faction-based disambiguation
    const wahapediaFactionName = factionCodeToName.get(ds.factionId)
    const factionMatch = wahapediaFactionName
      ? candidates.find((c) => normalizeName(c.faction) === normalizeName(wahapediaFactionName))
      : null

    if (factionMatch) {
      map.set(ds.id, factionMatch.id)
    } else {
      map.set(ds.id, candidates[0]!.id)
      ambiguous++
    }
    matched++
  }

  return { map, factionCodeToName, matched, unmatched, ambiguous }
}

/**
 * The canonical content-id namespace. One stable id space shared by every
 * surface (R2 docs, relational FKs, browser store, brain crosswalk) — see
 * docs/superpowers/specs/2026-05-28-content-silo-bridge-design.md §1.
 */
export type CanonicalContentType =
  | 'datasheet'
  | 'weapon'
  | 'faction'
  | 'subfaction'
  | 'detachment'
  | 'ability'
  | 'stratagem'
  | 'enhancement'
  | 'detachment_ability'
  | 'mission'

/**
 * Builds the canonical id for a content entity by anchoring it to its **given**
 * source id (never a regenerated/arbitrary value), namespaced by type so the
 * one id space can't collide across types. Deterministic: the same source id
 * yields the same canonical id on every run — so indexes/keys stay stable and
 * never need rebuilding.
 */
export function canonicalContentId(type: CanonicalContentType, sourceId: string): string {
  return `${type}:${sourceId}`
}

/**
 * Re-keys an array of records, replacing wahapediaId with bsdataId for the
 * datasheetId field. Records without a mapping are kept with original ID.
 */
export function rekeyRecords<T extends Record<string, unknown>>(
  records: T[],
  idMap: Map<string, string>,
  field = 'datasheetId',
): T[] {
  return records.map((r) => {
    const oldId = r[field] as string | undefined
    if (oldId) {
      const bsdataId = idMap.get(oldId)
      if (bsdataId) {
        return { ...r, [field]: bsdataId }
      }
    }
    return r
  })
}

/**
 * Re-keys factionId from Wahapedia short codes to full BSData faction names.
 */
export function rekeyFactionIds<T extends Record<string, unknown>>(
  records: T[],
  factionCodeToName: Map<string, string>,
): T[] {
  return records.map((r) => {
    const factionId = r['factionId'] as string | undefined
    if (factionId) {
      const fullName = factionCodeToName.get(factionId)
      if (fullName) {
        return { ...r, factionId: fullName }
      }
    }
    return r
  })
}

/**
 * Re-keys leader attachment records which use leaderId/attachedId (both are datasheet IDs).
 */
export function rekeyLeaderAttachments(
  records: Array<Record<string, unknown>>,
  idMap: Map<string, string>,
): Array<Record<string, unknown>> {
  return records.map((r) => ({
    ...r,
    leaderId: idMap.get(r['leaderId'] as string) ?? r['leaderId'],
    attachedId: idMap.get(r['attachedId'] as string) ?? r['attachedId'],
  }))
}

/**
 * Re-keys all Wahapedia data files with BSData IDs and full faction names.
 * Returns a new object with all files re-keyed.
 */
export function rekeyAllWahapediaFiles(
  data: Record<string, unknown[]>,
  idMap: Map<string, string>,
  factionCodeToName: Map<string, string>,
): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {}

  // Files that need factionId re-keying (use Wahapedia faction codes)
  const factionIdFiles = [
    'factions',
    'detachments',
    'detachment_abilities',
    'stratagems',
    'enhancements',
    'abilities',
    'datasheets',
  ]

  // Files that need datasheetId re-keying
  const datasheetIdFiles = [
    'unit_compositions',
    'unit_costs',
    'wargear_options',
    'unit_keywords',
    'unit_abilities',
    'datasheet_wargear',
    'datasheet_models',
    'datasheet_stratagems',
    'datasheet_enhancements',
    'datasheet_detachment_abilities',
  ]

  // Wahapedia-only content entities → a typed canonical id anchored to the
  // given id. There is no BSData target for these, so the source id IS the
  // stable key; we just namespace it for the one shared id space.
  // Missions: Wahapedia mission data currently flows in empty (the 11th-leak
  // path writes content_entity rows directly from reference.json); listed
  // here so the canonical id scheme is already in place when a Wahapedia
  // mission source lights up.
  const canonicalIdFiles: Record<string, CanonicalContentType> = {
    abilities: 'ability',
    stratagems: 'stratagem',
    enhancements: 'enhancement',
    detachment_abilities: 'detachment_ability',
    missions: 'mission',
  }

  for (const [name, records] of Object.entries(data)) {
    let rekeyed = records as Record<string, unknown>[]

    if (name === 'leader_attachments') {
      rekeyed = rekeyLeaderAttachments(rekeyed, idMap)
    } else if (datasheetIdFiles.includes(name)) {
      rekeyed = rekeyRecords(rekeyed, idMap)
    }

    if (factionIdFiles.includes(name)) {
      rekeyed = rekeyFactionIds(rekeyed, factionCodeToName)
    }

    // Re-key datasheets to the canonical (BSData) id, but KEEP the given ids
    // as provenance — the original Wahapedia id is never discarded, so every
    // mapping stays verifiable and a bad name-match can be traced after the fact.
    if (name === 'datasheets') {
      rekeyed = rekeyed.map((ds) => {
        const wahapediaId = ds['id'] as string
        const bsdataId = idMap.get(wahapediaId)
        const canonical = bsdataId ?? wahapediaId
        return {
          ...ds,
          id: canonical,
          canonicalId: canonical,
          wahapediaId,
          ...(bsdataId ? { bsdataId } : {}),
        }
      })
    }

    // Wahapedia-only content entities: attach a canonical id (id itself stays
    // unchanged so current consumers don't break) plus the given id.
    const contentType = canonicalIdFiles[name]
    if (contentType) {
      rekeyed = rekeyed.map((r) => {
        const sourceId = r['id'] as string
        return {
          ...r,
          canonicalId: canonicalContentId(contentType, sourceId),
          wahapediaId: sourceId,
        }
      })
    }

    result[name] = rekeyed
  }

  return result
}

export interface ContentIdValidation {
  matched: number
  unmatched: number
  /** Per content-type resolved/unresolved counts, for spotting which links broke. */
  byType: Record<string, { matched: number; unmatched: number }>
}

/**
 * Validates that every junction reference resolves to a real content entity by
 * its id. This is the gate for the canonical id scheme: a non-zero `unmatched`
 * means a reference points at an id that does not exist — exactly the silent
 * mis-key that surfaces the wrong item in the Brain/UI. Empty references
 * (inline abilities, etc.) are not links and are skipped.
 */
export function validateContentIds(data: Record<string, unknown[]>): ContentIdValidation {
  const idSet = (file: string) =>
    new Set(
      (data[file] ?? []).map((r) => (r as Record<string, unknown>)['id'] as string).filter(Boolean),
    )

  const references: Array<{ type: string; file: string; field: string; target: string }> = [
    { type: 'ability', file: 'unit_abilities', field: 'abilityId', target: 'abilities' },
    { type: 'stratagem', file: 'datasheet_stratagems', field: 'stratagemId', target: 'stratagems' },
    {
      type: 'enhancement',
      file: 'datasheet_enhancements',
      field: 'enhancementId',
      target: 'enhancements',
    },
    {
      type: 'detachment_ability',
      file: 'datasheet_detachment_abilities',
      field: 'detachmentAbilityId',
      target: 'detachment_abilities',
    },
  ]

  const byType: Record<string, { matched: number; unmatched: number }> = {}
  let matched = 0
  let unmatched = 0

  for (const ref of references) {
    const ids = idSet(ref.target)
    let m = 0
    let u = 0
    for (const rec of data[ref.file] ?? []) {
      const value = (rec as Record<string, unknown>)[ref.field] as string | undefined
      if (!value) continue // empty = inline/no link, not a broken reference
      if (ids.has(value)) m++
      else u++
    }
    byType[ref.type] = { matched: m, unmatched: u }
    matched += m
    unmatched += u
  }

  return { matched, unmatched, byType }
}
