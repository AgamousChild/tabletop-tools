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
    }
    matched++
  }

  return { map, factionCodeToName, matched, unmatched }
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

    // Re-key datasheets: both the ID itself and factionId
    if (name === 'datasheets') {
      rekeyed = rekeyed.map((ds) => {
        const bsdataId = idMap.get(ds['id'] as string)
        return {
          ...ds,
          ...(bsdataId ? { id: bsdataId } : {}),
        }
      })
    }

    result[name] = rekeyed
  }

  return result
}
