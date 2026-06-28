import type { UnitProfile, WeaponAbility, WeaponProfile } from '../../types.js'

/** Bump when parser output changes in a way that invalidates previously-imported data. */
export const PARSER_VERSION = 16

/**
 * BattleScribe typeId for matched-play points (`<cost name="pts">`). Stable
 * across the wh40k-10e / wh40k-11e BSData catalogs.
 */
const PTS_TYPE_ID = '51b2-306e-1021-d207'

/**
 * A catalog registry maps BSData catalogue IDs (from `<catalogue id="...">`)
 * to the catalog's XML content. Pass to {@link parseBSDataXml} to enable
 * cross-file resolution of `<catalogueLink importRootEntries="true">`, which is
 * how 11e splits faction content between a sub-faction file (e.g. Craftworlds)
 * and a parent library (e.g. Aeldari Library). Without the registry, sub-faction
 * files parse to zero units.
 */
export type CatalogRegistry = Map<string, { name: string; xml: string }>

// ============================================================
// BSData XML → UnitProfile parser
//
// BSData uses Battlescribe's .cat/.gst XML format. This parser
// extracts the minimum needed: unit identity, stats profile,
// weapons, and ability names.
//
// No GW content is hardcoded here. Tests use synthetic fixtures.
// ============================================================

export interface ParseResult {
  units: UnitProfile[]
  subfactions: Subfaction[]
  errors: string[]
}

export interface Subfaction {
  /** BSData id of the upgrade selectionEntry. */
  id: string
  /** Subfaction display name (e.g. 'Ultramarines', 'Sautekh Dynasty'). */
  name: string
  /** Parent faction (from the catalog filename). */
  faction: string
  /** Catalog grouping name (e.g. 'Chapter', 'Dynasty', 'Craftworld'). */
  groupName: string
}

/**
 * BSData group names that contain subfaction upgrade entries as children.
 * Each faction's catalog uses its own term — these are the established ones
 * across the wh40k-10e catalog set.
 */
const SUBFACTION_GROUP_NAMES = [
  'Chapter',
  'Successor Chapter',
  'Dynasty',
  'Craftworld',
  'Kabal',
  'Wych Cult',
  'Haemonculus Coven',
  'Sept',
  'Legion',
  'Hive Fleet',
  'Forge World',
  'Order',
  'Brotherhood',
  'Allegiance',
  'Plague Company',
  'Cabal of Sorcerers',
  'Cult',
]

/**
 * Parse a BSData XML string (from a .cat or .gst file) into UnitProfile[].
 *
 * When `registry` is supplied, `<catalogueLink importRootEntries="true">` is
 * followed transitively (with cycle detection) so units defined in a parent
 * library catalog are extracted as members of `faction`.
 */
export function parseBSDataXml(
  xml: string,
  faction: string,
  registry?: CatalogRegistry,
): ParseResult {
  const units: UnitProfile[] = []
  // Subfactions are extracted only from the local file — parent libraries don't
  // own the subfaction grouping for the consuming catalog.
  const subfactions: Subfaction[] = extractSubfactions(xml, faction)
  const errors: string[] = []

  // The local catalogue's id is the one that primary-catalogue conditions are
  // evaluated against — chapter-cost modifiers in the SM library use the
  // chapter's catalogue id as the condition childId.
  const importingCatalogueId = extractCatalogueId(xml)

  // Split catalog-import resolution into two streams:
  //
  // - `lookupXml` includes the local file plus every catalog transitively
  //   reachable via catalogueLink (regardless of `importRootEntries`). This is
  //   the source of `<profile>`, `<selectionEntry>`, `<infoGroup>`, and
  //   `<selectionEntryGroup>` lookup maps used by `enrichBody` and the
  //   `extractTopLevelEntryLinks` resolver. Without the full set, faction
  //   wrappers that catalogueLink a parent library *without* `importRootEntries`
  //   (e.g. `Aeldari - Drukhari.cat`, which top-level-entryLinks Drukhari units
  //   defined inside `Aeldari - Aeldari Library.cat`) cannot resolve their
  //   roster entries and emit zero units.
  //
  // - `emissionXml` includes the local file plus catalogs reached via
  //   `catalogueLink importRootEntries="true"` — BUT excludes catalogs declared
  //   `library="true"`. Library catalogs are independently parsed under their
  //   own faction string (e.g. `Chaos - Chaos Knights Library.cat` already
  //   emits the 20 real CK units under faction "Chaos Knights Library"), so
  //   re-emitting their roots into the importing wrapper's faction produces
  //   double-counts and, for wrappers that import multiple libraries (e.g.
  //   `Chaos - Chaos Knights.cat` imports CK Library + Daemons Library +
  //   Titans Library), cross-faction pollution: the "Chaos Knights" output
  //   ends up dominated by Chaos Daemons unit names with no real CK content.
  //   The SM chapter pattern is preserved because `Imperium - Space Marines`
  //   (the catalog SM chapter wrappers importRootEntries=true) is itself
  //   `library="false"`, so its roots still flow to each chapter.
  const lookupXml = registry ? mergeAllCatalogueImports(xml, registry, new Set()) : xml
  const emissionXml = registry ? mergeRootEntryImports(xml, registry, new Set()) : xml

  // Build reference maps for resolving <infoLink> and <entryLink> references.
  // BSData XML uses these to point to shared definitions (profiles, weapons, models)
  // defined elsewhere in the file (e.g. in <sharedProfiles> or <sharedSelectionEntries>).
  const profileMap = buildProfileMap(lookupXml)
  const { entryMap, entryAttrsMap } = buildEntryMaps(lookupXml)
  const selectionEntryGroupMap = buildSelectionEntryGroupMap(lookupXml)
  const infoGroupMap = buildInfoGroupMap(lookupXml)

  const emittedIds = new Set<string>()

  // Stack-based extraction of <selectionEntry> to handle nested entries correctly.
  // The regex approach fails when <selectionEntry> elements are nested (the non-greedy
  // match captures the inner closing tag instead of the outer one).
  for (const entry of extractSelectionEntries(emissionXml)) {
    const type = extractAttr(entry.attrs, 'type')
    if (type !== 'unit' && type !== 'model') continue
    // Skip shared sub-models — these are components referenced by units via entryLink,
    // not standalone units. Keep type="unit" from shared sections (legitimate reusable units).
    if (type === 'model' && entry.isShared) continue

    const id = extractAttr(entry.attrs, 'id')
    const name = extractAttr(entry.attrs, 'name')
    if (!id || !name) continue

    // Skip Crucible (narrative/Crusade) entries — not playable units
    if (name.includes('[Crucible]')) continue

    try {
      // Enrich the body by resolving <infoLink> and <entryLink> references
      const enrichedBody = enrichBody(
        entry.fullBody,
        profileMap,
        entryMap,
        selectionEntryGroupMap,
        infoGroupMap,
      )
      const enrichedStripped = stripNestedSelectionEntries(enrichedBody)
      const unit = parseUnitEntry(
        id,
        name,
        faction,
        enrichedStripped,
        enrichedBody,
        importingCatalogueId,
      )
      // Validate parsed data and add warnings for suspicious values
      validateUnit(unit, errors)
      units.push(unit)
      emittedIds.add(id)
    } catch (err) {
      errors.push(`Failed to parse unit "${name}" (${id}): ${String(err)}`)
    }
  }

  // 11e chapter catalogs (Imperium - Ultramarines.cat etc.) declare characters as
  // top-level `<entryLink type="selectionEntry" targetId="…">` that resolves into a
  // `<selectionEntry type="model">` in `<sharedSelectionEntries>` of the chapter
  // catalog or its imported library. Those targets are filtered out above by the
  // "shared sub-model" rule, so without this pass every chapter-defined character
  // (Captain Sicarius, Captain Titus, Chaplain Cassius, …) is dropped.
  //
  // We treat each top-level entryLink as a synthetic unit: the entryLink's `name`
  // is the display name (the link can override the target's name, e.g. Lieutenant
  // Titus → Captain Titus), the entryLink's `id` is the unit id (locally scoped
  // to this catalog), and the target's body is the source of stats/weapons.
  for (const link of extractTopLevelEntryLinks(emissionXml)) {
    if (link.type !== 'selectionEntry') continue
    if (!link.id || !link.targetId) continue
    if (emittedIds.has(link.id)) continue

    const targetAttrs = entryAttrsMap.get(link.targetId)
    const targetBody = entryMap.get(link.targetId)
    if (!targetAttrs || targetBody === undefined) continue

    const targetType = extractAttr(targetAttrs, 'type')
    if (targetType !== 'unit' && targetType !== 'model') continue

    // Display name: prefer the entryLink's name attribute (the link can override
    // the target's name); fall back to the target's name when the link has none.
    const displayName = link.name || extractAttr(targetAttrs, 'name')
    if (!displayName) continue
    if (displayName.includes('[Crucible]')) continue

    try {
      const enrichedBody = enrichBody(
        targetBody,
        profileMap,
        entryMap,
        selectionEntryGroupMap,
        infoGroupMap,
      )
      const enrichedStripped = stripNestedSelectionEntries(enrichedBody)
      const unit = parseUnitEntry(
        link.id,
        displayName,
        faction,
        enrichedStripped,
        enrichedBody,
        importingCatalogueId,
      )
      validateUnit(unit, errors)
      units.push(unit)
      emittedIds.add(link.id)
    } catch (err) {
      errors.push(`Failed to parse entryLink unit "${displayName}" (${link.id}): ${String(err)}`)
    }
  }

  return { units, subfactions, errors }
}

