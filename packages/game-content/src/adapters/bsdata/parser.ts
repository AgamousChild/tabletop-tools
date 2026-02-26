import type { UnitProfile, WeaponAbility, WeaponProfile } from '../../types.js'

/** Bump when parser output changes in a way that invalidates previously-imported data. */
export const PARSER_VERSION = 2

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
  errors: string[]
}

/**
 * Parse a BSData XML string (from a .cat or .gst file) into UnitProfile[].
 */
export function parseBSDataXml(xml: string, faction: string): ParseResult {
  const units: UnitProfile[] = []
  const errors: string[] = []

  // Stack-based extraction of <selectionEntry> to handle nested entries correctly.
  // The regex approach fails when <selectionEntry> elements are nested (the non-greedy
  // match captures the inner closing tag instead of the outer one).
  for (const entry of extractSelectionEntries(xml)) {
    const type = extractAttr(entry.attrs, 'type')
    if (type !== 'unit' && type !== 'model') continue

    const id = extractAttr(entry.attrs, 'id')
    const name = extractAttr(entry.attrs, 'name')
    if (!id || !name) continue

    try {
      const unit = parseUnitEntry(id, name, faction, entry.body, entry.fullBody)
      units.push(unit)
    } catch (err) {
      errors.push(`Failed to parse unit "${name}" (${id}): ${String(err)}`)
    }
  }

  return { units, errors }
}

/**
 * Stack-based extraction of top-level <selectionEntry> elements from XML.
 * Nested entries (e.g. type="model" inside a type="unit") are excluded — only
 * entries pushed when the stack is empty (depth 0) are emitted.
 * Nested <selectionEntry> blocks are stripped from the body so that
 * extractWeapons() only finds the outer unit's own weapons.
 */
function extractSelectionEntries(xml: string): Array<{ attrs: string; body: string; fullBody: string }> {
  const results: Array<{ attrs: string; body: string; fullBody: string }> = []
  const openTag = /<selectionEntry\b([^>]*)>/g
  const closeTag = /<\/selectionEntry>/g

  // Find all open and close tag positions
  type TagPos = { type: 'open'; index: number; end: number; attrs: string } | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(xml)) !== null) {
    // Skip self-closing tags like <selectionEntry ... />
    const fullMatch = xml.slice(m.index, m.index + m[0].length + 1)
    if (fullMatch.endsWith('/>')) continue
    tags.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: m[1] ?? '' })
  }
  while ((m = closeTag.exec(xml)) !== null) {
    tags.push({ type: 'close', index: m.index, end: m.index + m[0].length })
  }

  // Sort by position in the document
  tags.sort((a, b) => a.index - b.index)

  // Stack-based matching: pair each open tag with its matching close tag.
  // Only emit entries that were opened at depth 0 (stack empty before push).
  const stack: Array<{ attrs: string; bodyStart: number; depth: number }> = []
  for (const tag of tags) {
    if (tag.type === 'open') {
      const depth = stack.length
      stack.push({ attrs: tag.attrs, bodyStart: tag.end, depth })
    } else if (tag.type === 'close' && stack.length > 0) {
      const entry = stack.pop()!
      if (entry.depth === 0) {
        const fullBody = xml.slice(entry.bodyStart, tag.index)
        results.push({
          attrs: entry.attrs,
          body: stripNestedSelectionEntries(fullBody),
          fullBody,
        })
      }
    }
  }

  return results
}

/**
 * Remove all nested <selectionEntry>...</selectionEntry> blocks from a body string.
 * Uses the same stack-based approach to correctly handle nesting.
 */