function extractCatalogueId(xml: string): string | undefined {
  const m = /<catalogue\b[^>]*?\bid="([^"]+)"/i.exec(xml)
  return m?.[1]
}

/** Find every `<catalogueLink importRootEntries="true">` and return its targetId. */
function findRootEntryImports(xml: string): string[] {
  const ids: string[] = []
  const pattern = /<catalogueLink\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(xml)) !== null) {
    const tag = m[0]
    if (!/\bimportRootEntries="true"/i.test(tag)) continue
    const targetId = /\btargetId="([^"]+)"/i.exec(tag)?.[1]
    if (targetId) ids.push(targetId)
  }
  return ids
}

/** Find every `<catalogueLink>` regardless of `importRootEntries` and return its targetId. */
function findAllCatalogueImports(xml: string): string[] {
  const ids: string[] = []
  const pattern = /<catalogueLink\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(xml)) !== null) {
    const targetId = /\btargetId="([^"]+)"/i.exec(m[0])?.[1]
    if (targetId) ids.push(targetId)
  }
  return ids
}

/** Whether the catalogue declared in `xml` has `library="true"` on its opening tag. */
function isLibraryCatalogue(xml: string): boolean {
  const m = /<catalogue\b[^>]*>/i.exec(xml)
  if (!m) return false
  return /\blibrary="true"/i.test(m[0])
}

/**
 * Transitively concatenate `xml` with every catalog reached via any
 * `<catalogueLink>` (regardless of `importRootEntries`). Used to build the
 * lookup XML — entry/profile/group maps see definitions in every reachable
 * catalog so top-level `<entryLink>` resolution and `enrichBody` work even when
 * the wrapper imports a parent library without setting `importRootEntries="true"`
 * (the `Aeldari - Drukhari.cat` / `Aeldari - Aeldari Library.cat` pairing).
 *
 * `visited` carries catalog IDs already pulled in to break import cycles.
 */
function mergeAllCatalogueImports(
  xml: string,
  registry: CatalogRegistry,
  visited: Set<string>,
): string {
  const localId = extractCatalogueId(xml)
  if (localId) visited.add(localId)
  let merged = xml
  for (const targetId of findAllCatalogueImports(xml)) {
    if (visited.has(targetId)) continue
    const target = registry.get(targetId)
    if (!target) continue
    merged += '\n' + mergeAllCatalogueImports(target.xml, registry, visited)
  }
  return merged
}

/**
 * Transitively concatenate `xml` with every catalog reached via
 * `<catalogueLink importRootEntries="true">`, EXCLUDING catalogs declared
 * `library="true"`. Used to build the emission XML — `extractSelectionEntries`
 * and `extractTopLevelEntryLinks` only see the wrapper plus non-library
 * parent catalogs.
 *
 * Library catalogs are parsed independently under their own faction string, so
 * re-emitting their `<selectionEntries>` roots into every importing wrapper
 * produces duplicates and (for wrappers that import multiple unrelated
 * libraries — `Chaos - Chaos Knights.cat`, `Chaos - Chaos Daemons.cat`)
 * cross-faction pollution where one faction's wrapper output is dominated by
 * another faction's units. Excluding library catalogs from the emission stream
 * keeps the wrapper's faction string honest. Non-library imports (e.g.
 * `Imperium - Space Marines` imported by chapter wrappers) still flow through
 * unchanged so the established SM chapter-inherits-roster pattern keeps
 * working.
 *
 * `visited` carries catalog IDs already pulled in to break import cycles.
 */
function mergeRootEntryImports(
  xml: string,
  registry: CatalogRegistry,
  visited: Set<string>,
): string {
  const localId = extractCatalogueId(xml)
  if (localId) visited.add(localId)
  let merged = xml
  for (const targetId of findRootEntryImports(xml)) {
    if (visited.has(targetId)) continue
    const target = registry.get(targetId)
    if (!target) continue
    if (isLibraryCatalogue(target.xml)) {
      // Mark as visited so transitive importRootEntries cycles still terminate,
      // but don't merge the body — its units belong to its own faction parse.
      const skipId = extractCatalogueId(target.xml)
      if (skipId) visited.add(skipId)
      continue
    }
    merged += '\n' + mergeRootEntryImports(target.xml, registry, visited)
  }
  return merged
}

/**
 * Extract subfaction upgrade entries (Chapters / Dynasties / Craftworlds / …)
 * from a BSData catalog. Subfactions live inside `<selectionEntryGroup name="X">`
 * where X is one of the established faction-grouping names (see
 * SUBFACTION_GROUP_NAMES); each child `<selectionEntry type="upgrade">` is one
 * subfaction with stable BSData id + display name.
 */
function extractSubfactions(xml: string, faction: string): Subfaction[] {
  const subfactions: Subfaction[] = []
  const seen = new Set<string>()
  for (const groupName of SUBFACTION_GROUP_NAMES) {
    const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const groupPattern = new RegExp(
      `<selectionEntryGroup\\b[^>]*\\bname="${escaped}"[^>]*>([\\s\\S]*?)</selectionEntryGroup>`,
      'g',
    )
    let gm: RegExpExecArray | null
    while ((gm = groupPattern.exec(xml)) !== null) {
      const body = gm[1] ?? ''
      const entryPattern = /<selectionEntry\b([^>]*?)\/?>/g
      let em: RegExpExecArray | null
      while ((em = entryPattern.exec(body)) !== null) {
        const attrs = em[1] ?? ''
        if (extractAttr(attrs, 'type') !== 'upgrade') continue
        const id = extractAttr(attrs, 'id')
        const name = extractAttr(attrs, 'name')
        if (!id || !name) continue
        if (seen.has(id)) continue
        seen.add(id)
        subfactions.push({ id, name, faction, groupName })
      }
    }
  }
  return subfactions
}

/**
 * Validate a parsed unit and add warnings for suspicious/impossible values.
 * Warnings don't prevent the unit from being stored — they inform the user.
 */
function validateUnit(unit: UnitProfile, errors: string[]): void {
  if (unit.toughness === 0) {
    errors.push(`${unit.name}: Toughness is 0 (missing characteristic data)`)
  }
  if (unit.save === 0) {
    errors.push(`${unit.name}: Save is 0 (missing characteristic data)`)
  }
  if (unit.weapons.length === 0) {
    errors.push(`${unit.name}: No weapons found`)
  }
  for (const w of unit.weapons) {
    if (w.strength === 0) {
      errors.push(`${unit.name}: Weapon "${w.name}" has Strength 0 (missing data)`)
    }
    if (typeof w.attacks === 'number' && w.attacks === 0) {
      errors.push(`${unit.name}: Weapon "${w.name}" has 0 attacks (missing data)`)
    }
  }
}

// ---- Link resolution ----
// BSData XML uses <infoLink> and <entryLink> to reference shared definitions
// (profiles, weapons, models) elsewhere in the file. These must be resolved
// to find characteristics and weapons for units whose data is not inline.

/**
 * Build a map of all <profile> elements by ID from the full XML.
 * Includes the full <profile>...</profile> XML for injection.
 */
function buildProfileMap(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /<profile\b([^>]*)>([\s\S]*?)<\/profile>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(xml)) !== null) {
    const id = extractStandaloneAttr(m[1] ?? '', 'id')
    if (id) {
      map.set(id, m[0])
    }
  }
  return map
}

/**
 * Build maps of all <selectionEntry> bodies + opening attributes by ID from the
 * full XML. Uses stack-based matching to correctly handle nesting.
 *
 * - `entryMap`: entry ID → inner body content (between open/close tags)
 * - `entryAttrsMap`: entry ID → opening-tag attribute string (so callers that
 *   need to inspect the entry's `type`/`name` can do so without re-scanning)
 *
 * Both maps treat the first occurrence of an id as canonical (matches the
 * BSData convention where shared entries are unique by id).
 */
function buildEntryMaps(xml: string): {
  entryMap: Map<string, string>
  entryAttrsMap: Map<string, string>
} {
  const entryMap = new Map<string, string>()
  const entryAttrsMap = new Map<string, string>()
  const openTag = /<selectionEntry\b([^>]*)>/g
  const closeTag = /<\/selectionEntry>/g

  type TagPos =
    | { type: 'open'; index: number; end: number; attrs: string }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: m[1] ?? '' })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  tags.sort((a, b) => a.index - b.index)

  const stack: Array<{ attrs: string; bodyStart: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      stack.push({ attrs: tag.attrs, bodyStart: tag.end })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      const id = extractAttr(entry.attrs, 'id')
      if (id && !entryMap.has(id)) {
        entryMap.set(id, xml.slice(entry.bodyStart, tag.index))
        entryAttrsMap.set(id, entry.attrs)
      }
    }
  }

  return { entryMap, entryAttrsMap }
}

/**
 * Build a map of all <selectionEntryGroup> bodies by ID from the full XML.
 * Uses stack-based matching to correctly handle nesting.
 * Maps group ID → inner body content (between open/close tags).
 */
function buildSelectionEntryGroupMap(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  const openTag = /<selectionEntryGroup\b([^>]*)>/g
  const closeTag = /<\/selectionEntryGroup>/g

  type TagPos =
    | { type: 'open'; index: number; end: number; attrs: string }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: m[1] ?? '' })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  tags.sort((a, b) => a.index - b.index)

  const stack: Array<{ attrs: string; bodyStart: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      stack.push({ attrs: tag.attrs, bodyStart: tag.end })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      const id = extractAttr(entry.attrs, 'id')
      if (id && !map.has(id)) {
        map.set(id, xml.slice(entry.bodyStart, tag.index))
      }
    }
  }

  return map
}

/**
 * Build a map of all <infoGroup> bodies by ID from the full XML.
 * Maps group ID → inner content (between open/close tags).
 */
function buildInfoGroupMap(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  const openTag = /<infoGroup\b([^>]*)>/g
  const closeTag = /<\/infoGroup>/g

  type TagPos =
    | { type: 'open'; index: number; end: number; attrs: string }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: m[1] ?? '' })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  tags.sort((a, b) => a.index - b.index)

  const stack: Array<{ attrs: string; bodyStart: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      stack.push({ attrs: tag.attrs, bodyStart: tag.end })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      const id = extractAttr(entry.attrs, 'id')
      if (id && !map.has(id)) {
        map.set(id, xml.slice(entry.bodyStart, tag.index))
      }
    }
  }

  return map
}