function stripNestedSelectionEntries(body: string): string {
  const openTag = /<selectionEntry\b[^>]*>/g
  const closeTag = /<\/selectionEntry>/g

  type TagPos = { type: 'open'; index: number; end: number } | { type: 'close'; index: number; end: number }
  const tags: TagPos[] = []

  let m: RegExpExecArray | null
  while ((m = openTag.exec(body)) !== null) {
    const fullMatch = body.slice(m.index, m.index + m[0].length + 1)
    if (fullMatch.endsWith('/>')) continue
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
): UnitProfile {
  const stats = extractCharacteristics(body)
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
  const points = extractPoints(body)

  return {
    id,
    faction,
    name,
    move: parseStatNumber(stats['M'] ?? stats['Move'] ?? '0'),
    toughness: parseStatNumber(stats['T'] ?? stats['Toughness'] ?? '0'),
    save: parseStatNumber(stats['Sv'] ?? stats['Save'] ?? '0'),
    wounds: parseStatNumber(stats['W'] ?? stats['Wounds'] ?? '1'),
    leadership: parseStatNumber(stats['Ld'] ?? stats['Leadership'] ?? '6'),
    oc: parseStatNumber(stats['OC'] ?? stats['Objective Control'] ?? '1'),
    weapons,
    abilities,
    points,
  }
}

// ---- Characteristic extraction ----

function extractCharacteristics(body: string): Record<string, string> {
  const stats: Record<string, string> = {}

  const profilePattern =
    /<profile\b[^>]*type(?:Name)?="(?:Unit|Model)\s*Characteristics?"[^>]*>([\s\S]*?)<\/profile>/gi
  const profileMatch = profilePattern.exec(body)
  if (!profileMatch) return stats

  const charPattern =
    /<characteristic\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/characteristic>/g
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
  const charPattern =
    /<characteristic\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/characteristic>/g
  let m: RegExpExecArray | null
  while ((m = charPattern.exec(profileBody)) !== null) {
    stats[m[1]!.trim()] = m[2]!.trim()
  }
  return stats
}

function extractWeaponAbilityNames(profileBody: string): string[] {
  const special = ''
  const statsObj = extractWeaponCharacteristics(profileBody)
  const abilityText =
    statsObj['Abilities'] ?? statsObj['Special Rules'] ?? statsObj['Keywords'] ?? special
  if (!abilityText) return []
  return abilityText
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---- Ability name extraction ----

function extractAbilityNames(body: string): string[] {
  const names: string[] = []
  // Match entire opening tag and inspect attributes in any order
  const tagPattern = /<profile\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = tagPattern.exec(body)) !== null) {
    const attrs = m[1] ?? ''
    if (!/type(?:Name)?="Abilities"/i.test(attrs)) continue
    const nameMatch = /\bname="([^"]+)"/i.exec(attrs)
    if (nameMatch) names.push(nameMatch[1]!.trim())
  }
  return names
}

// ---- Points extraction ----

function extractPoints(body: string): number {
  const costPattern = /<cost\b[^>]*name="pts"[^>]*value="([^"]+)"/i
  const m = costPattern.exec(body)
  if (!m) return 0
  return Math.round(parseFloat(m[1] ?? '0'))
}

// ---- Ability mapping ----

const ABILITY_KEYWORDS: Array<{ pattern: RegExp; ability: WeaponAbility }> = [
  { pattern: /sustained hits\s*(\d+)/i, ability: { type: 'SUSTAINED_HITS', value: 1 } },
  { pattern: /lethal hits/i, ability: { type: 'LETHAL_HITS' } },
  { pattern: /devastating wounds/i, ability: { type: 'DEVASTATING_WOUNDS' } },
  { pattern: /torrent/i, ability: { type: 'TORRENT' } },
  { pattern: /twin.linked/i, ability: { type: 'TWIN_LINKED' } },
  { pattern: /blast/i, ability: { type: 'BLAST' } },
]

function mapAbilityNames(names: string[]): WeaponAbility[] {
  const abilities: WeaponAbility[] = []
  for (const name of names) {
    for (const { pattern, ability } of ABILITY_KEYWORDS) {
      if (pattern.test(name)) {
        // Special case: extract the value for SUSTAINED_HITS
        if (ability.type === 'SUSTAINED_HITS') {
          const valueMatch = /sustained hits\s*(\d+)/i.exec(name)
          abilities.push({ type: 'SUSTAINED_HITS', value: valueMatch ? parseInt(valueMatch[1]!) : 1 })
        } else {
          abilities.push(ability)
        }
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

function parseStatNumber(value: string): number {
  // Strip trailing '+' (e.g. "3+", "4+")
  const cleaned = value.replace(/\+$/, '').trim()
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? 0 : n
}

function parseDiceOrNumber(value: string): number | string {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  return trimmed  // e.g. "D6", "2D6", "D3+1"
}

function parseRangeValue(value: string): number | 'melee' {
  const lower = value.toLowerCase().trim()
  if (lower === 'melee' || lower === '-' || lower === '') return 'melee'
  return parseStatNumber(value)
}