/**
 * Enrich a unit's body by resolving <infoLink>, <entryLink>, and group references.
 * Appends resolved profile/entry/group content so that extractCharacteristics and
 * extractWeapons can find stats and weapons from shared definitions.
 */
function enrichBody(
  body: string,
  profileMap: Map<string, string>,
  entryMap: Map<string, string>,
  selectionEntryGroupMap: Map<string, string>,
  infoGroupMap: Map<string, string>,
  depth = 0,
  // Shared across the recursion so an id resolved at any depth is never
  // re-expanded. Pre-11e the entryMap held one chapter and the fan-out was
  // modest; after 1ae2952 it includes the whole imported library (SM, Aeldari,
  // …) and shared entries cross-reference each other heavily — without a
  // shared resolved set the body string explodes (N^depth) and runSync hits
  // the Worker CPU/wall-clock cap deterministically at ~12s.
  resolved: Set<string> = new Set(),
): string {
  if (depth > 5) return body // prevent infinite recursion

  let extra = ''

  // Resolve <infoLink type="profile" targetId="X"> → inject the profile XML
  const infoLinkProfilePattern = /<infoLink\b[^>]*type="profile"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = infoLinkProfilePattern.exec(body)) !== null) {
    const targetId = extractAttr(m[0], 'targetId')
    if (targetId && !resolved.has(targetId)) {
      resolved.add(targetId)
      const profileXml = profileMap.get(targetId)
      if (profileXml) {
        extra += '\n' + profileXml
      }
    }
  }

  // Resolve <infoLink type="infoGroup" targetId="X"> → inject the infoGroup content
  const infoLinkGroupPattern = /<infoLink\b[^>]*type="infoGroup"[^>]*>/gi
  while ((m = infoLinkGroupPattern.exec(body)) !== null) {
    const targetId = extractAttr(m[0], 'targetId')
    if (targetId && !resolved.has(targetId)) {
      resolved.add(targetId)
      const groupContent = infoGroupMap.get(targetId)
      if (groupContent) {
        // Recursively enrich — infoGroups may contain <infoLink type="profile">
        const enrichedGroup = enrichBody(
          groupContent,
          profileMap,
          entryMap,
          selectionEntryGroupMap,
          infoGroupMap,
          depth + 1,
          resolved,
        )
        extra += '\n' + enrichedGroup
      }
    }
  }

  // Resolve <entryLink ... targetId="X"> → inject the target entry's body or group body
  const entryLinkPattern = /<entryLink\b[^>]*>/gi
  while ((m = entryLinkPattern.exec(body)) !== null) {
    const targetId = extractAttr(m[0], 'targetId')
    if (targetId && !resolved.has(targetId)) {
      resolved.add(targetId)
      // Check entryMap first, then selectionEntryGroupMap as fallback
      const entryBody = entryMap.get(targetId) ?? selectionEntryGroupMap.get(targetId)
      if (entryBody) {
        // Recursively enrich the entry's body to resolve nested references
        const enrichedEntry = enrichBody(
          entryBody,
          profileMap,
          entryMap,
          selectionEntryGroupMap,
          infoGroupMap,
          depth + 1,
          resolved,
        )
        extra += '\n' + enrichedEntry
      }
    }
  }

  return body + extra
}

/**
 * Find all <sharedSelectionEntries> ranges in the XML.
 * Returns an array of { start, end } positions.
 */
function findSharedSelectionEntryRanges(xml: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const openTag = /<sharedSelectionEntries\b[^>]*>/gi
  const closeTag = /<\/sharedSelectionEntries>/gi

  const opens: number[] = []
  const closes: number[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) opens.push(m.index)
  while ((m = closeTag.exec(xml)) !== null) closes.push(m.index + m[0].length)

  for (let i = 0; i < opens.length && i < closes.length; i++) {
    ranges.push({ start: opens[i]!, end: closes[i]! })
  }
  return ranges
}

/**
 * Stack-based extraction of top-level <selectionEntry> elements from XML.
 * Nested entries (e.g. type="model" inside a type="unit") are excluded — only
 * entries pushed when the stack is empty (depth 0) are emitted.
 * Nested <selectionEntry> blocks are stripped from the body so that
 * extractWeapons() only finds the outer unit's own weapons.
 *
 * Returns `isShared` flag indicating whether the entry is within <sharedSelectionEntries>.
 */
function extractSelectionEntries(
  xml: string,
): Array<{ attrs: string; body: string; fullBody: string; isShared: boolean }> {
  const results: Array<{ attrs: string; body: string; fullBody: string; isShared: boolean }> = []
  const sharedRanges = findSharedSelectionEntryRanges(xml)
  const openTag = /<selectionEntry\b([^>]*)>/g
  const closeTag = /<\/selectionEntry>/g

  // Find all open and close tag positions
  type TagPos =
    | { type: 'open'; index: number; end: number; attrs: string }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    // Skip self-closing tags like <selectionEntry ... />
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: m[1] ?? '' })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  // Sort by position in the document
  tags.sort((a, b) => a.index - b.index)

  // Stack-based matching: pair each open tag with its matching close tag.
  // Only emit entries that were opened at depth 0 (stack empty before push).
  const stack: Array<{ attrs: string; bodyStart: number; depth: number; position: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      const depth = stack.length
      stack.push({ attrs: tag.attrs, bodyStart: tag.end, depth, position: tag.index })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      if (entry.depth === 0) {
        const fullBody = xml.slice(entry.bodyStart, tag.index)
        const isShared = sharedRanges.some(
          (r) => entry.position >= r.start && entry.position < r.end,
        )
        results.push({
          attrs: entry.attrs,
          body: stripNestedSelectionEntries(fullBody),
          fullBody,
          isShared,
        })
      }
    }
  }

  return results
}

/**
 * Extract every `<entryLink ...>` that lives at the top level of the catalog —
 * i.e. NOT nested inside a `<selectionEntry>` body (those are already followed
 * by {@link enrichBody}). 11e chapter catalogs declare characters this way:
 *
 *   <entryLink import="true" name="Captain Sicarius" type="selectionEntry"
 *              id="<local-id>" targetId="<shared-model-id>"/>
 *
 * The link's `name` can override the target's name (e.g. Lieutenant Titus links
 * the Captain Titus body), so we surface it alongside the link id and targetId.
 */
function extractTopLevelEntryLinks(xml: string): Array<{
  id: string
  name: string
  type: string
  targetId: string
}> {
  const results: Array<{ id: string; name: string; type: string; targetId: string }> = []

  // Build the set of byte ranges occupied by top-level (and nested) selectionEntry
  // bodies. Any entryLink whose start index falls inside one of these ranges is
  // nested-inside-a-selectionEntry and must be skipped — enrichBody handles it.
  const selectionEntryRanges = findSelectionEntryRanges(xml)

  const entryLinkPattern = /<entryLink\b([^>]*)\/?>/gi
  let m: RegExpExecArray | null
  while ((m = entryLinkPattern.exec(xml)) !== null) {
    // Skip if this entryLink sits inside any selectionEntry body.
    if (selectionEntryRanges.some((r) => m!.index >= r.start && m!.index < r.end)) continue

    const attrs = m[1] ?? ''
    const type = extractAttr(attrs, 'type')
    const id = extractAttr(attrs, 'id')
    const name = extractAttr(attrs, 'name')
    const targetId = extractAttr(attrs, 'targetId')
    results.push({ id, name, type, targetId })
  }

  return results
}

/**
 * Find every `<selectionEntry>...</selectionEntry>` byte range in `xml`. Ranges
 * cover the inner body (between the open-tag end and close-tag start). Used to
 * decide whether an entryLink is "top-level" (outside every range) or nested
 * inside a selectionEntry body.
 */
function findSelectionEntryRanges(xml: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const openTag = /<selectionEntry\b[^>]*>/g
  const closeTag = /<\/selectionEntry>/g

  type TagPos =
    | { type: 'open'; index: number; end: number }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  tags.sort((a, b) => a.index - b.index)

  const stack: Array<{ bodyStart: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      stack.push({ bodyStart: tag.end })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      ranges.push({ start: entry.bodyStart, end: tag.index })
    }
  }

  return ranges
}

/**
 * Remove all nested <selectionEntry>...</selectionEntry> blocks from a body string.
 * Uses the same stack-based approach to correctly handle nesting.
 */
function stripNestedSelectionEntries(body: string): string {
  const openTag = /<selectionEntry\b[^>]*>/g
  const closeTag = /<\/selectionEntry>/g

  type TagPos =
    | { type: 'open'; index: number; end: number }
    | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(body)) !== null) {
    if (m[0].endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length })
  }
  while ((m = closeTag.exec(body)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  if (tags.length === 0) return body

  tags.sort((a, b) => a.index - b.index)

  // Find ranges of top-level <selectionEntry>...</selectionEntry> blocks to remove
  const ranges: Array<{ start: number; end: number }> = []
  const stack: Array<{ start: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      if (stack.length === 0) {
        stack.push({ start: tag.index })
      } else {
        stack.push({ start: -1 }) // nested, don't track start
      }
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      if (stack.length === 0 && entry.start >= 0) {
        ranges.push({ start: entry.start, end: tag.end })
      }
    }
  }

  // Remove ranges from end to start to preserve indices
  let result = body
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i]!
    result = result.slice(0, start) + result.slice(end)
  }

  return result
}

function parseUnitEntry(
  id: string,
  name: string,
  faction: string,
  body: string,
  fullBody: string,
  importingCatalogueId?: string,
): UnitProfile {
  // Extract characteristics from fullBody (includes nested model entries).
  // Real BSData XML puts the unit profile inside nested <selectionEntry type="model"> blocks,
  // which are stripped from `body`. Using fullBody ensures characteristics are found.
  const stats = extractCharacteristics(fullBody)
  // Extract weapons from fullBody (includes nested model entries) and deduplicate by name.
  // Real BSData XML puts weapons inside nested <selectionEntry type="model"> blocks.
  const allWeapons = extractWeapons(fullBody)
  const seen = new Set<string>()
  const weapons: WeaponProfile[] = []
  for (const w of allWeapons) {
    if (!seen.has(w.name)) {
      seen.add(w.name)
      weapons.push(w)
    }
  }
  const abilities = extractAbilityNames(body)
  const abilityDescriptions = extractAbilityDescriptions(body)
  const points = extractPoints(body, importingCatalogueId)
  const repeatCost = extractRepeatCost(body, importingCatalogueId)
  const invulnSave = extractInvulnerableSave(body)
  const fnp = extractFeelNoPain(body, abilityDescriptions)

  const unit: UnitProfile = {
    id,
    faction,
    name,
    move: parseStatNumber(stats['M'] ?? stats['Move'] ?? '0'),
    toughness: parseStatNumber(stats['T'] ?? stats['Toughness'] ?? '0'),
    save: parseStatNumber(stats['Sv'] ?? stats['SV'] ?? stats['Save'] ?? '0'),
    wounds: parseStatNumber(stats['W'] ?? stats['Wounds'] ?? '1'),
    leadership: parseStatNumber(stats['Ld'] ?? stats['LD'] ?? stats['Leadership'] ?? '6'),
    oc: parseStatNumber(stats['OC'] ?? stats['Objective Control'] ?? '1'),
    weapons,
    abilities,
    points,
  }

  if (invulnSave !== undefined) unit.invulnSave = invulnSave
  if (fnp !== undefined) unit.fnp = fnp
  if (Object.keys(abilityDescriptions).length > 0) unit.abilityDescriptions = abilityDescriptions
  if (repeatCost !== undefined) unit.repeatCost = repeatCost
  if (name.includes('[Legends]')) unit.isLegends = true

  return unit
}

// ---- Characteristic extraction ----

function extractCharacteristics(body: string): Record<string, string> {
  const stats: Record<string, string> = {}

  const profilePattern =
    /<profile\b[^>]*type(?:Name)?="(?:Unit|Model)(?:\s*Characteristics?)?"[^>]*>([\s\S]*?)<\/profile>/gi
  const profileMatch = profilePattern.exec(body)
  if (!profileMatch) return stats

  const charPattern = /<characteristic\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/characteristic>/g
  let m: RegExpExecArray | null
  while ((m = charPattern.exec(profileMatch[1] ?? '')) !== null) {
    stats[m[1]!.trim()] = m[2]!.trim()
  }

  return stats
}

// ---- Weapon extraction ----

function extractWeapons(body: string): WeaponProfile[] {
  const weapons: WeaponProfile[] = []

  // Capture the typeName value as group 2 so we can test ranged vs melee
  const profilePattern =
    /<profile\b([^>]*)type(?:Name)?="(Ranged Weapons?|Melee Weapons?|Weapon)"([^>]*)>([\s\S]*?)<\/profile>/gi
  let m: RegExpExecArray | null

  while ((m = profilePattern.exec(body)) !== null) {
    const allAttrs = (m[1] ?? '') + (m[3] ?? '')
    const typeName = m[2] ?? ''
    const profileBody = m[4] ?? ''
    const weaponName = extractAttr(allAttrs, 'name')
    if (!weaponName) continue

    const isRanged = /Ranged/i.test(typeName)
    const stats = extractWeaponCharacteristics(profileBody)
    const abilityNames = extractWeaponAbilityNames(profileBody)

    const rangeValue = isRanged ? parseRangeValue(stats['Range'] ?? '0') : 'melee'

    weapons.push({
      name: weaponName,
      range: rangeValue,
      attacks: parseDiceOrNumber(stats['A'] ?? stats['Attacks'] ?? '1'),
      skill: parseStatNumber(stats['BS'] ?? stats['WS'] ?? stats['Skill'] ?? '4'),
      strength: parseStatNumber(stats['S'] ?? stats['Strength'] ?? '4'),
      ap: parseStatNumber(stats['AP'] ?? '0'),
      damage: parseDiceOrNumber(stats['D'] ?? stats['Damage'] ?? '1'),
      abilities: mapAbilityNames(abilityNames),
    })
  }

  return weapons
}

function extractWeaponCharacteristics(profileBody: string): Record<string, string> {
  const stats: Record<string, string> = {}
  const charPattern = /<characteristic\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/characteristic>/g
  let m: RegExpExecArray | null
  while ((m = charPattern.exec(profileBody)) !== null) {
    stats[m[1]!.trim()] = m[2]!.trim()
  }
  return stats
}

function extractWeaponAbilityNames(profileBody: string): string[] {
  const statsObj = extractWeaponCharacteristics(profileBody)
  // Check multiple characteristic names BSData might use for weapon abilities
  const abilityText =
    statsObj['Abilities'] ??
    statsObj['Special Rules'] ??
    statsObj['Keywords'] ??
    statsObj['Special'] ??
    statsObj['Rules Text'] ??
    statsObj['Type'] ??
    ''
  if (!abilityText) return []
  return (
    abilityText
      .split(/[,;—–]/) // Split on commas, semicolons, em-dashes, en-dashes
      .map((s) => s.trim())
      // Strip square brackets: [TORRENT] → TORRENT
      .map((s) => s.replace(/^\[(.+)\]$/, '$1'))
      // Strip trailing periods: "Lethal Hits." → "Lethal Hits"
      .map((s) => s.replace(/\.+$/, ''))
      .filter((s) => s.length > 0 && s !== '-' && s !== 'N/A')
  )
}

// ---- Ability name + description extraction ----

// Profile typeNames that are NOT abilities. Everything else with a profile
// name attribute is treated as an ability — that's what the 11e BSData
// parsing reference recommends, so we don't have to maintain a positive list
// that grows with every faction-specific ability category (Orders, Rituals,
// C'tan Powers, Triarch Abilities, Force Disposition, Marks of Chaos,
// Blessings of Khorne, epic-hero specific typeNames like Warmaster, etc.).
const NON_ABILITY_TYPE_NAMES = new Set([
  'unit',
  'unit characteristics',
  'model',
  'model characteristics',
  'ranged weapon',
  'ranged weapons',
  'melee weapon',
  'melee weapons',
  'weapon',
  'transport',
  'invulnerable save',
  // Crusade-only metadata — not matched-play abilities.
  'deed',
  'quality',
  'threat',
  'archeotech curiosity',
])

function isAbilityTypeName(typeName: string): boolean {
  return !NON_ABILITY_TYPE_NAMES.has(typeName.trim().toLowerCase())
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractAbilityNames(body: string): string[] {
  const names: string[] = []
  const tagPattern = /<profile\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = tagPattern.exec(body)) !== null) {
    const attrs = m[1] ?? ''
    const typeMatch = /\btype(?:Name)?="([^"]+)"/i.exec(attrs)
    if (!typeMatch) continue
    if (!isAbilityTypeName(typeMatch[1]!)) continue
    const nameMatch = /\bname="([^"]+)"/i.exec(attrs)
    if (nameMatch) names.push(decodeXmlEntities(nameMatch[1]!.trim()))
  }
  return names
}

function extractAbilityDescriptions(body: string): Record<string, string> {
  const descriptions: Record<string, string> = {}
  const profilePattern = /<profile\b([^>]*)>([\s\S]*?)<\/profile>/gi
  let m: RegExpExecArray | null
  while ((m = profilePattern.exec(body)) !== null) {
    const attrs = m[1] ?? ''
    const typeMatch = /\btype(?:Name)?="([^"]+)"/i.exec(attrs)
    if (!typeMatch) continue
    if (!isAbilityTypeName(typeMatch[1]!)) continue
    const profileBody = m[2] ?? ''
    const nameMatch = /\bname="([^"]+)"/i.exec(attrs)
    if (!nameMatch) continue
    const abilityName = decodeXmlEntities(nameMatch[1]!.trim())
    // Faction-specific ability typeNames (Warmaster, Throttlerokkit Shokka Engine,
    // …) sometimes use characteristic name="Ability" instead of "Description".
    const descPattern =
      /<characteristic\b[^>]*name="(?:Description|Ability)"[^>]*>([\s\S]*?)<\/characteristic>/i
    const descMatch = descPattern.exec(profileBody)
    if (descMatch && descMatch[1]?.trim()) {
      descriptions[abilityName] = decodeXmlEntities(descMatch[1].trim())
    }
  }
  return descriptions
}

// ---- Invulnerable save extraction ----

function extractInvulnerableSave(body: string): number | undefined {
  // Look for <profile typeName="Invulnerable Save"> with characteristic value
  const profilePattern =
    /<profile\b[^>]*type(?:Name)?="Invulnerable Save"[^>]*>([\s\S]*?)<\/profile>/gi
  let m: RegExpExecArray | null
  while ((m = profilePattern.exec(body)) !== null) {
    const charPattern = /<characteristic\b[^>]*>([\s\S]*?)<\/characteristic>/gi
    let c: RegExpExecArray | null
    while ((c = charPattern.exec(m[1] ?? '')) !== null) {
      const val = parseStatNumber(c[1]?.trim() ?? '')
      if (val >= 2 && val <= 6) return val
    }
  }

  // Fallback: multiple patterns for invuln text in body
  // "X+ invulnerable save", "invulnerable save of X+", "invulnerable save (X+)"
  const patterns = [
    /(\d)\+\s*invulnerable\s+save/i,
    /invulnerable\s+save\s+(?:of\s+)?(\d)\+/i,
    /invulnerable\s+save\s*\(\s*(\d)\+\s*\)/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(body)
    if (match) {
      const val = parseInt(match[1]!)
      if (val >= 2 && val <= 6) return val
    }
  }

  return undefined
}

// ---- Feel No Pain extraction ----

function extractFeelNoPain(
  body: string,
  abilityDescriptions: Record<string, string>,
): number | undefined {
  // Multiple FNP text patterns: "Feel No Pain X+", "Feel No Pain (X+)", "has a X+ FNP"
  const fnpPatterns = [
    /feel\s+no\s+pain\s+(\d)\+/i,
    /feel\s+no\s+pain\s*\(\s*(\d)\+\s*\)/i,
    /(\d)\+\s*feel\s+no\s+pain/i,
  ]

  // Check ability descriptions first
  for (const desc of Object.values(abilityDescriptions)) {
    for (const pattern of fnpPatterns) {
      const match = pattern.exec(desc)
      if (match) {
        const val = parseInt(match[1]!)
        if (val >= 2 && val <= 6) return val
      }
    }
  }

  // Fallback: search raw body for FNP profile or description
  for (const pattern of fnpPatterns) {
    const match = pattern.exec(body)
    if (match) {
      const val = parseInt(match[1]!)
      if (val >= 2 && val <= 6) return val
    }
  }

  return undefined
}

// ---- Points extraction ----

function extractPoints(body: string, importingCatalogueId?: string): number {
  const basePts = extractBaseCost(body)
  if (!importingCatalogueId) return basePts
  const override = extractChapterCostOverride(body, importingCatalogueId)
  return override ?? basePts
}

function extractBaseCost(body: string): number {
  const costPattern = /<cost\b[^>]*name="pts"[^>]*value="([^"]+)"/i
  const m = costPattern.exec(body)
  if (!m) return 0
  return Math.round(parseFloat(m[1] ?? '0'))
}

/**
 * 11e encodes a per-roster repeat-cost surcharge as:
 *
 *   <modifier type="increment" field="<PTS_TYPE_ID>" value="<Δ>">
 *     <comment>repeat-cost: threshold=N delta=Δ …</comment>
 *     <conditions>
 *       <condition type="atLeast" value="N+1" field="selections"
 *                  scope="roster" childId="<datasheet-id>"/>
 *     </conditions>
 *   </modifier>
 *
 * Copies past the Nth each cost `points + Δ` instead of `points`. We surface
 * `{threshold, delta}` so consumers (list-builder, brain) can compute roster
 * totals. The threshold and delta come from the comment marker, which is the
 * documented surface in editor/REPEAT_COST_APP_PROMPT.md.
 *
 * Compound conditions: a unit may carry both a chapter-conditioned modifier
 * (e.g. BA-only) and a default modifier on the same datasheet. The modifier
 * is "chapter-specific" when it has a `primary-catalogue instanceOf` condition.
 * We accept a modifier when either (a) no primary-catalogue condition is
 * present (default), or (b) the primary-catalogue childId matches the importing
 * catalogue. Chapter-specific matches beat the default; modifiers gated to a
 * different chapter are skipped so a BA repeat-cost never leaks into UM.
 */
function extractRepeatCost(
  body: string,
  importingCatalogueId: string | undefined,
): { threshold: number; delta: number } | undefined {
  const modifierPattern = new RegExp(
    `<modifier\\b[^>]*\\btype="increment"[^>]*\\bfield="${PTS_TYPE_ID}"[^>]*\\bvalue="([^"]+)"[^>]*>([\\s\\S]*?)</modifier>`,
    'gi',
  )
  let defaultMatch: { threshold: number; delta: number } | undefined
  let chapterMatch: { threshold: number; delta: number } | undefined
  let m: RegExpExecArray | null
  while ((m = modifierPattern.exec(body)) !== null) {
    const delta = Math.round(parseFloat(m[1] ?? ''))
    if (!Number.isFinite(delta)) continue
    const modifierBody = m[2] ?? ''
    const commentMatch = /<comment\b[^>]*>\s*repeat-cost:\s*threshold=(\d+)\s+delta=(\d+)/i.exec(
      modifierBody,
    )
    if (!commentMatch) continue
    const threshold = parseInt(commentMatch[1]!, 10)

    const primaryCatalogueChildId = extractPrimaryCatalogueChildId(modifierBody)
    if (primaryCatalogueChildId === undefined) {
      // Default modifier (no chapter gate). Keep the first one we see — there is
      // only ever supposed to be one default per datasheet in BSData.
      defaultMatch ??= { threshold, delta }
      continue
    }
    if (importingCatalogueId && primaryCatalogueChildId === importingCatalogueId) {
      chapterMatch = { threshold, delta }
      // Don't break: a later chapter-specific modifier for the same chapter
      // would be a BSData bug, but we still want to detect the case
      // deterministically (last one wins matches the BSData evaluation order).
    }
    // else: modifier is gated to a different chapter — skip silently.
  }
  return chapterMatch ?? defaultMatch
}

/**
 * Return the `childId` of a `primary-catalogue instanceOf` condition inside a
 * modifier body, or undefined if the modifier has no such condition. Compound
 * modifiers (chapter + size-tier atLeast) carry both a primary-catalogue gate
 * and an atLeast condition; this picks the chapter gate and ignores the rest.
 */
function extractPrimaryCatalogueChildId(modifierBody: string): string | undefined {
  const condPattern = /<condition\b([^/>]*)\/?>/gi
  let c: RegExpExecArray | null
  while ((c = condPattern.exec(modifierBody)) !== null) {
    const attrs = c[1] ?? ''
    const scope = /\bscope="([^"]+)"/i.exec(attrs)?.[1]
    if (scope !== 'primary-catalogue') continue
    const childId = /\bchildId="([^"]+)"/i.exec(attrs)?.[1]
    if (childId) return childId
  }
  return undefined
}

/**
 * 11e SM library uses chapter-cost modifiers to override a unit's base points
 * when the army's primary catalogue is a specific chapter:
 *
 *   <modifier type="set" field="<PTS_TYPE_ID>" value="80">
 *     <comment>chapter-cost: BA …</comment>
 *     <conditions>
 *       <condition type="instanceOf" scope="primary-catalogue"
 *                  field="selections" childId="<chapter-catalogue-id>"/>
 *     </conditions>
 *   </modifier>
 *
 * If exactly one such modifier on the unit has a single primary-catalogue
 * condition whose childId equals our importing catalogue id, return its
 * value as the effective cost. Skip modifiers with compound conditions —
 * those require full modifier evaluation we don't do yet.
 */
function extractChapterCostOverride(
  body: string,
  importingCatalogueId: string,
): number | undefined {
  const modifierPattern = new RegExp(
    `<modifier\\b[^>]*\\btype="set"[^>]*\\bfield="${PTS_TYPE_ID}"[^>]*\\bvalue="([^"]+)"[^>]*>([\\s\\S]*?)</modifier>`,
    'gi',
  )
  let m: RegExpExecArray | null
  while ((m = modifierPattern.exec(body)) !== null) {
    const value = parseFloat(m[1] ?? '')
    if (!Number.isFinite(value)) continue
    const modifierBody = m[2] ?? ''

    const conditions: Array<{ scope: string; childId: string }> = []
    const condPattern = /<condition\b([^/>]*)\/?>/gi
    let c: RegExpExecArray | null
    while ((c = condPattern.exec(modifierBody)) !== null) {
      const attrs = c[1] ?? ''
      const scope = /\bscope="([^"]+)"/i.exec(attrs)?.[1] ?? ''
      const childId = /\bchildId="([^"]+)"/i.exec(attrs)?.[1] ?? ''
      if (scope && childId) conditions.push({ scope, childId })
    }

    if (
      conditions.length === 1 &&
      conditions[0]!.scope === 'primary-catalogue' &&
      conditions[0]!.childId === importingCatalogueId
    ) {
      return Math.round(value)
    }
  }
  return undefined
}

// ---- Ability mapping ----

const ABILITY_KEYWORDS: Array<{ pattern: RegExp; create: (name: string) => WeaponAbility }> = [
  // Handle both "Sustained Hits 1" and "Sustained Hits (1)" formats
  {
    pattern: /sustained hits\s*\(?(\d+)\)?/i,
    create: (n) => {
      const m = /sustained hits\s*\(?(\d+)\)?/i.exec(n)
      return { type: 'SUSTAINED_HITS', value: m ? parseInt(m[1]!) : 1 }
    },
  },
  { pattern: /lethal hits/i, create: () => ({ type: 'LETHAL_HITS' }) },
  { pattern: /devastating wounds/i, create: () => ({ type: 'DEVASTATING_WOUNDS' }) },
  { pattern: /torrent/i, create: () => ({ type: 'TORRENT' }) },
  { pattern: /twin.linked/i, create: () => ({ type: 'TWIN_LINKED' }) },
  { pattern: /blast/i, create: () => ({ type: 'BLAST' }) },
  {
    pattern: /re-?roll\s+(all\s+)?hit\s+rolls?\s+of\s+1/i,
    create: () => ({ type: 'REROLL_HITS_OF_1' }),
  },
  {
    pattern: /re-?roll\s+(all\s+)?hit\s+rolls?(?!\s+of)/i,
    create: () => ({ type: 'REROLL_HITS' }),
  },
  { pattern: /re-?roll\s+(all\s+)?wound\s+rolls?/i, create: () => ({ type: 'REROLL_WOUNDS' }) },
  { pattern: /heavy/i, create: () => ({ type: 'HIT_MOD', value: 1 }) },
  // Handle both "Rapid Fire 1" and "Rapid Fire (1)" formats
  {
    pattern: /rapid fire\s*\(?(\d+)\)?/i,
    create: (n) => {
      const m = /rapid fire\s*\(?(\d+)\)?/i.exec(n)
      return { type: 'ATTACKS_MOD', value: m ? parseInt(m[1]!) : 1 }
    },
  },
  { pattern: /extra attacks/i, create: () => ({ type: 'ATTACKS_MOD', value: 0 }) },
  { pattern: /lance/i, create: () => ({ type: 'WOUND_MOD', value: 1 }) },
  // Anti-keyword X+ — improved wound roll vs keyword targets
  // Handle both "Anti-Infantry 4+" and "Anti-Infantry (4+)" formats
  {
    pattern: /anti-(.+?)\s*\(?(\d)\+\)?/i,
    create: (n) => {
      const m = /anti-(.+?)\s*\(?(\d)\+\)?/i.exec(n)
      return { type: 'ANTI', keyword: m?.[1]?.trim() ?? '', value: m ? parseInt(m[2]!) : 4 }
    },
  },
  // Melta X — bonus damage at half range
  // Handle both "Melta 2" and "Melta (2)" formats
  {
    pattern: /melta\s*\(?(\d+)\)?/i,
    create: (n) => {
      const m = /melta\s*\(?(\d+)\)?/i.exec(n)
      return { type: 'MELTA', value: m ? parseInt(m[1]!) : 1 }
    },
  },
  { pattern: /ignores cover/i, create: () => ({ type: 'IGNORES_COVER' }) },
  { pattern: /hazardous/i, create: () => ({ type: 'HAZARDOUS' }) },
  { pattern: /precision/i, create: () => ({ type: 'PRECISION' }) },
  { pattern: /indirect fire/i, create: () => ({ type: 'INDIRECT_FIRE' }) },
  { pattern: /\bassault\b/i, create: () => ({ type: 'ASSAULT' }) },
  { pattern: /\bpistol\b/i, create: () => ({ type: 'PISTOL' }) },
  { pattern: /one shot/i, create: () => ({ type: 'ONE_SHOT' }) },
  { pattern: /psychic/i, create: () => ({ type: 'PSYCHIC' }) },
]

function mapAbilityNames(names: string[]): WeaponAbility[] {
  const abilities: WeaponAbility[] = []
  for (const name of names) {
    for (const { pattern, create } of ABILITY_KEYWORDS) {
      if (pattern.test(name)) {
        abilities.push(create(name))
        break
      }
    }
  }
  return abilities
}

// ---- Helpers ----

function extractAttr(attrs: string, name: string): string {
  const pattern = new RegExp(`${name}="([^"]*)"`, 'i')
  return pattern.exec(attrs)?.[1] ?? ''
}

/** Like extractAttr but uses word boundary to avoid matching 'typeId' when searching for 'id'. */
function extractStandaloneAttr(attrs: string, name: string): string {
  const pattern = new RegExp(`\\b${name}="([^"]*)"`, 'i')
  return pattern.exec(attrs)?.[1] ?? ''
}

function parseStatNumber(value: string): number {
  // Strip trailing '+' (e.g. "3+", "4+"), quotes, inch marks, and common non-numeric markers
  const cleaned = value
    .replace(/\+$/, '')
    .replace(/["'"″″'']/g, '') // ASCII and Unicode quotes/inch marks
    .trim()
  if (
    cleaned === '' ||
    cleaned === '-' ||
    cleaned === '–' ||
    cleaned === '—' ||
    cleaned === 'N/A' ||
    cleaned === 'n/a' ||
    cleaned === '*'
  ) {
    return 0
  }
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? 0 : n
}

function parseDiceOrNumber(value: string): number | string {
  // Normalize: trim whitespace, collapse internal spaces, uppercase dice notation
  const trimmed = value.trim().replace(/\s+/g, '').toUpperCase()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  if (trimmed === '' || trimmed === '-' || trimmed === '–') return 1
  return trimmed // e.g. "D6", "2D6", "D3+1"
}

function parseRangeValue(value: string): number | 'melee' {
  const lower = value.toLowerCase().trim()
  if (lower === 'melee' || lower === '-' || lower === '') return 'melee'
  return parseStatNumber(value)
}
